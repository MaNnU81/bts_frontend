import { AfterViewInit, Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, Subscription } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';


import * as L from 'leaflet';
import 'leaflet-draw';

import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { DataService } from '../../services/data-service';
import { MatDivider } from "@angular/material/divider"; // <-- aggiorna path

type StopEditorMode = 'create' | 'edit';

type StopEditorState = {
  mode: StopEditorMode;
  stopId: number | null;
  name: string;
  lat: number | null;
  lng: number | null;
  layer: L.Marker | null;
};

@Component({
  selector: 'app-leaflet-add',
  standalone: true,
  imports: [MatInputModule, MatSelectModule, MatFormFieldModule, MatButtonModule, CommonModule, FormsModule, MatSlideToggleModule, MatDivider],
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

  private tmpCounter = 1;

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

  constructor(private dataService: DataService) {}

  get pendingCount(): number {
    return this.createdDraft.size + this.updatedDraft.size + this.deletedDraft.size; //.size è il .length per map e set
  }

  private newTempId(): string {
    return `tmp-${Date.now()}-${this.tmpCounter++}`;
  }

  ngAfterViewInit(): void {
    this.initMap();
    this.loadGeoAndRender();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.map?.remove();
  }

  private initMap(): void {
    // Icone Leaflet (come nel dialog)
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: '/leaflet/marker-icon-2x.png',
      iconUrl: '/leaflet/marker-icon.png',
      shadowUrl: '/leaflet/marker-shadow.png',
    });

    this.map = L.map('leafletAddMap', {
      center: [44.4072, 8.9338],
      zoom: 15,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(this.map);

    this.stopsGroup = new L.FeatureGroup();
    this.linesGroup = new L.FeatureGroup();
    this.map.addLayer(this.stopsGroup);
    this.map.addLayer(this.linesGroup);

    // Draw: SOLO MARKER


    const drawControl = new L.Control.Draw({
      edit: {
        featureGroup: this.stopsGroup,
        remove: true,
      },
      draw: {
        marker: {},
        polyline: {},
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

          // se non esiste ancora in draft, lo creo (ma name magari è vuoto finché non lo compili)
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
          this.deletedDraft.add(id);
          this.updatedDraft.delete(id); // se era anche in update, vince delete
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

  private loadGeoAndRender(): void {
    this.loading = true;
    this.error = null;

    this.sub?.unsubscribe();
    this.sub = forkJoin({
      stopsGeoJson: this.dataService.getStopsGeoJson(),
      linesGeoJson: this.dataService.getLinesGeoJson(),
    }).subscribe({
      next: ({ stopsGeoJson, linesGeoJson }) => {
        this.buildFetchedLayersFromData(stopsGeoJson, linesGeoJson);
        this.applyFetchedVisibility();
        this.fitToContent();
        this.loading = false;
      },
      error: (err) => {
        console.error('Errore caricamento geojson editor:', err);
        this.error = 'Impossibile caricare i GeoJSON dal backend.';
        this.loading = false;
      },
    });
  }

  private buildFetchedLayersFromData(stopsGeoJson: any, linesGeoJson: any): void {
    try {
      // STOPS
      if (stopsGeoJson?.type === 'FeatureCollection') {
        this.stopsGeoLayer = L.geoJSON(stopsGeoJson, {
          pointToLayer: (feature: any, latlng) => L.marker(latlng),
          onEachFeature: (feature: any, layer: any) => {
            const id = feature?.properties?.stop_id;
            const name = feature?.properties?.name;

            if (id != null && layer.bindPopup) {
              layer.bindPopup(`stop_id: ${id}${name ? `<br/>${name}` : ''}`);
            }

            layer.on('click', () => this.selectStopLayer(layer as L.Marker));
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
            return { color, weight: 4, opacity: 0.9 };
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

  public applyFetchedVisibility(): void {
    // STOPS
    if (this.stopsGeoLayer) {
      if (this.showFetchedStops) {
        this.stopsGeoLayer.eachLayer((child: L.Layer) => this.stopsGroup.addLayer(child));
      } else {
        this.stopsGeoLayer.eachLayer((child: L.Layer) => this.stopsGroup.removeLayer(child));
      }
    }

    // LINES
    if (this.linesGeoLayer) {
      if (this.showFetchedLines) {
        this.linesGeoLayer.eachLayer((child: L.Layer) => this.linesGroup.addLayer(child));
      } else {
        this.linesGeoLayer.eachLayer((child: L.Layer) => this.linesGroup.removeLayer(child));
      }
    }
  }

  private selectStopLayer(layer: L.Marker, forceCreateMode = false): void {
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

  private fitToContent(): void {
    const bounds = new L.LatLngBounds([]);

    this.stopsGroup.eachLayer((l: any) => {
      if (l.getLatLng) bounds.extend(l.getLatLng());
    });

    this.linesGroup.eachLayer((l: any) => {
      if (l.getBounds) bounds.extend(l.getBounds());
    });

    if (bounds.isValid()) this.map.fitBounds(bounds.pad(0.1));
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
          const marker = this.findMarkerByTempId(c.tempId);
          if (!marker) continue;

          const props = (marker as any).feature?.properties ?? {};
          props.stop_id = c.id;
          props.name = c.name;
          delete props.temp_id;

          (marker as any).feature = (marker as any).feature ?? { type: 'Feature', properties: {} };
          (marker as any).feature.properties = props;

          marker.bindPopup?.(`stop_id: ${c.id}<br/>${c.name}`);
        }

        // 2) deleted: già rimossi dalla mappa (draw delete li toglie), qui pulizia set
        // 3) updated: aggiorna popup/name in caso DB normalizzi
        for (const u of res.updated) {
          const marker = this.findMarkerByStopId(u.id);
          if (!marker) continue;

          const props = (marker as any).feature?.properties ?? {};
          props.name = u.name ?? props.name;

          (marker as any).feature.properties = props;
          marker.bindPopup?.(`stop_id: ${u.id}<br/>${props.name}`);
        }

        // pulizia draft
        this.createdDraft.clear();
        this.updatedDraft.clear();
        this.deletedDraft.clear();

        alert('Salvataggio completato (batch).');
      },
      error: (err) => {
        const msg = err?.error?.message ?? 'Errore durante il salvataggio batch.';
        alert(msg);
      },
    });
  }

  private findMarkerByTempId(tempId: string): L.Marker | null {
    let found: L.Marker | null = null;
    this.stopsGroup.eachLayer((l: any) => {
      const props = l?.feature?.properties;
      if (props?.temp_id === tempId) found = l as L.Marker;
    });
    return found;
  }

  private findMarkerByStopId(stopId: number): L.Marker | null {
    let found: L.Marker | null = null;
    this.stopsGroup.eachLayer((l: any) => {
      const props = l?.feature?.properties;
      if (Number(props?.stop_id) === stopId) found = l as L.Marker;
    });
    return found;
  }

  markDeleteCurrent(): void {
  const st = this.editorState;
  if (!st || !st.layer || st.stopId == null) return;

  const id = st.stopId;

  // marca delete
  this.deletedDraft.add(id);

  // se era in update, vince delete
  this.updatedDraft.delete(id);

  // rimuovi dalla mappa
  this.stopsGroup.removeLayer(st.layer);

  // reset editor
  this.editorState = null;
}
  
}
