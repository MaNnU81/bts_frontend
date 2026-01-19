import { AfterViewInit, Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin, Subscription } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { LeafletService } from '../../services/leaflet-service';
import { StopEditorPanelComponent } from '../stop-editor-panel-component/stop-editor-panel-component';

import * as L from 'leaflet';
import 'leaflet-draw';

import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { DataService } from '../../services/data-service';
import { MatIconModule } from '@angular/material/icon';
import { LineEditorPanelComponent } from '../line-editor-panel-component/line-editor-panel-component';

type StopEditorMode = 'create' | 'edit';

type StopEditorState = {
  mode: StopEditorMode;
  stopId: number | null;
  name: string;
  lat: number | null;
  lng: number | null;
  layer: L.Marker | null;
};

type EditorPanel = 'stop' | 'line' | null;
type EditorMode = 'idle' | 'stop-edit' | 'line-create' | 'line-edit';

type StopRef = {
  id: number;
  name: string;
  lat: number;
  lng: number;
};

type StopIndexItem = StopRef;

@Component({
  selector: 'app-leaflet-add',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    CommonModule,
    MatSlideToggleModule,
    StopEditorPanelComponent,
    LineEditorPanelComponent,
  ],
  templateUrl: './leaflet-add.html',
  styleUrl: './leaflet-add.scss',
})
export class LeafletAdd implements AfterViewInit, OnDestroy {
  private map!: L.Map;
  private stopDrawControl?: L.Control.Draw;
  private lineDrawControl?: L.Control.Draw;
  private lineEditGroup!: L.FeatureGroup;
  private activeDrawTool: 'none' | 'stop' | 'line' = 'none';

  private createdDraft = new Map<
    string,
    { tempId: string; name: string; lat: number; lng: number }
  >();
  private updatedDraft = new Map<number, { id: number; name: string; lat: number; lng: number }>();
  private deletedDraft = new Set<number>();

  //per undo
  private baselineStopsById = new Map<number, { name: string; lat: number; lng: number }>();
  private deletedMarkersById = new Map<number, L.Marker>();

  private tmpCounter = 1;


  //search stops id e name

  stopIndex: StopIndexItem[] = [];
  lineSelectedStops: StopRef[] = [];
  lineSearch = '';
  private lineDraftPolyline?: L.Polyline;  //polyline bozza

  private stopsGeoLayer?: L.GeoJSON;
  private linesGeoLayer?: L.GeoJSON;

  private stopsGroup!: L.FeatureGroup;
  private linesGroup!: L.FeatureGroup;

  showFetchedStops = true;
  showFetchedLines = true;

  loading = true;
  error: string | null = null;

  editorState: StopEditorState | null = null;

  private sub?: Subscription;

  openPanel: EditorPanel = null;   
  editorMode: EditorMode = 'idle';


  //linee cliccabili
  public selectedLineLayer: L.Path | null = null;
  selectedLineInfo: { id: number | null; number?: number; direction?: string; route?: string } | null = null;

  //input linea 

  lineNumber: number | null = null;
  lineDirection = '';
  lineRoute = '';

  lineColor = '#FF9800';

  constructor(private dataService: DataService, private leafMapService: LeafletService) {}

  get pendingCount(): number {
    return this.createdDraft.size + this.updatedDraft.size + this.deletedDraft.size; //.size è il .length per map e set
  }

  private newTempId(): string {
    return `tmp-${Date.now()}-${this.tmpCounter++}`;
  }

  ngAfterViewInit(): void {
    const { map, stopsGroup, linesGroup } = this.leafMapService.init({
      elementId: 'leafletAddMap',
      center: [44.4072, 8.9338],
      zoom: 15,
    });

    this.map = map;
    this.stopsGroup = stopsGroup;
    this.linesGroup = linesGroup;
    

    this.initDrawAndEvents();
    this.loadGeoAndRender();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.leafMapService.destroy();
  }


private initDrawAndEvents(): void {
  // gruppo dedicato per edit line (conterrà SOLO la linea selezionata in line-edit)
  this.lineEditGroup = new L.FeatureGroup();
  this.map.addLayer(this.lineEditGroup);

  // --- STOP tools (marker only) ---
  this.stopDrawControl = new L.Control.Draw({
    edit: {
      featureGroup: this.stopsGroup,
      remove: true,
    },
    draw: {
      marker: {},
      polyline: false,
      polygon: false,
      rectangle: false,
      circle: false,
      circlemarker: false,
    } as any,
  });

  // --- LINE tools (per ora: SOLO EDIT sulla linea selezionata dentro lineEditGroup) ---
  this.lineDrawControl = new L.Control.Draw({
    edit: {
      featureGroup: this.lineEditGroup,
      remove: false,
    },
    draw: {
      polyline: false,
      marker: false,
      polygon: false,
      rectangle: false,
      circle: false,
      circlemarker: false,
    } as any,
  });

  // listeners UNA VOLTA, poi smisti
  this.map.on(L.Draw.Event.CREATED, (e: any) => this.onDrawCreated(e));
  this.map.on(L.Draw.Event.EDITED, (e: any) => this.onDrawEdited(e));
  this.map.on(L.Draw.Event.DELETED, (e: any) => this.onDrawDeleted(e));

  // stato iniziale: niente tools (li attivi via toggle panel)
  this.setActiveDrawTool('none');

  setTimeout(() => this.map.invalidateSize(), 0);
}

/** Switch dei controlli in alto a sinistra */
private setActiveDrawTool(tool: 'none' | 'stop' | 'line'): void {
  if (this.activeDrawTool === tool) return;

  // rimuovi entrambi (se presenti)
  if (this.stopDrawControl) this.map.removeControl(this.stopDrawControl);
  if (this.lineDrawControl) this.map.removeControl(this.lineDrawControl);

  // aggiungi quello richiesto
  if (tool === 'stop' && this.stopDrawControl) this.map.addControl(this.stopDrawControl);
  if (tool === 'line' && this.lineDrawControl) this.map.addControl(this.lineDrawControl);

  this.activeDrawTool = tool;
}

/** Dispatcher: chiama questo quando cambi openPanel/editorMode */
private syncDrawToolsWithUi(): void {
  if (this.openPanel === 'stop') {
    this.setActiveDrawTool('stop');
    return;
  }

  if (this.openPanel === 'line') {
    // in line-create: niente draw tools (costruisci la polyline unendo stop)
    // in line-edit: attiva tool linea
    this.setActiveDrawTool(this.editorMode === 'line-edit' ? 'line' : 'none');
    return;
  }

  this.setActiveDrawTool('none');
}

/** === DISPATCH DRAW EVENTS === */
private onDrawCreated(event: any): void {
  if (this.activeDrawTool === 'stop') {
    this.handleStopCreated(event);
    return;
  }

  if (this.activeDrawTool === 'line') {
    this.handleLineCreated(event);
    return;
  }
}

private onDrawEdited(event: any): void {
  if (this.activeDrawTool === 'stop') {
    this.handleStopEdited(event);
    return;
  }

  if (this.activeDrawTool === 'line') {
    this.handleLineEdited(event);
    return;
  }
}

private onDrawDeleted(event: any): void {
  if (this.activeDrawTool === 'stop') {
    this.handleStopDeleted(event);
    return;
  }

  if (this.activeDrawTool === 'line') {
    this.handleLineDeleted(event);
    return;
  }
}

/** === STOP HANDLERS (copiati dalla tua versione, uguali) === */
private handleStopCreated(event: any): void {
  const layer: L.Layer = event.layer;
  const layerType: string = event.layerType;

  if (layerType !== 'marker') return;

  // Aggiungo subito alla mappa
  this.stopsGroup.addLayer(layer);

  // Assicuro feature/properties
  (layer as any).feature = (layer as any).feature ?? { type: 'Feature', properties: {} };
  (layer as any).feature.properties = {
    ...(layer as any).feature.properties,
    kind: 'stop',
  };

  const tempId = this.newTempId();
  (layer as any).feature.properties.temp_id = tempId;
  this.leafMapService.setStopIconUpdated(layer as L.Marker);

  (layer as any).bindPopup?.(`(nuovo) temp_id: ${tempId}`);

  // click seleziona
  (layer as any).on('click', () => this.selectStopLayer(layer as L.Marker));

  // seleziono subito come "create"
  this.selectStopLayer(layer as L.Marker, true);
}

private handleStopEdited(e: any): void {
  e.layers.eachLayer((layer: any) => {
    if (!layer.getLatLng) return;

    const props = layer?.feature?.properties;
    const { lat, lng } = layer.getLatLng();

    // NUOVO marker
    if (props?.temp_id) {
      const tempId = props.temp_id as string;
      const existing = this.createdDraft.get(tempId);

      this.leafMapService.setStopIconUpdated(layer as L.Marker);

      // se non esiste ancora in draft, lo creo (ricordarsi di compilare name)
      this.createdDraft.set(tempId, {
        tempId,
        name: existing?.name ?? props.name ?? '',
        lat,
        lng,
      });

      // aggiorna sidebar se è selezionato
      if (this.editorState?.layer === layer) {
        const st = this.editorState;
        if (!st) return;
        st.lat = lat;
        st.lng = lng;
      }
      return;
    }

    // ESISTENTE (DB)
    if (props?.stop_id) {
      const id = Number(props.stop_id);
      const name = (props.name ?? '') as string;

      this.updatedDraft.set(id, { id, name, lat, lng });
      this.leafMapService.setStopIconUpdated(layer as L.Marker);

      if (this.editorState?.layer === layer) {
        const st = this.editorState;
        if (!st) return;
        st.lat = lat;
        st.lng = lng;
      }
    }
  });
}

private handleStopDeleted(e: any): void {
  e.layers.eachLayer((layer: any) => {
    const props = layer?.feature?.properties;

    // marker nuovo: elimina dal draft create
    if (props?.temp_id) {
      this.createdDraft.delete(props.temp_id);
      return;
    }

    // marker DB: segna delete
    if (props?.stop_id) {
      const id = Number(props.stop_id);
      this.deletedMarkersById.set(id, layer as L.Marker);
      this.deletedDraft.add(id);
      this.updatedDraft.delete(id); // se era anche in update, vince delete
      this.leafMapService.moveStopToDeleted(layer as L.Marker);
    }
  });

  // se avevi selezionato un marker cancellato
  if (this.editorState?.layer) {
    let stillThere = false;
    this.stopsGroup.eachLayer((l: any) => {
      if (l === this.editorState?.layer) stillThere = true;
    });
    if (!stillThere) this.editorState = null;
  }
}

/** === LINE HANDLERS (per ora vuoti/minimi) === */
private handleLineCreated(event: any): void {
  // per ora non disegniamo nuove linee a mano, quindi niente
}

private handleLineEdited(event: any): void {
  // Step successivo: qui leggeremo i latlngs della selectedLineLayer e li salveremo nel "draft line update"
}

private handleLineDeleted(event: any): void {
  // Step successivo (se mai abiliti remove line)
}


  private buildStopsBaselineFromGeoJson(stopsGeoJson: any): void {
    this.baselineStopsById.clear();

    if (stopsGeoJson?.type !== 'FeatureCollection' || !Array.isArray(stopsGeoJson.features)) return;

    for (const f of stopsGeoJson.features) {
      const id = f?.properties?.stop_id;
      const name = f?.properties?.name ?? '';
      const coords = f?.geometry?.coordinates;

      if (typeof id !== 'number' || !Array.isArray(coords) || coords.length < 2) continue;

      const lng = Number(coords[0]);
      const lat = Number(coords[1]);

      this.baselineStopsById.set(id, { name, lat, lng });
    }
  }

  private buildStopIndexFromgeoJson(stopsGeoJson: any): void {
    this.stopIndex = [];

    if(stopsGeoJson?.type !== 'FeatureCollection' || !Array.isArray(stopsGeoJson.features)) return;

    for (const f of stopsGeoJson.features) {
      const id = f?.properties?.stop_id;
      const name = (f?.properties?.name ?? '').toString();
      const coords = f?.geometry?.coordinates;

      if (typeof id !== 'number' || !Array.isArray(coords) || coords.length < 2) continue;
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);

      this.stopIndex.push({id, name, lat, lng});
    }
      this.stopIndex.sort((a, b) => a.id - b.id);

  }

  private loadGeoAndRender(): void {
    this.loading = true;
    this.error = null;

    this.sub?.unsubscribe();
    this.sub = forkJoin({
      stopsGeoJson: this.dataService.getStopsGeoJson(),
      linesGeoJson: this.dataService.getLinesGeoJson(),
    }).subscribe({
      next: ({ stopsGeoJson, linesGeoJson }) => {
        this.buildStopsBaselineFromGeoJson(stopsGeoJson);
        this.clearLineSelection();
        this.buildFetchedLayersFromData(stopsGeoJson, linesGeoJson);
        this.buildStopIndexFromgeoJson(stopsGeoJson);
        this.leafMapService.applyGeoVisibility(
          this.stopsGeoLayer,
          this.linesGeoLayer,
          this.showFetchedStops,
          this.showFetchedLines
        );
        this.leafMapService.fitToContent();
        this.loading = false;
      },
      error: (err) => {
        console.error('Errore caricamento geojson editor:', err);
        this.error = 'Impossibile caricare i GeoJSON dal backend.';
        this.loading = false;
      },
    });
  }

  onVisibilityChanged(): void {
    this.leafMapService.applyGeoVisibility(
      this.stopsGeoLayer,
      this.linesGeoLayer,
      this.showFetchedStops,
      this.showFetchedLines
    );
  }

  private buildFetchedLayersFromData(stopsGeoJson: any, linesGeoJson: any): void {
    try {
      // STOPS
      if (stopsGeoJson?.type === 'FeatureCollection') {
        this.stopsGeoLayer = L.geoJSON(stopsGeoJson, {
          pointToLayer: (feature: any, latlng) => L.marker(latlng),
          onEachFeature: (feature: any, layer: any) => {
            this.leafMapService.setStopIconNormal(layer as L.Marker);
            const id = feature?.properties?.stop_id;
            const name = feature?.properties?.name;

            if (id != null && layer.bindPopup) {
              layer.bindPopup(`stop_id: ${id}${name ? `<br/>${name}` : ''}`);
            }

            layer.on('click', () => this.onStopMarkerClicked(layer as L.Marker));
          },
        });
      } else {
        this.stopsGeoLayer = undefined;
      }

      // LINES
      if (linesGeoJson?.type === 'FeatureCollection') {
        this.linesGeoLayer = L.geoJSON(linesGeoJson, {
          style: (feature: any) => {
            const color = feature?.properties?.color ?? '#1E88E5';
            return { color, weight: 5, opacity: 0.9  };
          },
          onEachFeature: (feature: any, layer: any) => {
            const id = feature?.properties?.transport_line_id;
            const number = feature?.properties?.number;
            const direction = feature?.properties?.direction;


            //tolgo il popUp alle linee per problemi con il click select (aggiungo pero info in input)
            // if (layer.bindPopup && id != null) {
            //   const label =
            //     number != null
            //       ? `line ${number}${direction ? ` (${direction})` : ''}`
            //       : `transport_line_id: ${id}`;
            //   layer.bindPopup(label);
            // }

            layer.on('click', () => this.onLineLayerClicked(layer as L.Path));
          },
        });
      } else {
        this.linesGeoLayer = undefined;
      }
    } catch (e) {
      console.warn('GeoJSON non valido o errore parsing:', e);
      this.stopsGeoLayer = undefined;
      this.linesGeoLayer = undefined;
    }
  }

  private onStopMarkerClicked(marker: L.Marker): void {
    const props = (marker as any)?.feature?.properties ?? {};

    if(this.openPanel === 'line' && this.editorMode === 'line-create') {
    const id = Number(props?.stop_id);
    if(!Number.isFinite(id)) return;
    this.addStopToLineById(id);
    return;
    }
    this.selectStopLayer(marker);
  }



  private selectStopLayer(layer: L.Marker, forceCreateMode = false): void {
    if (this.openPanel === 'line') return;
    const props = (layer as any)?.feature?.properties ?? {};
    const latlng = layer.getLatLng?.();

    const stopId = props?.stop_id ?? null;
    const name = props?.name ?? '';

    this.editorState = {
      mode: forceCreateMode || !stopId ? 'create' : 'edit',
      stopId,
      name,
      lat: latlng?.lat ?? null,
      lng: latlng?.lng ?? null,
      layer,
    };
  }

  // Sidebar actions (per ora solo UI)
  cancelSelection(): void {
    // se era un marker nuovo (senza stop_id) e annulli, lo rimuovo
    if (this.editorState?.mode === 'create' && this.editorState.layer) {
      const props = (this.editorState.layer as any)?.feature?.properties;
      if (!props?.stop_id) {
        this.stopsGroup.removeLayer(this.editorState.layer);
      }
    }
    this.editorState = null;
  }

  applyStopToDraft(): void {
    const st = this.editorState;
    if (!st || !st.layer) return;

    const layer = st.layer;
    const props = (layer as any).feature?.properties ?? {};
    const name = (st.name ?? '').trim();
    const latlng = layer.getLatLng();

    // aggiorna properties locali (così click/popup sono coerenti)
    (layer as any).feature = (layer as any).feature ?? { type: 'Feature', properties: {} };
    (layer as any).feature.properties = {
      ...(layer as any).feature.properties,
      kind: 'stop',
      name,
    };

    // NUOVO
    if (props.temp_id) {
      const tempId = props.temp_id as string;
      this.createdDraft.set(tempId, { tempId, name, lat: latlng.lat, lng: latlng.lng });
      layer.bindPopup?.(`(nuovo) ${name}`);
      return;
    }

    // ESISTENTE
    if (props.stop_id) {
      const id = Number(props.stop_id);
      // se era marcato delete, lo togli (l’utente sta “risuscitando”)
      this.deletedDraft.delete(id);
      this.updatedDraft.set(id, { id, name, lat: latlng.lat, lng: latlng.lng });
      layer.bindPopup?.(`stop_id: ${id}<br/>${name}`);

      this.leafMapService.setStopIconUpdated(layer);
    }
  }

  saveLineDraft(): void {
  // 1) deve esistere una bozza (almeno 2 stop)
  if (this.lineSelectedStops.length < 2) {
    alert('Servono almeno 2 fermate per creare una linea.');
    return;
  }

  // 2) assicurati che la polyline esista e sia aggiornata
  this.refreshLineDraftPolyline();
  if (!this.lineDraftPolyline) return;

  // 3) marca la bozza come "draft salvata" (metadata completi)
  (this.lineDraftPolyline as any).feature = (this.lineDraftPolyline as any).feature ?? {
    type: 'Feature',
    properties: {}
  };

  const props = (this.lineDraftPolyline as any).feature.properties ?? {};
  props.kind = 'line-draft';
  props.color = this.lineColor;
  props.number = this.lineNumber;
  props.direction = this.lineDirection;
  props.route = this.lineRoute;

  (this.lineDraftPolyline as any).feature.properties = props;

  // 4) rende la bozza selezionabile "ufficialmente"
  // (se il click handler già c’è, ok; altrimenti lo ri-attacchi una volta)
  this.lineDraftPolyline.off('click');
  this.lineDraftPolyline.on('click', (e: any) => {
    L.DomEvent.stop(e);
    this.selectLineLayer(this.lineDraftPolyline as any);
  });

  // 5) dopo salvataggio in draft, selezionala (così puoi premere subito Modifica)
  this.selectLineLayer(this.lineDraftPolyline as any);

  alert('Linea salvata in draft (solo locale).');
}


  saveAllToDb(): void {
    const payload = {
      create: Array.from(this.createdDraft.values()),
      update: Array.from(this.updatedDraft.values()),
      delete: Array.from(this.deletedDraft.values()),
    };

    if (payload.create.length === 0 && payload.update.length === 0 && payload.delete.length === 0) {
      alert('Nessuna modifica da salvare.');
      return;
    }

    this.dataService.applyStopBatch(payload).subscribe({
      next: (res) => {
        // 1) created: tempId -> id
        for (const c of res.created) {
          const marker = this.leafMapService.findStopMarkerByTempId(c.tempId);
          if (!marker) continue;

          const props = (marker as any).feature?.properties ?? {};
          props.stop_id = c.id;
          props.name = c.name;
          delete props.temp_id;

          (marker as any).feature = (marker as any).feature ?? { type: 'Feature', properties: {} };
          (marker as any).feature.properties = props;

          marker.bindPopup?.(`stop_id: ${c.id}<br/>${c.name}`);
          this.leafMapService.setStopIconNormal(marker);
        }

        for (const u of res.updated) {
          const marker = this.leafMapService.findStopMarkerByStopId(u.id);
          if (!marker) continue;

          const props = (marker as any).feature?.properties ?? {};
          props.name = u.name ?? props.name;

          (marker as any).feature.properties = props;
          marker.bindPopup?.(`stop_id: ${u.id}<br/>${props.name}`);
          this.leafMapService.setStopIconNormal(marker);
        }

        for (const id of res.deleted) {
          const m = this.deletedMarkersById.get(id);
          if (m) {
            this.leafMapService.getDeletedGhostGroup().removeLayer(m);
            this.deletedMarkersById.delete(id);
          }
        }
        // pulizia draft
        this.createdDraft.clear();
        this.updatedDraft.clear();
        this.deletedDraft.clear();
        this.deletedMarkersById.clear();
        this.editorState = null;

        // ✅ reset view (evita duplicati) + reload baseline/layers
        this.stopsGroup.clearLayers();
        this.linesGroup.clearLayers();
        this.leafMapService.getDeletedGhostGroup().clearLayers();
        this.stopsGeoLayer = undefined;
        this.linesGeoLayer = undefined;

        this.loadGeoAndRender();

        alert('Salvataggio completato (batch).');
      },
      error: (err) => {
        const msg = err?.error?.message ?? 'Errore durante il salvataggio batch.';
        alert(msg);
      },
    });
  }

  markDeleteCurrent(): void {
    const st = this.editorState;
    if (!st || !st.layer || st.stopId == null) return;

    const id = st.stopId;

    // marca delete
    this.deletedDraft.add(id);

    // se era in update, vince delete
    this.updatedDraft.delete(id);

    this.deletedMarkersById.set(id, st.layer);
    this.leafMapService.moveStopToDeleted(st.layer);
    // // rimuovi dalla mappa
    // this.stopsGroup.removeLayer(st.layer);

    // reset editor
    this.editorState = null;
  }

  restoreCurrentStop(): void {
    const st = this.editorState;
    if (!st || !st.layer) return;

    const layerAny: any = st.layer;
    const props = layerAny?.feature?.properties ?? {};

    // 1) se è un marker nuovo (temp_id) => annulla la creazione
    if (props.temp_id) {
      this.createdDraft.delete(props.temp_id);
      this.stopsGroup.removeLayer(st.layer);
      this.editorState = null;
      return;
    }

    // 2) marker DB
    if (st.stopId == null) return;
    const id = st.stopId;

    // se era in delete, lo rimetti in mappa
    if (this.deletedDraft.has(id)) {
      const deletedMarker = this.deletedMarkersById.get(id);
      if (deletedMarker) this.leafMapService.restoreStopFromDeleted(deletedMarker); //non so se giusto

      this.deletedDraft.delete(id);
      this.deletedMarkersById.delete(id);
    }

    // baseline
    const base = this.baselineStopsById.get(id);
    if (!base) return;

    // ripristina posizione
    st.layer.setLatLng([base.lat, base.lng]);

    // ripristina nome in properties
    layerAny.feature = layerAny.feature ?? { type: 'Feature', properties: {} };
    layerAny.feature.properties = {
      ...layerAny.feature.properties,
      name: base.name,
    };

    // aggiorna pannello
    st.name = base.name;
    st.lat = base.lat;
    st.lng = base.lng;

    // rimuove eventuale update pendente
    this.updatedDraft.delete(id);
    this.leafMapService.setStopIconNormal(st.layer);

    // popup coerente
    st.layer.bindPopup?.(`stop_id: ${id}<br/>${base.name}`);
  }

  resetAllDraftChanges(): void {
    // 1) rimuovi marker nuovi (temp_id)
    const tempMarkers: L.Marker[] = [];
    this.stopsGroup.eachLayer((l: any) => {
      const props = l?.feature?.properties;
      if (props?.temp_id) tempMarkers.push(l as L.Marker);
    });
    tempMarkers.forEach((m) => this.stopsGroup.removeLayer(m));

    // 2) ripristina delete: rimetti marker DB eliminati
    for (const id of this.deletedDraft.values()) {
      const marker = this.deletedMarkersById.get(id);
      if (marker) this.leafMapService.restoreStopFromDeleted(marker);
    }

    // 3) ripristina update: torna ai valori baseline
    for (const [id] of this.updatedDraft) {
      const base = this.baselineStopsById.get(id);
      if (!base) continue;

      const marker = this.leafMapService.findStopMarkerByStopId(id);
      if (!marker) continue;

      marker.setLatLng([base.lat, base.lng]);
      this.leafMapService.setStopIconNormal(marker);

      const anyMarker: any = marker;
      anyMarker.feature = anyMarker.feature ?? { type: 'Feature', properties: {} };
      anyMarker.feature.properties = {
        ...anyMarker.feature.properties,
        name: base.name,
      };

      marker.bindPopup?.(`stop_id: ${id}<br/>${base.name}`);
    }

    // 4) svuota draft + cache delete
    this.createdDraft.clear();
    this.updatedDraft.clear();
    this.deletedDraft.clear();
    this.deletedMarkersById.clear();

    // 5) reset UI
    this.editorState = null;
  }

  //panel

toggleStopPanel(): void {
  if (this.openPanel === 'stop') {
    this.openPanel = null;
    this.editorMode = 'idle';
  } else {
    this.openPanel = 'stop';
    this.editorMode = 'stop-edit';
  }
  this.syncDrawToolsWithUi();
}

toggleLinePanel(): void {
  if (this.openPanel === 'line') {
    this.openPanel = null;
    this.editorMode = 'idle';
  } else {
    this.openPanel = 'line';
    this.editorMode = 'line-create';
  }
   this.syncDrawToolsWithUi();
}


//FUNZIONI di gestione aggiunt/rimozione/reorder stop nella linea in creazione


public refreshLineDraftPolyline(): void {

  const latlngs: L.LatLngExpression[] = this.lineSelectedStops.map(s => [s.lat, s.lng]);

  // se meno di 2 punti: niente linea
  if(latlngs.length <2) {
    if(this.lineDraftPolyline){
      this.linesGroup.removeLayer(this.lineDraftPolyline);
      this.lineDraftPolyline = undefined;
    }
    return;
  }
//se non esiste crea e aggiungi al grouplines
if (!this.lineDraftPolyline) {


  this.lineDraftPolyline = L.polyline(latlngs, { weight: 4, opacity: 0.7, color: this.lineColor } as any);

  // ✅ feature/properties per riusare restoreLineStyle / info
  (this.lineDraftPolyline as any).feature = {
    type: 'Feature',
    properties: {
      kind: 'line-draft',
      color: '#FF9800', // arancione draft, opzionale
      number: this.lineNumber,
      direction: this.lineDirection,
      route: this.lineRoute,
    }
  };

  // ✅ click: seleziona la draft line
  this.lineDraftPolyline.on('click', (e: any) => {
    L.DomEvent.stop(e);
    this.selectLineLayer(this.lineDraftPolyline as any);
  });

  this.linesGroup.addLayer(this.lineDraftPolyline);
  return;
}
//se esiste aggiorna
  this.lineDraftPolyline.setLatLngs(latlngs);
  this.lineDraftPolyline.setStyle({ color: this.lineColor } as any);

    const props = (this.lineDraftPolyline as any)?.feature?.properties;
  if (props) {
    props.number = this.lineNumber;
    props.direction = this.lineDirection;
    props.route = this.lineRoute;
  }
}

addStopToLineById(stopId: number): void {
  const stop = this.stopIndex.find(s => s.id === stopId);

  if (!stop) return;

  if(this.lineSelectedStops.some(s => s.id === stopId)) return; //già presente

  this.lineSelectedStops.push({...stop});

  this.refreshLineDraftPolyline();
}

removeStopFromLine(index: number): void {
  if(index <0 || index >= this.lineSelectedStops.length) return;

  this.lineSelectedStops.splice(index, 1);
  this.refreshLineDraftPolyline();
}

moveStopUp(index: number): void {
  if(index <=0 || index >= this.lineSelectedStops.length) return;
  const temp = this.lineSelectedStops[index -1];;
  this.lineSelectedStops[index -1] = this.lineSelectedStops[index];
  this.lineSelectedStops[index] = temp;
  this.refreshLineDraftPolyline();
}

moveStopDown(index: number): void {
  if(index <0 || index >= this.lineSelectedStops.length -1) return;
  const temp = this.lineSelectedStops[index +1];;
  this.lineSelectedStops[index +1] = this.lineSelectedStops[index];
  this.lineSelectedStops[index] = temp;
  this.refreshLineDraftPolyline();
}

get lineSearchResults(): StopIndexItem[] {
  const q = (this.lineSearch ?? '').trim().toLowerCase();
  if (!q) return [];

  const isId = /^\d+$/.test(q);
  const results = this.stopIndex.filter(s => {
    if (isId) return s.id === Number(q);
    return s.name.toLowerCase().includes(q) || String(s.id).includes(q);
  });

  return results.slice(0, 20);
}

//linee cliccabili

private onLineLayerClicked(layer: L.Path): void {
  this.selectLineLayer(layer);
}

private selectLineLayer(layer: L.Path): void {
  if (this.selectedLineLayer === layer) {
    this.clearLineSelection();
    return;
  }

  this.restoreLineStyle(this.selectedLineLayer);
  this.selectedLineLayer = layer;
  this.applySelectedLineStyle(layer);

  const props = (layer as any)?.feature?.properties ?? {};
  const id = props?.transport_line_id != null ? Number(props.transport_line_id) : null;

  this.selectedLineInfo = {
    id,
    number: props?.number != null ? Number(props.number) : undefined,
    direction: props?.direction ?? undefined,
    route: props?.route ?? undefined,
  };

  // ✅ riempi gli input del pannello
  this.lineNumber =
    props?.number != null && props.number !== ''
      ? Number(props.number)
      : null;

  this.lineDirection = (props?.direction ?? '').toString();
  this.lineRoute = (props?.route ?? '').toString();
}

private clearLineSelection(): void {
  this.restoreLineStyle(this.selectedLineLayer);
  this.selectedLineLayer = null;
  this.selectedLineInfo = null;

  this.lineNumber = null;
this.lineDirection = '';
this.lineRoute = '';
}

private applySelectedLineStyle(layer: L.Path): void {
  
  layer.setStyle({ weight: 7, opacity: 1,  dashArray: '4 12' } as any);
}

private restoreLineStyle(layer: L.Path | null): void {
  if (!layer) return;

  // ripristino in modo deterministico usando le properties della feature (come nello style callback)
  const props = (layer as any)?.feature?.properties ?? {};
  const color = props?.color ?? '#1E88E5';
  layer.setStyle({ color, weight: 5, opacity: 0.9, dashArray: null, } as any);
}

enterLineEditMode(): void {
  if (!this.selectedLineLayer) {
    alert('Seleziona prima una linea sulla mappa.');
    return;
  }
  this.editorMode = 'line-edit';
  this.lineEditGroup.clearLayers();
  this.lineEditGroup.addLayer(this.selectedLineLayer);

  this.syncDrawToolsWithUi();
}

exitLineEditMode(): void {
  this.editorMode = 'line-create';
  this.lineEditGroup.clearLayers();
  this.syncDrawToolsWithUi();
}

}
