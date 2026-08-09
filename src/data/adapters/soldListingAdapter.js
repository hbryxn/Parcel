import { isMappableListing, makeListing } from '../../domain/listing.js';

export class SoldListingAdapter {
  constructor(url) { this.url = url; }

  async load() {
    const response = await fetch(this.url);
    if (!response.ok) throw new Error(`Sold listing feed returned ${response.status}`);
    const payload = await response.json();
    return payload.properties.map((row, index) => makeListing({
      id: row.mls || `sold-${payload.zip || 'sav'}-${index}`,
      mode: 'sold', address: row.address, city: row.city || payload.city, zip: row.zip || row.source_zip || payload.zip,
      price: row.sale_price, pricePerSqft: row.price_per_sqft, sqft: row.sqft, lotSize: row.lot_size,
      beds: row.beds, baths: row.baths, type: row.property_type, eventDate: row.sold_date,
      trend: row.trend ?? payload.market_trend, insight: row.news, sourceUrl: row.url || payload.source_url,
      footprint: row.footprint,
      latitude: row.latitude, longitude: row.longitude,
    })).filter(isMappableListing);
  }
}
