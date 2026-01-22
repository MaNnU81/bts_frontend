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
import { MatDialog } from '@angular/material/dialog';
import {
  ConfirmExitLineEditDialogComponent,
  ExitLineEditChoice
} from '../confirm-exit-line-edit-dialog-component/confirm-exit-line-edit-dialog-component';

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
  private lineDraftPolyline?: L.Polyline; //polyline bozza
  
  private stopsGeoLayer?: L.GeoJSON;
  private linesGeoLayer?: L.GeoJSON;

  private stopsGroup!: L.FeatureGroup;
  private linesGroup!: L.FeatureGroup;
  private lineHintPopup?: L.Popup;

  private lineEditTargetLayer: L.Path | null = null;     // layer "view" originale (DB o draft)

  private lineEditCommittedLatLngs: L.LatLng[] | null = null;
  private lineEditCommittedMeta: {
    number: number | null;
    direction: string;
    route: string;
    color: string;
  } | null = null;
  

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

  //input linea

  lineNumber: number | null = null;
  lineDirection = '';
  lineRoute = '';

  lineColor = '#FF9800';

  private lineEditBaselineLatLngs: L.LatLng[] | null = null;
  private lineEditBaselineMeta: {
    number: number | null;
    direction: string;
    route: string;
    color: string;
  } | null = null;

  private lineUpdatesDraft = new Map<
    number,
    {
      id: number;
      number: number | null;
      direction: string;
      route: string;
      color: string;
      latlngs: any[];
    }
  >();

  constructor(
    private dataService: DataService,
    private leafMapService: LeafletService,
    private dialog: MatDialog,
  ) {}

  get pendingCount(): number {
    return this.createdDraft.size + this.updatedDraft.size + this.deletedDraft.size; //.size è il .length per map e set
  }

  get pendingLineCount(): number {
    const draftNew = this.isDraftLineSaved() ? 1 : 0;
    const draftUpdates = this.lineUpdatesDraft.size;
    return draftNew + draftUpdates;
  }

  private isDraftLineSaved(): boolean {
    const props = (this.lineDraftPolyline as any)?.feature?.properties;
    return !!this.lineDraftPolyline && props?.kind === 'line-draft';
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

  /** === STOP HANDLERS === */
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
    // per ora non disegno nuove linee a mano, quindi niente
  }

  private handleLineEdited(event: any): void {
    event.layers.eachLayer((layer: any) => {
    if (layer && typeof layer.redraw === 'function') {
      layer.redraw(); // forzo redraw SVG
    }
  });

  // riallinea stile selezionato (se vuoi)
  if (this.selectedLineLayer) {
    this.applySelectedLineStyle(this.selectedLineLayer);
  }
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

    if (stopsGeoJson?.type !== 'FeatureCollection' || !Array.isArray(stopsGeoJson.features)) return;

    for (const f of stopsGeoJson.features) {
      const id = f?.properties?.stop_id;
      const name = (f?.properties?.name ?? '').toString();
      const coords = f?.geometry?.coordinates;

      if (typeof id !== 'number' || !Array.isArray(coords) || coords.length < 2) continue;
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);

      this.stopIndex.push({ id, name, lat, lng });
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
          this.showFetchedLines,
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
      this.showFetchedLines,
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
            return { color, weight: 5, opacity: 0.9 };
          },
          onEachFeature: (feature: any, layer: any) => {
            // const id = feature?.properties?.transport_line_id;
            // const number = feature?.properties?.number;
            // const direction = feature?.properties?.direction;

            //tolgo il popUp alle linee per problemi con il click select (aggiungo pero info in input)
            // if (layer.bindPopup && id != null) {
            //   const label =
            //     number != null
            //       ? `line ${number}${direction ? ` (${direction})` : ''}`
            //       : `transport_line_id: ${id}`;
            //   layer.bindPopup(label);
            // }

            layer.on('click', (e: any) => this.onLineLayerClicked(layer as L.Path, e));
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

    if (this.openPanel === 'line' && this.editorMode === 'line-create') {
      const id = Number(props?.stop_id);
      if (!Number.isFinite(id)) return;
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

  private createWorkingCloneFromTarget(target: L.Path): L.Polyline | null {
  // target deve essere una polyline (le tue linee lo sono)
  const asAny: any = target as any;
  if (typeof asAny.getLatLngs !== 'function') return null;

  const latlngs = asAny.getLatLngs() as any[];

  // stile: usa il colore corrente in UI (già caricato da selectLineLayer)
  const clone = L.polyline(latlngs as any, {
    weight: 5,
    opacity: 0.9,
    color: this.lineColor,
  } as any);

  // copia feature/properties per continuare a usare kind / transport_line_id / ecc.
  const props = (target as any)?.feature?.properties ?? {};
  (clone as any).feature = {
    type: 'Feature',
    properties: { ...props },
  };

  return clone;
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
      properties: {},
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

  private getEditedPolylineFromEditGroup(): L.Polyline | null {
    let found: L.Polyline | null = null;
    this.lineEditGroup.eachLayer((l: any) => {
      if (l && typeof l.getLatLngs === 'function') {
        found = l as L.Polyline;
      }
    });
    return found;
  }

saveEditedLineToDraft(): void {
  if (this.editorMode !== 'line-edit') return;

  const working = this.getEditedPolylineFromEditGroup();
  if (!working) {
    alert('Nessuna linea in modifica.');
    return;
  }

  const target = this.lineEditTargetLayer;
  if (!target) {
    alert('Target linea non trovato.');
    return;
  }

  // 1) latlng aggiornati (dalla clone)
  const latlngs = working.getLatLngs() as any[];

  // 2) capisco se target era draft o DB
  const tProps = (target as any)?.feature?.properties ?? {};
  const isDraft = tProps?.kind === 'line-draft';
  const id = tProps?.transport_line_id != null ? Number(tProps.transport_line_id) : null;

  // === CASO DRAFT (nuova linea) ===
  if (isDraft && this.lineDraftPolyline) {
    this.lineDraftPolyline.setLatLngs(latlngs);

    (this.lineDraftPolyline as any).feature = (this.lineDraftPolyline as any).feature ?? {
      type: 'Feature',
      properties: {},
    };

    const p = (this.lineDraftPolyline as any).feature.properties ?? {};
    p.kind = 'line-draft';
    p.color = this.lineColor;
    p.number = this.lineNumber;
    p.direction = this.lineDirection;
    p.route = this.lineRoute;
    (this.lineDraftPolyline as any).feature.properties = p;

    this.lineDraftPolyline.setStyle({ color: this.lineColor, opacity: 0.9, weight: 5 } as any);
    this.markLineEditCommittedFromCurrent();
    alert('Modifiche salvate nella linea draft.');
    return;
  }

  // === CASO DB ===
  if (!id) {
    alert('Linea selezionata non ha transport_line_id (non posso salvarla come update).');
    return;
  }

  this.lineUpdatesDraft.set(id, {
    id,
    number: this.lineNumber,
    direction: this.lineDirection,
    route: this.lineRoute,
    color: this.lineColor,
    latlngs,
  });
  this.markLineEditCommittedFromCurrent();
  alert('Modifiche salvate come draft update (linea DB).');
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

 resetAllLineDraftChanges(): void {
  // 1) se sono in edit, esco (rimette la linea nel linesGroup e pulisce baseline)
  if (this.editorMode === 'line-edit') {
    this.exitLineEditMode();
  }

  // 2) tolgo stile selezione dalla linea attuale (se c'era)
  this.restoreLineStyle(this.selectedLineLayer);
  this.selectedLineLayer = null;

  // 3) cancello tutti i draft update linee DB
  this.lineUpdatesDraft.clear();

  // 4) ripristino subito lo stile baseline di TUTTE le linee visibili in mappa
  this.linesGroup.eachLayer((l: any) => {
    if (!l || typeof l.setStyle !== 'function') return;
    this.restoreLineStyle(l as L.Path); // ora non trova draft -> baseline
  });

  // 5) rimuovo la bozza polyline (nuova linea)
  if (this.lineDraftPolyline) {
    this.linesGroup.removeLayer(this.lineDraftPolyline);
    this.lineDraftPolyline = undefined;
  }

  // 6) reset sequenza stop + ricerca
  this.lineSelectedStops = [];
  this.lineSearch = '';

  // 7) reset metadati UI (nuova linea)
  this.lineNumber = null;
  this.lineDirection = '';
  this.lineRoute = '';
  this.lineColor = '#FF9800';

  // 8) torno in modalità create (se il pannello line è aperto)
  if (this.openPanel === 'line') {
    this.editorMode = 'line-create';
  } else {
    this.editorMode = 'idle';
  }

  // 9) riallineo tool draw con UI
  this.syncDrawToolsWithUi();

  alert('Modifiche linee (draft) resettate.');
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
    const latlngs: L.LatLngExpression[] = this.lineSelectedStops.map((s) => [s.lat, s.lng]);

    // se meno di 2 punti: niente linea
    if (latlngs.length < 2) {
      if (this.lineDraftPolyline) {
        this.linesGroup.removeLayer(this.lineDraftPolyline);
        this.lineDraftPolyline = undefined;
      }
      return;
    }
    //se non esiste crea e aggiungi al grouplines
    if (!this.lineDraftPolyline) {
      this.lineDraftPolyline = L.polyline(latlngs, {
        weight: 4,
        opacity: 0.7,
        color: this.lineColor,
      } as any);

      // ✅ feature/properties per riusare restoreLineStyle / info
      (this.lineDraftPolyline as any).feature = {
        type: 'Feature',
        properties: {
          kind: 'line-draft',
          color: this.lineColor,
          number: this.lineNumber,
          direction: this.lineDirection,
          route: this.lineRoute,
        },
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
      props.color = this.lineColor;
      props.number = this.lineNumber;
      props.direction = this.lineDirection;
      props.route = this.lineRoute;
    }
  }

  addStopToLineById(stopId: number): void {
    const stop = this.stopIndex.find((s) => s.id === stopId);

    if (!stop) return;

    if (this.lineSelectedStops.some((s) => s.id === stopId)) return; //già presente

    this.lineSelectedStops.push({ ...stop });

    this.refreshLineDraftPolyline();
  }

  removeStopFromLine(index: number): void {
    if (index < 0 || index >= this.lineSelectedStops.length) return;

    this.lineSelectedStops.splice(index, 1);
    this.refreshLineDraftPolyline();
  }

  moveStopUp(index: number): void {
    if (index <= 0 || index >= this.lineSelectedStops.length) return;
    const temp = this.lineSelectedStops[index - 1];
    this.lineSelectedStops[index - 1] = this.lineSelectedStops[index];
    this.lineSelectedStops[index] = temp;
    this.refreshLineDraftPolyline();
  }

  moveStopDown(index: number): void {
    if (index < 0 || index >= this.lineSelectedStops.length - 1) return;
    const temp = this.lineSelectedStops[index + 1];
    this.lineSelectedStops[index + 1] = this.lineSelectedStops[index];
    this.lineSelectedStops[index] = temp;
    this.refreshLineDraftPolyline();
  }

  get lineSearchResults(): StopIndexItem[] {
    const q = (this.lineSearch ?? '').trim().toLowerCase();
    if (!q) return [];

    const isId = /^\d+$/.test(q);
    const results = this.stopIndex.filter((s) => {
      if (isId) return s.id === Number(q);
      return s.name.toLowerCase().includes(q) || String(s.id).includes(q);
    });

    return results.slice(0, 20);
  }

  //linee cliccabili

private onLineLayerClicked(layer: L.Path, e?: L.LeafletMouseEvent): void {
  if (this.editorMode === 'line-edit') {
    const latlng = e?.latlng ?? this.map.getCenter();

    // chiudi eventuale popup precedente
    this.lineHintPopup?.remove();

    this.lineHintPopup = L.popup({
      closeButton: false,
      autoClose: true,
      closeOnClick: false,
      className: 'map-hint-popup',
      offset: L.point(0, -8),
    })
      .setLatLng(latlng)
      .setContent('Sei in modifica: premi "Esci da Modifica" per cambiare linea.')
      .openOn(this.map);

    // auto-chiusura
    window.setTimeout(() => {
      this.lineHintPopup?.remove();
      this.lineHintPopup = undefined;
    }, 1400);

    return;
  }

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

    // ✅ se ho un draft update, applico colore (e volendo anche shape/meta)
    if (id != null && this.lineUpdatesDraft.has(id)) {
      const d = this.lineUpdatesDraft.get(id)!;

      this.lineNumber = d.number;
      this.lineDirection = d.direction;
      this.lineRoute = d.route;
      this.lineColor = d.color;

      // (opzionale) se vuoi anche shape live più avanti:
      // (layer as any).setLatLngs?.(d.latlngs);
    } else {
      this.lineNumber = props?.number != null && props.number !== '' ? Number(props.number) : null;
      this.lineDirection = (props?.direction ?? '').toString();
      this.lineRoute = (props?.route ?? '').toString();
      this.lineColor = (props?.color ?? '#1E88E5').toString();
    }
  }

  private clearLineSelection(): void {
    this.restoreLineStyle(this.selectedLineLayer);
    this.selectedLineLayer = null;

    this.lineNumber = null;
    this.lineDirection = '';
    this.lineRoute = '';
    this.lineColor = '#FF9800';
  }

  private applySelectedLineStyle(layer: L.Path): void {
    layer.setStyle({ weight: 7, opacity: 1, dashArray: '4 12' } as any);
  }

  private restoreLineStyle(layer: L.Path | null): void {
    if (!layer) return;

    const props = (layer as any)?.feature?.properties ?? {};
    const id = props?.transport_line_id != null ? Number(props.transport_line_id) : null;

    // ✅ override da draft update
    if (id != null && this.lineUpdatesDraft.has(id)) {
      const d = this.lineUpdatesDraft.get(id)!;
      layer.setStyle({ color: d.color, weight: 5, opacity: 0.9, dashArray: null } as any);
      return;
    }

    // baseline
    const color = props?.color ?? '#1E88E5';
    layer.setStyle({ color, weight: 5, opacity: 0.9, dashArray: null } as any);
  }

  enterLineEditMode(): void {
  if (!this.selectedLineLayer) {
    alert('Seleziona prima una linea sulla mappa.');
    return;
  }

  // se già in edit, evita casini
  if (this.editorMode === 'line-edit') return;

  this.editorMode = 'line-edit';

  // target = quello che l'utente aveva selezionato in view
  this.lineEditTargetLayer = this.selectedLineLayer;

  // tolgo stile selezione (dash) prima dell'edit
  this.restoreLineStyle(this.lineEditTargetLayer);

  // sposto fuori il target dalla view (evita doppioni visivi)
  this.linesGroup.removeLayer(this.lineEditTargetLayer);

  // preparo clone
  this.lineEditGroup.clearLayers();
  const clone = this.createWorkingCloneFromTarget(this.lineEditTargetLayer);

  if (!clone) {
    // fallback: rimetti target e torna create
    this.linesGroup.addLayer(this.lineEditTargetLayer);
    this.lineEditTargetLayer = null;
    this.editorMode = 'line-create';
    this.syncDrawToolsWithUi();
    alert('Impossibile entrare in modifica: la linea non è una polyline editabile.');
    return;
  }

  
  this.lineEditGroup.addLayer(clone);

  // in edit, la selected deve essere la clone (così i tuoi handler lavorano sul layer giusto)
  this.selectedLineLayer = clone;

  // ✅ baseline meta (come prima)
  this.lineEditBaselineMeta = {
    number: this.lineNumber,
    direction: this.lineDirection,
    route: this.lineRoute,
    color: this.lineColor,
  };

    // ✅ baseline shape (dalla clone)
  const latlngs = (clone.getLatLngs() ?? []) as L.LatLng[];
  this.lineEditBaselineLatLngs = latlngs.map((p) => L.latLng(p.lat, p.lng));

  // committed iniziale = baseline d’ingresso
this.lineEditCommittedMeta = this.lineEditBaselineMeta
  ? { ...this.lineEditBaselineMeta }
  : null;

this.lineEditCommittedLatLngs = this.lineEditBaselineLatLngs
  ? this.lineEditBaselineLatLngs.map(p => L.latLng(p.lat, p.lng))
  : null;



  // tools draw (edit toolbar)
  this.syncDrawToolsWithUi();
}

exitLineEditMode(): void {
  // distruggo la clone
  this.lineEditGroup.clearLayers();
 

  // rimetto il target in view
  if (this.lineEditTargetLayer) {
    this.linesGroup.addLayer(this.lineEditTargetLayer);

    // riallineo stile del target (baseline o draft update)
    this.restoreLineStyle(this.lineEditTargetLayer);

    // selected torna al target (così puoi riselezionare/vedere meta)
    this.selectedLineLayer = this.lineEditTargetLayer;

    this.lineEditTargetLayer = null;
  } else {
    this.selectedLineLayer = null;
  }

  this.editorMode = 'line-create';
  this.lineEditBaselineLatLngs = null;
  this.lineEditBaselineMeta = null;

  this.lineEditCommittedLatLngs = null;
  this.lineEditCommittedMeta = null;


  this.syncDrawToolsWithUi();
}


private restoreLineEditCommitted(): void {
  if (this.editorMode !== 'line-edit') return;

  const edited = this.getEditedPolylineFromEditGroup();
  if (!edited) return;

  if (this.lineEditCommittedLatLngs && this.lineEditCommittedLatLngs.length >= 2) {
    edited.setLatLngs(this.lineEditCommittedLatLngs);
  }

  if (this.lineEditCommittedMeta) {
    this.lineNumber = this.lineEditCommittedMeta.number;
    this.lineDirection = this.lineEditCommittedMeta.direction;
    this.lineRoute = this.lineEditCommittedMeta.route;
    this.lineColor = this.lineEditCommittedMeta.color;
  }

  edited.setStyle?.({ color: this.lineColor } as any);
}

 restoreLineEditBaseline(): void {
  if (this.editorMode !== 'line-edit') return;

  const working = this.getEditedPolylineFromEditGroup();
  if (!working) return;

  // 1) ripristina shape
  if (this.lineEditBaselineLatLngs && this.lineEditBaselineLatLngs.length >= 2) {
    working.setLatLngs(this.lineEditBaselineLatLngs);
  }

  // 2) ripristina meta UI
  if (this.lineEditBaselineMeta) {
    this.lineNumber = this.lineEditBaselineMeta.number;
    this.lineDirection = this.lineEditBaselineMeta.direction;
    this.lineRoute = this.lineEditBaselineMeta.route;
    this.lineColor = this.lineEditBaselineMeta.color;
  }

  // 3) applica subito colore sulla clone
  working.setStyle?.({ color: this.lineColor } as any);
}


  onLineColorChanged(color: string): void {
    this.lineColor = color;

    // Se sto editando, applica subito il colore alla linea in edit
    if (this.editorMode === 'line-edit') {
      const edited = this.getEditedPolylineFromEditGroup();
      edited?.setStyle?.({ color: this.lineColor } as any);
    }

    // Se sto creando una bozza, aggiorna la draft polyline
    if (this.editorMode === 'line-create') {
      this.refreshLineDraftPolyline();
    }
  }

private hasUnsavedLineEditChanges(): boolean {
  if (this.editorMode !== 'line-edit') return false;

  const edited = this.getEditedPolylineFromEditGroup();
  if (!edited) return false;

  const committedMeta = this.lineEditCommittedMeta;
  const metaDirty =
    !committedMeta ||
    committedMeta.number !== this.lineNumber ||
    committedMeta.direction !== this.lineDirection ||
    committedMeta.route !== this.lineRoute ||
    committedMeta.color !== this.lineColor;

  const committedLatLngs = this.lineEditCommittedLatLngs ?? [];
  const currLatLngs = (edited.getLatLngs() ?? []) as L.LatLng[];

  const shapeDirty =
    committedLatLngs.length !== currLatLngs.length ||
    committedLatLngs.some((p, i) => {
      const c = currLatLngs[i];
      if (!c) return true;
      return Math.abs(p.lat - c.lat) > 1e-10 || Math.abs(p.lng - c.lng) > 1e-10;
    });

  return metaDirty || shapeDirty;
}



onExitLineEditRequested(): void {
  // se non ci sono modifiche non salvate, esci diretto
  if (!this.hasUnsavedLineEditChanges()) {
    this.exitLineEditMode();
    return;
  }

  const ref = this.dialog.open(ConfirmExitLineEditDialogComponent, {
    width: '420px',
    data: {
      title: 'Uscire dalla modifica?',
      message: 'Hai modifiche non salvate in draft. Vuoi salvarle prima di uscire?',
    },
    disableClose: true, // obbliga scelta esplicita
  });

  ref.afterClosed().subscribe((choice: ExitLineEditChoice | undefined) => {
    if (!choice || choice === 'cancel') return;

    if (choice === 'save_exit') {
      this.saveEditedLineToDraft();
      this.exitLineEditMode();
      return;
    }

    if (choice === 'discard_exit') {
      // scarta la sessione tornando alla commited, poi esci
      this.restoreLineEditCommitted();
      this.exitLineEditMode();
      return;
    }
  });
}

private markLineEditCommittedFromCurrent(): void {
  const edited = this.getEditedPolylineFromEditGroup();
  if (!edited) return;

  this.lineEditCommittedMeta = {
    number: this.lineNumber,
    direction: this.lineDirection,
    route: this.lineRoute,
    color: this.lineColor,
  };

  const curr = (edited.getLatLngs() ?? []) as L.LatLng[];
  this.lineEditCommittedLatLngs = curr.map(p => L.latLng(p.lat, p.lng));
}
}
