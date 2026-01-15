import { AfterViewInit, Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, Subscription } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { LeafletService } from '../../services/leaflet-service';
import { StopEditorPanelComponent } from '../stop-editor-panel-component/stop-editor-panel-component';

import * as L from 'leaflet';
import 'leaflet-draw';

import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { DataService } from '../../services/data-service';
import { MatDivider } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import {
  LineEditorPanelComponent,
} from '../line-editor-panel-component/line-editor-panel-component';
import { N } from '@angular/cdk/keycodes';

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
    MatInputModule,
    MatSelectModule,
    MatFormFieldModule,
    MatButtonModule,
    MatIconModule,
    CommonModule,
    FormsModule,
    MatSlideToggleModule,
    StopEditorPanelComponent,
    LineEditorPanelComponent,
  ],
  templateUrl: './leaflet-add.html',
  styleUrl: './leaflet-add.scss',
})
export class LeafletAdd implements AfterViewInit, OnDestroy {
  private map!: L.Map;

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
  private selectedLineLayer: L.Path | null = null;
  selectedLineInfo: { id: number | null; number?: number; direction?: string; route?: string } | null = null;

  //input linea 

  lineNumber: number | null = null;
  lineDirection = '';
  lineRoute = '';

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
    // Draw: SOLO MARKER

    const drawControl = new L.Control.Draw({
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

    this.map.addControl(drawControl as any);
    this.map.on(L.Draw.Event.EDITED, (e: any) => {
      e.layers.eachLayer((layer: any) => {
        if (!layer.getLatLng) return;

        const props = layer?.feature?.properties;
        const { lat, lng } = layer.getLatLng();

        // NUOVO marker
        if (props?.temp_id) {
          const tempId = props.temp_id as string;
          const existing = this.createdDraft.get(tempId);
          this.leafMapService.setStopIconUpdated(layer as L.Marker);

          // se non esiste ancora in draft, lo creo (ricordaresi di compilare name)
          this.createdDraft.set(tempId, {
            tempId,
            name: existing?.name ?? props.name ?? '',
            lat,
            lng,
          });

          // aggiorna sidebar se è selezionato
          if (this.editorState?.layer === layer) {
            const st = this.editorState; // snapshot
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
            const st = this.editorState; // snapshot
            if (!st) return;
            st.lat = lat;
            st.lng = lng;
          }
        }
      });
    });

    // CREATE marker -> draft + sidebar
    this.map.on(L.Draw.Event.CREATED, (event: any) => {
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
    });

    // DELETE
    this.map.on(L.Draw.Event.DELETED, (e: any) => {
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
    });

    setTimeout(() => this.map.invalidateSize(), 0);
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
            return { color, weight: 7, opacity: 0.9  };
          },
          onEachFeature: (feature: any, layer: any) => {
            const id = feature?.properties?.transport_line_id;
            const number = feature?.properties?.number;
            const direction = feature?.properties?.direction;

            if (layer.bindPopup && id != null) {
              const label =
                number != null
                  ? `line ${number}${direction ? ` (${direction})` : ''}`
                  : `transport_line_id: ${id}`;
              layer.bindPopup(label);
            }

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
}

toggleLinePanel(): void {
  if (this.openPanel === 'line') {
    this.openPanel = null;
    this.editorMode = 'idle';
  } else {
    this.openPanel = 'line';
    this.editorMode = 'line-create';
  }
}


//FUNZIONI di gestione aggiunt/rimozione/reorder stop nella linea in creazione


private refreshLineDraftPolyline(): void {

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
  if(!this.lineDraftPolyline){
    this.lineDraftPolyline = L.polyline(latlngs, {weight: 4, opacity: 0.7}as any);
    this.linesGroup.addLayer(this.lineDraftPolyline);
    return;
  }
//se esiste aggiorna
  this.lineDraftPolyline.setLatLngs(latlngs);
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
  // 1) se clicchi la stessa linea: toggle (facoltativo)
  if (this.selectedLineLayer === layer) {
    this.clearLineSelection();
    return;
  }

  // 2) ripristina stile della precedente selezionata
  this.restoreLineStyle(this.selectedLineLayer);

  // 3) imposta nuova selezione
  this.selectedLineLayer = layer;

  // 4) highlight (solo visivo)
  this.applySelectedLineStyle(layer);

  // 5) info per UI (facoltativo)
  const props = (layer as any)?.feature?.properties ?? {};
  const id = props?.transport_line_id != null ? Number(props.transport_line_id) : null;

  this.selectedLineInfo = {
    id,
    number: props?.number != null ? Number(props.number) : undefined,
    direction: props?.direction ?? undefined,
    route: props?.route ?? undefined,
  };
}

private clearLineSelection(): void {
  this.restoreLineStyle(this.selectedLineLayer);
  this.selectedLineLayer = null;
  this.selectedLineInfo = null;
}

private applySelectedLineStyle(layer: L.Path): void {
  // highlight semplice: aumenta weight e opacity
  layer.setStyle({ weight: 7, opacity: 1,  dashArray: '4 12' } as any);
}

private restoreLineStyle(layer: L.Path | null): void {
  if (!layer) return;

  // ripristino in modo deterministico usando le properties della feature (come nello style callback)
  const props = (layer as any)?.feature?.properties ?? {};
  const color = props?.color ?? '#1E88E5';
  layer.setStyle({ color, weight: 7, opacity: 0.9, dashArray: null, } as any);
}


}
