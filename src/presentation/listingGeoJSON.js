export class ListingGeoJSON {
  static footprints(records, market, footprintRepository) {
    return { type: 'FeatureCollection', features: records.map((listing) => {
      const footprint = footprintRepository.resolve(listing);
      return {
        type: 'Feature', geometry: { type: 'Polygon', coordinates: [footprint.ring] },
        properties: { ...listing, coordinates: undefined, footprint: undefined, footprintPrecision: footprint.precision, score: market.score(listing), projectImpact: market.impactFor(listing), height: Math.max(9, Math.min(42, 8 + (listing.sqft || 1400) / 140)) },
      };
    }) };
  }

  static projects(projects) {
    return { type: 'FeatureCollection', features: projects.map((project) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: project.coordinates }, properties: project })) };
  }
}
