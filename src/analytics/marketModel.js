import { PRICE_BANDS } from '../config.js';

const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const milesBetween = ([lng1, lat1], [lng2, lat2]) => {
  const toRad = (degrees) => degrees * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export class MarketModel {
  constructor(properties, projects) {
    this.properties = properties;
    this.projects = projects;
    this.projectImpact = true;
  }

  setProjectImpact(enabled) { this.projectImpact = enabled; }

  impactFor(property) {
    if (!this.projectImpact) return 0;
    return this.projects.reduce((total, project) => {
      const distance = milesBetween(property.coordinates, project.coordinates);
      if (distance > project.radiusMiles) return total;
      return total + project.modeledLift * (1 - distance / project.radiusMiles);
    }, 0);
  }

  score(property) { return Math.max(-40, Math.min(80, property.trend + this.impactFor(property))); }

  filter({ query = '', band = 'all', type = 'all' } = {}) {
    const normalizedQuery = query.toLowerCase().trim();
    return this.properties.filter((property) => {
      const queryMatch = !normalizedQuery || `${property.address} ${property.zip}`.toLowerCase().includes(normalizedQuery);
      const bandIndex = PRICE_BANDS.findIndex((item) => property.price <= item.max);
      const bandMatch = band === 'all' || Number(band) === bandIndex;
      const typeMatch = type === 'all' || property.type.toLowerCase().includes(type.toLowerCase());
      return queryMatch && bandMatch && typeMatch;
    });
  }

  summary(records = this.properties) {
    const medianPrice = median(records.map((item) => item.price));
    const medianPpsf = median(records.map((item) => item.pricePerSqft));
    const signal = Math.round(Math.max(0, Math.min(100, 54 + median(records.map((item) => this.score(item))) * 1.3)));
    return { count: records.length, medianPrice, medianPpsf, signal };
  }

  zipSignals(limit = 5) {
    const grouped = Map.groupBy(this.properties, (property) => property.zip);
    return [...grouped.entries()].map(([zip, records]) => ({
      zip, count: records.length, median: median(records.map((item) => item.price)),
      trend: median(records.map((item) => this.score(item))),
    })).filter((item) => item.count > 15).sort((a, b) => b.trend - a.trend).slice(0, limit);
  }

  propertiesGeoJSON(records = this.properties) {
    return { type: 'FeatureCollection', features: records.map((property) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: property.coordinates },
      properties: { ...property, coordinates: undefined, score: this.score(property), projectImpact: this.impactFor(property) },
    })) };
  }

  projectsGeoJSON() {
    return { type: 'FeatureCollection', features: this.projects.map((project) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: project.coordinates }, properties: project,
    })) };
  }
}
