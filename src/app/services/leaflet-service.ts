import { Injectable } from '@angular/core';
import * as L from 'leaflet';

export type LeafMapInitOptions = {
  elementId: string; // es: 'leafletAddMap'
  center: L.LatLngExpression; // es: [44.4072, 8.9338]
  zoom: number; // es: 15
};

@Injectable({
  providedIn: 'root',
})
export class LeafletService {
  private map?: L.Map;

  private stopsGroup?: L.FeatureGroup;
  private linesGroup?: L.FeatureGroup;

  private deletedGhostGroup?: L.FeatureGroup;

  private iconUpdated?: L.Icon;
  private iconDeleted?: L.Icon;

  init(opts: LeafMapInitOptions): {
    map: L.Map;
    stopsGroup: L.FeatureGroup;
    linesGroup: L.FeatureGroup;
  } {
    // se init viene chiamato due volte, evita map duplicate
    this.destroy();

    this.setDefaultMarkerIcons();
    this.createVariantIcons();

    this.map = L.map(opts.elementId, {
      center: opts.center,
      zoom: opts.zoom,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(this.map);

    this.stopsGroup = new L.FeatureGroup();
    this.linesGroup = new L.FeatureGroup();

    //icone colorate in base allo stato
    this.deletedGhostGroup = new L.FeatureGroup();
    this.map.addLayer(this.deletedGhostGroup);

    this.map.addLayer(this.stopsGroup);
    this.map.addLayer(this.linesGroup);

    return { map: this.map, stopsGroup: this.stopsGroup, linesGroup: this.linesGroup };
  }

  destroy(): void {
    // pulisco gruppi
    this.stopsGroup = undefined;
    this.linesGroup = undefined;
    this.deletedGhostGroup = undefined;

    this.iconUpdated = undefined;
    this.iconDeleted = undefined;

    // rimuovo mappa se esiste
    if (this.map) {
      this.map.remove();
      this.map = undefined;
    }
  }

  getMap(): L.Map {
    if (!this.map) throw new Error('LeafMapService: map non inizializzata. Chiama init() prima.');
    return this.map;
  }

  getStopsGroup(): L.FeatureGroup {
    if (!this.stopsGroup)
      throw new Error('LeafMapService: stopsGroup non inizializzato. Chiama init() prima.');
    return this.stopsGroup;
  }

  getLinesGroup(): L.FeatureGroup {
    if (!this.linesGroup)
      throw new Error('LeafMapService: linesGroup non inizializzato. Chiama init() prima.');
    return this.linesGroup;
  }

  private setDefaultMarkerIcons(): void {
    // stesso fix che avevi nel component
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: '/leaflet/marker-icon-2x.png',
      iconUrl: '/leaflet/marker-icon.png',
      shadowUrl: '/leaflet/marker-shadow.png',
    });
  }

  private createVariantIcons(): void {
    const BaseIcon = (L.Icon.Default as any).extend({});

    this.iconUpdated = new BaseIcon({
      iconRetinaUrl: '/leaflet/marker-icon-updated-2x.png',
      iconUrl: '/leaflet/marker-icon-updated.png',
    });

    this.iconDeleted = new BaseIcon({
      iconRetinaUrl: '/leaflet/marker-icon-deleted-2x.png',
      iconUrl: '/leaflet/marker-icon-deleted.png',
    });
  }

  fitToContent(padding: number = 0.1): void {
    const map = this.getMap();
    const stopsGroup = this.getStopsGroup();
    const linesGroup = this.getLinesGroup();

    const bounds = new L.LatLngBounds([]);

    stopsGroup.eachLayer((l: any) => {
      if (l.getLatLng) bounds.extend(l.getLatLng());
    });

    linesGroup.eachLayer((l: any) => {
      if (l.getBounds) bounds.extend(l.getBounds());
    });

    if (bounds.isValid()) map.fitBounds(bounds.pad(padding));
  }

  findStopMarkerByTempId(tempId: string): L.Marker | null {
    const stopsGroup = this.getStopsGroup();
    let found: L.Marker | null = null;

    stopsGroup.eachLayer((l: any) => {
      const props = l?.feature?.properties;
      if (props?.temp_id === tempId) found = l as L.Marker;
    });

    return found;
  }

  findStopMarkerByStopId(stopId: number): L.Marker | null {
    const stopsGroup = this.getStopsGroup();
    let found: L.Marker | null = null;

    stopsGroup.eachLayer((l: any) => {
      const props = l?.feature?.properties;
      if (Number(props?.stop_id) === stopId) found = l as L.Marker;
    });

    return found;
  }

  applyGeoVisibility(
    stopsGeoLayer: L.GeoJSON | undefined,
    linesGeoLayer: L.GeoJSON | undefined,
    showStops: boolean,
    showLines: boolean
  ): void {
    const stopsGroup = this.getStopsGroup();
    const linesGroup = this.getLinesGroup();

    // --- STOPS ---
    if (stopsGeoLayer) {
      stopsGeoLayer.eachLayer((child: L.Layer) => {
        if (showStops) stopsGroup.addLayer(child);
        else stopsGroup.removeLayer(child);
      });
    }

    // --- LINES ---
    if (linesGeoLayer) {
      linesGeoLayer.eachLayer((child: L.Layer) => {
        if (showLines) linesGroup.addLayer(child);
        else linesGroup.removeLayer(child);
      });
    }
  }

  getDeletedGhostGroup(): L.FeatureGroup {
    if (!this.deletedGhostGroup)
      throw new Error('LeafletService: deletedGhostGroup non inizializzato.');
    return this.deletedGhostGroup;
  }

  moveStopToDeleted(marker: L.Marker): void {
    this.getStopsGroup().removeLayer(marker);
    this.getDeletedGhostGroup().addLayer(marker);
    this.setStopIconDeleted(marker);
  }

  restoreStopFromDeleted(marker: L.Marker): void {
    this.getDeletedGhostGroup().removeLayer(marker);
    this.getStopsGroup().addLayer(marker);
    this.setStopIconNormal(marker);
  }

  setStopIconNormal(marker: L.Marker): void {
    marker.setIcon(new L.Icon.Default());
  }

  setStopIconUpdated(marker: L.Marker): void {
    if (!this.iconUpdated) return;
    marker.setIcon(this.iconUpdated);
  }

  setStopIconDeleted(marker: L.Marker): void {
    if (!this.iconDeleted) return;
    marker.setIcon(this.iconDeleted);
  }
}
