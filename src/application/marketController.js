import { ListingGeoJSON } from '../presentation/listingGeoJSON.js';

export class MarketController {
  constructor(market, footprints, mapExperience, dashboard) {
    this.market = market; this.footprints = footprints; this.map = mapExperience; this.dashboard = dashboard;
    this.filters = { query: '', band: 'all', type: 'all' };
  }

  initialize() {
    const view = this.market.query(this.filters);
    this.map.initialize(this.mapData(view.records));
    this.map.onListingSelect((listing) => this.dashboard.showListing(listing, view.mode));
    this.map.onProjectSelect((project) => this.dashboard.showProject(project));
    this.dashboard.onIntent((intent) => this.handle(intent));
    this.dashboard.renderView(view);
    this.dashboard.setReady();
  }

  handle(intent) {
    if (intent.type === 'mode') { this.market.setMode(intent.mode); this.filters.query = ''; }
    if (intent.type === 'filter') this.filters = { ...this.filters, ...intent.filters };
    if (intent.type === 'impact') this.market.setProjectImpact(intent.enabled);
    if (intent.type === 'visibility') return this.map.setLayerVisible(intent.layer, intent.visible);
    if (intent.type === 'reset') return this.map.resetView();
    const view = this.market.query(this.filters);
    this.map.setListings(this.mapData(view.records)); this.dashboard.renderView(view);
    if ((intent.type === 'filter' || intent.type === 'zip') && this.filters.query && view.records[0]) this.map.focus(view.records[0]);
  }

  mapData(records) { return ListingGeoJSON.footprints(records, this.market, this.footprints); }
}
