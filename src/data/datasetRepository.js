import { fromOffMarketRow, isMappable, makeProperty } from '../domain/property.js';
import { LiveListingAdapter } from './adapters/liveListingAdapter.js';

const getJSON = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}. Run "npm run pipeline" to build the data.`);
  return response.json();
};

// Loads the pipeline's published datasets, then overlays live on-market inventory when available.
export class DatasetRepository {
  constructor(config) { this.config = config; this.offMarketCache = new Map(); }

  async load() {
    const [manifest, areas, properties, projects] = await Promise.all([
      getJSON(this.config.data.manifest), getJSON(this.config.data.areas), getJSON(this.config.data.properties), getJSON(this.config.data.projects),
    ]);
    const areaByZip = new Map(areas.areas.map((area) => [area.zip, area]));
    let records = properties.properties.map(makeProperty).filter(isMappable);
    let live = { live: false, reason: 'Live provider is not configured.' };

    try {
      const result = await new LiveListingAdapter(this.config.liveListings).load(areaByZip, records);
      if (result.records.length) {
        records = [...records.filter((record) => record.status !== 'for-sale'), ...result.records.map(makeProperty).filter(isMappable)];
        live = { live: true, provider: result.metadata.provider, retrievedAt: result.metadata.retrievedAt, records: result.records.length };
      }
    } catch (error) {
      live = { live: false, reason: error.name === 'AbortError' ? 'Live provider timed out.' : error.message };
    }

    return { manifest, areas: areas.areas, regionSeries: areas.regionSeries, asOf: areas.asOf, properties: records, projects: projects.projects, permits: projects.permits, live };
  }

  async loadOffMarket(zip, areaScore) {
    if (!this.offMarketCache.has(zip)) {
      this.offMarketCache.set(zip, fetch(this.config.data.offMarket(zip))
        .then((response) => (response.ok ? response.json() : { columns: [], rows: [] }))
        .then((payload) => payload.rows.map((row) => fromOffMarketRow(payload.columns, row, zip, areaScore)).filter(isMappable))
        .catch(() => []));
    }
    return this.offMarketCache.get(zip);
  }
}
