import { PRICE_BANDS } from '../config.js';

const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const groupBy = (records, key) => records.reduce((groups, record) => {
  const value = record[key];
  groups.set(value, [...(groups.get(value) || []), record]);
  return groups;
}, new Map());

const milesBetween = ([lng1, lat1], [lng2, lat2]) => {
  const toRad = (degrees) => degrees * Math.PI / 180;
  const dLat = toRad(lat2 - lat1); const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export class MarketService {
  constructor(listingsByMode, projects) {
    this.listingsByMode = listingsByMode; this.projects = projects; this.mode = 'sold'; this.projectImpact = true;
  }

  setMode(mode) { if (this.listingsByMode[mode]) this.mode = mode; }
  setProjectImpact(enabled) { this.projectImpact = enabled; }
  all() { return this.listingsByMode[this.mode]; }

  impactFor(listing) {
    if (!this.projectImpact) return 0;
    return this.projects.reduce((total, project) => {
      const distance = milesBetween(listing.coordinates, project.coordinates);
      return distance > project.radiusMiles ? total : total + project.modeledLift * (1 - distance / project.radiusMiles);
    }, 0);
  }

  score(listing) { return Math.max(-40, Math.min(80, listing.trend + this.impactFor(listing))); }

  query({ query = '', band = 'all', type = 'all' } = {}) {
    const normalizedQuery = query.toLowerCase().trim();
    const records = this.all().filter((listing) => {
      const queryMatch = !normalizedQuery || `${listing.address} ${listing.city} ${listing.zip}`.toLowerCase().includes(normalizedQuery);
      const bandIndex = PRICE_BANDS.findIndex((item) => listing.price <= item.max);
      return queryMatch && (band === 'all' || Number(band) === bandIndex) && (type === 'all' || listing.type.toLowerCase().includes(type.toLowerCase()));
    });
    return { mode: this.mode, records, summary: this.summary(records), totalZipCount: new Set(records.map((record) => record.zip)).size, zipSignals: this.zipSignals(records) };
  }

  summary(records = this.all()) {
    const signal = Math.round(Math.max(0, Math.min(100, 54 + median(records.map((item) => this.score(item))) * 1.3)));
    return { count: records.length, medianPrice: median(records.map((item) => item.price)), medianPpsf: median(records.map((item) => item.pricePerSqft)), signal };
  }

  zipSignals(records = this.all(), limit = 6) {
    return [...groupBy(records, 'zip').entries()].map(([zip, zipRecords]) => ({
      zip, count: zipRecords.length, median: median(zipRecords.map((item) => item.price)), trend: median(zipRecords.map((item) => this.score(item))),
    })).sort((a, b) => b.count - a.count || b.trend - a.trend).slice(0, limit);
  }
}
