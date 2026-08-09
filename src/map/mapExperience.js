import { APP_CONFIG } from '../config.js';
import { ContextBuildingLayer } from './layers/contextBuildingLayer.js';
import { ListingLayer } from './layers/listingLayer.js';
import { ProjectLayer } from './layers/projectLayer.js';

export class MapExperience {
  constructor(map, projects) {
    this.map = map;
    this.contextLayer = new ContextBuildingLayer(map);
    this.listingLayer = new ListingLayer(map);
    this.projectLayer = new ProjectLayer(map, projects);
  }

  initialize(geojson) { this.contextLayer.add(); this.listingLayer.add(geojson); this.projectLayer.add(); }
  onListingSelect(handler) { this.listingLayer.onSelect(handler); }
  onProjectSelect(handler) { this.projectLayer.onSelect(handler); }
  setListings(geojson) { this.listingLayer.setData(geojson); }
  setLayerVisible(layer, visible) { (layer === 'projects' ? this.projectLayer : this.listingLayer).setVisible(visible); }
  focus(record) { this.map.easeTo({ center: record.coordinates, zoom: 15, pitch: 64, duration: 750 }); }
  resetView() { this.map.easeTo({ center: APP_CONFIG.center, zoom: APP_CONFIG.zoom, pitch: APP_CONFIG.pitch, bearing: APP_CONFIG.bearing, duration: 900 }); }
}
