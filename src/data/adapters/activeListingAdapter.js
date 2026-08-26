import { isMappableListing, makeListing } from '../../domain/listing.js';

export class ActiveListingAdapter {
  constructor(url) { this.url = url; }

  async load() {
    const response = await fetch(this.url);
    if (!response.ok) throw new Error(`Active listing feed returned ${response.status}`);
    const payload = await response.json();
    return payload.properties.map((row, index) => makeListing({
      id: row.mls || `active-${row.zip}-${index}`,
      mode: 'for-sale', address: row.address, city: row.city, zip: row.zip,
      price: row.list_price, sqft: row.sqft, lotSize: row.lot_size, beds: row.beds, baths: row.baths,
      type: row.property_type, eventDate: row.listed_date || payload.as_of, trend: row.price_change_pct ?? row.market_trend,
      insight: row.news, sourceUrl: row.source_url, latitude: row.latitude, longitude: row.longitude,
      sourceName: 'Curated market snapshot', sourceRecordId: row.mls,
      sourceUpdatedAt: row.source_updated_at || row.listed_date || payload.as_of, retrievedAt: payload.as_of,
      footprint: row.footprint,
    })).filter(isMappableListing);
  }
}
