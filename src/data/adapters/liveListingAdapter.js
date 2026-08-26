import { isMappableListing, makeListing } from '../../domain/listing.js';

export class LiveListingAdapter {
  constructor({ endpoint, timeoutMs = 9000 }) { this.endpoint = endpoint; this.timeoutMs = timeoutMs; }

  async load() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.endpoint, { signal: controller.signal, cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || `Live listing feed returned ${response.status}`);
      const records = (payload.properties || []).map((row, index) => makeListing({
        id: row.id || `live-${row.zip}-${index}`, mode: 'for-sale', address: row.address, city: row.city, zip: row.zip,
        price: row.list_price, sqft: row.sqft, lotSize: row.lot_size, beds: row.beds, baths: row.baths,
        type: row.property_type, eventDate: row.listed_date, trend: row.price_change_pct,
        insight: row.news, sourceUrl: row.source_url, latitude: row.latitude, longitude: row.longitude,
        sourceName: payload.provider || 'Live provider', sourceRecordId: row.id,
        sourceUpdatedAt: row.source_updated_at, retrievedAt: payload.retrieved_at, daysOnMarket: row.days_on_market,
        footprint: row.footprint,
      })).filter(isMappableListing);
      if (!records.length) throw new Error('Live provider returned no mappable listings');
      return { records, metadata: { provider: payload.provider, retrievedAt: payload.retrieved_at, sourceUpdatedAt: payload.source_updated_at } };
    } finally { clearTimeout(timeout); }
  }
}
