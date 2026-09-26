import { dealSignal } from '../../analytics/valuationModel.js';

const addressKey = (address, zip) => `${String(address || '').toLowerCase().replace(/[^a-z0-9]/g, '')}|${zip}`;

// Near-real-time active listings from the protected server endpoint. Records are joined to
// pipeline properties (for parcel history and estimates) or valued from ZIP $/ft² otherwise.
export class LiveListingAdapter {
  constructor({ endpoint, timeoutMs = 9000 }) { this.endpoint = endpoint; this.timeoutMs = timeoutMs; }

  async load(areaByZip = new Map(), known = []) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.endpoint, { signal: controller.signal, cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || `Live listing feed returned ${response.status}`);
      const knownByAddress = new Map(known.map((item) => [addressKey(item.address, item.zip), item]));
      const records = (payload.properties || []).map((row, index) => {
        const zip = String(row.zip || '');
        const match = knownByAddress.get(addressKey(row.address, zip));
        const area = areaByZip.get(zip);
        const ppsf = area?.metrics?.medianPpsf;
        const estimate = match?.estimate || (row.sqft && ppsf ? { value: Math.round(row.sqft * ppsf), low: Math.round(row.sqft * ppsf * 0.85), high: Math.round(row.sqft * ppsf * 1.15), method: 'zip $/ft²' } : null);
        const areaScore = area?.score?.total ?? null;
        return {
          ...(match || {}), id: row.id || `live-${zip}-${index}`, status: 'for-sale', address: row.address, city: row.city, zip,
          coordinates: match?.coordinates || [Number(row.longitude), Number(row.latitude)], price: Number(row.list_price), listPrice: Number(row.list_price),
          eventDate: row.listed_date, listedDate: row.listed_date, sqft: row.sqft, beds: row.beds, baths: row.baths, propertyType: row.property_type,
          dom: row.days_on_market, estimate, areaScore, deal: dealSignal({ ask: Number(row.list_price), estimate, areaScore, projectLift: match?.projectLift || 0 }),
          history: [...(match?.history || []), ...(row.history || [])].sort((a, b) => String(a.date).localeCompare(String(b.date))),
          sourceName: payload.provider || 'Live provider', sourceUpdatedAt: row.source_updated_at, sourceUrl: row.source_url || null, live: true,
        };
      });
      return { records, metadata: { provider: payload.provider, retrievedAt: payload.retrieved_at, sourceUpdatedAt: payload.source_updated_at } };
    } finally { clearTimeout(timeout); }
  }
}
