export class PropertyRepository {
  constructor(url) { this.url = url; }

  async load() {
    const response = await fetch(this.url);
    if (!response.ok) throw new Error(`Property feed returned ${response.status}`);
    const payload = await response.json();

    return payload.properties
      .filter((row) => Number.isFinite(row.latitude) && Number.isFinite(row.longitude) && Number.isFinite(row.sale_price))
      .filter((row) => row.sale_price > 10000)
      .map((row, index) => ({
        id: row.mls || `parcel-${index}`,
        address: row.address || 'Address withheld',
        city: row.city || payload.city,
        zip: row.zip || row.source_zip || 'Unknown',
        price: row.sale_price,
        pricePerSqft: row.price_per_sqft,
        sqft: row.sqft,
        lotSize: row.lot_size,
        beds: row.beds,
        baths: row.baths,
        type: row.property_type || 'Residential',
        soldDate: row.sold_date,
        trend: Number(row.trend) || 0,
        insight: row.news || 'No automated insight available.',
        coordinates: [row.longitude, row.latitude],
      }));
  }
}
