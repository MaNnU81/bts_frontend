import { Component, AfterViewInit, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

import * as L from 'leaflet';
import 'leaflet-draw';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatDialog } from '@angular/material/dialog';
import {
  LeafletDialogIdComponent,
  MapIdDialogResult,
} from '../leaflet-dialog-id-component/leaflet-dialog-id-component';
import { CommonModule } from '@angular/common';

type LeafletMapData = {
  stopsGeoJson?: any;
  linesGeoJson?: any;
};

@Component({
  selector: 'app-leaflet-map',
  standalone: true,
  imports: [CommonModule, FormsModule, MatSlideToggleModule],
  templateUrl: './leaflet-map.html',
  styleUrl: './leaflet-map.scss',
})
export class LeafletMap implements AfterViewInit {
  private stopsGeoLayer?: L.GeoJSON;
  private linesGeoLayer?: L.GeoJSON;

  showFetchedStops = true;
  showFetchedLines = true;

  constructor(
    private dialog: MatDialog,
    @Inject(MAT_DIALOG_DATA) public data?: { stopsGeoJson?: any; linesGeoJson?: any }
  ) {}

  private map!: L.Map;
  // private drawnItems!: L.FeatureGroup;
  private stopsGroup!: L.FeatureGroup;
  private linesGroup!: L.FeatureGroup;

  ngAfterViewInit(): void {
    this.initMap();

    console.log('GeoJSON Stops ricevuto:', this.data?.stopsGeoJson);
    console.log('GeoJSON Lines ricevuto:', this.data?.linesGeoJson);
  }

  initMap(): void {
    delete (L.Icon.Default.prototype as any)._getIconUrl;

    L.Icon.Default.mergeOptions({
      iconRetinaUrl: '/leaflet/marker-icon-2x.png',
      iconUrl: '/leaflet/marker-icon.png',
      shadowUrl: '/leaflet/marker-shadow.png',
    });
    this.map = L.map('map', {
      center: [44.4072, 8.9338],
      zoom: 15,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.map);

    

    //   this.drawnItems = new L.FeatureGroup();
    //   this.map.addLayer(this.drawnItems);

    //   var drawControl = new L.Control.Draw({
    //     edit: {
    //       featureGroup: this.drawnItems,
    //       remove: false
    //     },

    //   });

    //   this.map.addControl(drawControl as any);

    //   this.map.on(L.Draw.Event.CREATED, (event: any) => {
    //     const layer = event.layer;
    //     this.drawnItems.addLayer(layer);
    //     console.log(layer.toGeoJSON());

    //   });

    //   setTimeout(() => {
    //     this.map.invalidateSize();
    //   }, 0);

    ///////draw stops and lines layers e export functions

    this.stopsGroup = new L.FeatureGroup();
    this.linesGroup = new L.FeatureGroup();
    this.map.addLayer(this.stopsGroup);
    this.map.addLayer(this.linesGroup);

    this.buildFetchedLayersFromData();

    const editableLayers = new L.FeatureGroup();
    editableLayers.addLayer(this.stopsGroup);
    editableLayers.addLayer(this.linesGroup);

    const drawControl = new L.Control.Draw({
      edit: {
        featureGroup: editableLayers,
        remove: true,
      },
      draw: {
        marker: true,
        polyline: true,
        polygon: false,
        rectangle: false,
        circle: false,
        circlemarker: false,
      } as any,
    });

      
    this.map.addControl(drawControl as any);

    this.map.on(L.Draw.Event.CREATED, async (event: any) => {
      const layer: L.Layer = event.layer;
      const layerType: string = event.layerType;

      if (layerType === 'marker') {
        this.askIdAndAdd(layer, 'stop');
      } else if (layerType === 'polyline') {
        this.askIdAndAdd(layer, 'line');
      } else {
        console.warn('Unsupported layer type:', layerType);
      }
    });

    setTimeout(() => this.map.invalidateSize(), 0);
  }

  private askIdAndAdd(layer: L.Layer, kind: 'stop' | 'line'): void {
    const dialogRef = this.dialog.open(LeafletDialogIdComponent, {
      width: '200px',
      data: { kind },
      disableClose: true,
    });

    dialogRef.afterClosed().subscribe((result?: MapIdDialogResult) => {
      if (!result) return;

      if (kind === 'stop' && this.hasStopId(result.id)) {
        alert(`ERRORE: stop_id ${result.id} è già presente sulla mappa.`);
        return;
      }
      if (kind === 'line' && this.hasTransportLineId(result.id)) {
        alert(`ERRORE: transport_line_id ${result.id} è già presente sulla mappa.`);
        return;
      }

      const props =
        kind === 'stop'
          ? { kind: 'stop', stop_id: result.id }
          : { kind: 'line', transport_line_id: result.id, color: result.color ?? undefined };

      (layer as any).feature = (layer as any).feature ?? {
        type: 'Feature',
        properties: {},
      };

      (layer as any).feature.properties = {
        ...(layer as any).feature.properties,
        ...props,
      };

      if (kind === 'line') {
        const color = result.color ?? '#1E88E5'; // fallback
        // applico stile al layer (polyline)
        if ((layer as any).setStyle) {
          (layer as any).setStyle({ color, weight: 4, opacity: 0.9 });
        }
      }

      // 3) Popup
      if ((layer as any).bindPopup) {
        if (kind === 'stop') {
          (layer as any).bindPopup(`stop_id: ${result.id}`);
        } else {
          const c = result.color ? `\ncolor: ${result.color}` : '';
          (layer as any).bindPopup(`transport_line_id: ${result.id}${c}`);
        }
      }

      // 4) Aggiungo al gruppo corretto
      if (kind === 'stop') this.stopsGroup.addLayer(layer);
      else this.linesGroup.addLayer(layer);
    });
  }

  exportStopsGeoJson(): void {
    const geojson = this.stopsGroup.toGeoJSON();
    this.downloadJson(geojson, 'stops.geojson');
  }

  exportLinesGeoJson(): void {
    const geojson = this.linesGroup.toGeoJSON();
    this.downloadJson(geojson, 'lines.geojson');
  }

  private downloadJson(obj: any, filename: string): void {
    const json = JSON.stringify(obj, null, 2);
    const blob = new Blob([json], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
  }

  private hasStopId(stopId: number): boolean {
    let found = false;

    this.stopsGroup.eachLayer((l: L.Layer) => {
      const props = (l as any)?.feature?.properties;
      if (props?.stop_id === stopId) found = true;
    });

    return found;
  }

  private hasTransportLineId(transportLineId: number): boolean {
    let found = false;
    this.linesGroup.eachLayer((l: L.Layer) => {
      const props = (l as any)?.feature?.properties;
      if (props?.transport_line_id === transportLineId) found = true;
    });

    return found;
  }


  ///build fetched layers from geojson data
  
  private buildFetchedLayersFromData(): void {
    try {
      // STOPS
      if (this.data?.stopsGeoJson?.type === 'FeatureCollection') {
        this.stopsGeoLayer = L.geoJSON(this.data.stopsGeoJson, {
          pointToLayer: (feature: any, latlng) => L.marker(latlng),
          onEachFeature: (feature: any, layer: any) => {
            const id = feature?.properties?.stop_id;
            if (id != null && layer.bindPopup) layer.bindPopup(`stop_id: ${id}`);
          },
        });
      } else {
        this.stopsGeoLayer = undefined;
      }

      // LINES
      if (this.data?.linesGeoJson?.type === 'FeatureCollection') {
        this.linesGeoLayer = L.geoJSON(this.data.linesGeoJson, {
          style: (feature: any) => {
            const color = feature?.properties?.color ?? '#1E88E5';
            return { color, weight: 4, opacity: 0.9 };
          },
        });

        this.linesGeoLayer.eachLayer((layer: any) => {
          const id = layer?.feature?.properties?.transport_line_id;
          if (layer.bindPopup && id != null) layer.bindPopup(`transport_line_id: ${id}`);
        });
      } else {
        this.linesGeoLayer = undefined;
      }

      this.applyFetchedVisibility();
    } catch (e) {
      console.warn('GeoJSON non valido o errore parsing:', e);
      this.stopsGeoLayer = undefined;
      this.linesGeoLayer = undefined;
    }
  }


///toggle visibility methods

  public applyFetchedVisibility(): void {
    // --- STOPS ---
    if (this.stopsGeoLayer) {
      if (this.showFetchedStops) {
        this.stopsGeoLayer.eachLayer((child: L.Layer) => this.stopsGroup.addLayer(child));
      } else {
        this.stopsGeoLayer.eachLayer((child: L.Layer) => this.stopsGroup.removeLayer(child));
      }
    }

    // --- LINES ---
    if (this.linesGeoLayer) {
      if (this.showFetchedLines) {
        this.linesGeoLayer.eachLayer((child: L.Layer) => this.linesGroup.addLayer(child));
      } else {
        this.linesGeoLayer.eachLayer((child: L.Layer) => this.linesGroup.removeLayer(child));
      }
    }
  }
}
