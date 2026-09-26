import { PRICE_BANDS } from '../config.js';
import { median } from './stats.js';

export const DEFAULT_FILTERS = Object.freeze({ statuses: ['for-sale', 'pending', 'sold'], band: 'all', query: '', verdict: 'all' });

// Holds the loaded records and answers filter queries for the map, list and summaries.
export class MarketService {
  constructor({ properties, areas, projects }) {
    this.properties = properties; this.areas = areas; this.projects = projects;
    this.areaByZip = new Map(areas.map((area) => [area.zip, area]));
    this.offMarket = new Map();
  }

  setOffMarket(zip, records) { this.offMarket.set(zip, records); }
  offMarketRecords() { return [...this.offMarket.values()].flat(); }

  matches(property, { statuses, band, query, verdict }) {
    if (!statuses.includes(property.status)) return false;
    if (band !== 'all') {
      const index = PRICE_BANDS.findIndex((item) => property.displayPrice <= item.max);
      if (PRICE_BANDS[index]?.key !== band) return false;
    }
    if (verdict === 'good' && !(property.signal >= 60)) return false;
    if (verdict === 'bad' && !(property.signal < 42)) return false;
    if (query) {
      const text = `${property.address} ${property.city || ''} ${property.zip}`.toLowerCase();
      if (!query.toLowerCase().split(/\s+/).filter(Boolean).every((term) => text.includes(term))) return false;
    }
    return true;
  }

  query(filters = DEFAULT_FILTERS) {
    const pool = filters.statuses.includes('off-market') ? [...this.properties, ...this.offMarketRecords()] : this.properties;
    const records = pool.filter((property) => this.matches(property, filters));
    return { filters, records, summary: this.summary(records), counts: this.counts(filters) };
  }

  counts(filters) {
    const counts = {};
    for (const property of [...this.properties, ...this.offMarketRecords()]) {
      if (this.matches(property, { ...filters, statuses: [property.status] })) counts[property.status] = (counts[property.status] || 0) + 1;
    }
    return counts;
  }

  summary(records) {
    const sold = records.filter((item) => item.status === 'sold');
    const active = records.filter((item) => item.status === 'for-sale' || item.status === 'pending');
    return {
      count: records.length,
      medianSale: median(sold.map((item) => item.price)),
      medianAsk: median(active.map((item) => item.price)),
      medianResaleAnnual: median(records.map((item) => item.resale?.annualPct)),
      goodDeals: active.filter((item) => item.deal?.key === 'good').length,
      overpriced: active.filter((item) => item.deal?.key === 'bad').length,
    };
  }

  rankedAreas(metric = 'score') {
    const value = (area) => (metric === 'score' ? area.score?.total : area.metrics?.[metric]);
    return [...this.areas].filter((area) => Number.isFinite(value(area))).sort((a, b) => value(b) - value(a));
  }

  regionSummary() {
    const scored = this.areas.filter((area) => area.metrics?.value);
    const weightOf = (area) => area.metrics.population || 1;
    const weighted = (key) => {
      const rows = scored.filter((area) => Number.isFinite(area.metrics[key]));
      const total = rows.reduce((sum, area) => sum + weightOf(area), 0);
      return total ? rows.reduce((sum, area) => sum + area.metrics[key] * weightOf(area), 0) / total : null;
    };
    return { zips: this.areas.length, medianValue: median(scored.map((area) => area.metrics.value)), yoyPct: weighted('yoyPct'), forecastPct: weighted('forecast1yPct'), yieldPct: weighted('grossYieldPct') };
  }

  projectsFor(area) { return (area.topProjects || []).map((item) => ({ ...item, project: this.projects.find((project) => project.id === item.id) })).filter((item) => item.project); }
}
