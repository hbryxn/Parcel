import { readdir, readFile, stat } from 'node:fs/promises';
import { cached, getJSON, splitCSVLine } from '../lib/http.js';

const INBOX = new URL('../inbox/', import.meta.url);
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

// Accepts ISO dates, "July-28-2025" (HousingAI cleaner) and "September-9-2025" / "Sep-9-2025" style strings.
export const parseDate = (value) => {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const match = text.match(/^([A-Za-z]+)[-\s](\d{1,2}),?[-\s](\d{4})$/);
  if (match) {
    const month = MONTHS.findIndex((name) => name.startsWith(match[1].toLowerCase().slice(0, 3)));
    if (month >= 0) return `${match[3]}-${String(month + 1).padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
};

const num = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/[$,]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const STATUS = (value, fallback) => {
  const text = String(value || '').toLowerCase();
  if (/sold|closed/.test(text)) return 'sold';
  if (/pending|contingent|under contract/.test(text)) return 'pending';
  if (/inactive|removed|withdrawn|expired|cancel/.test(text)) return 'delisted'; // before /active/, which "inactive" contains
  if (/coming soon|active|for sale/.test(text)) return 'for-sale';
  return fallback;
};

const base = (record) => ({
  id: null, status: null, address: null, city: null, zip: null, price: null, listPrice: null, eventDate: null, listedDate: null,
  sqft: null, beds: null, baths: null, lotSize: null, yearBuilt: null, propertyType: null, dom: null, lng: null, lat: null,
  url: null, mls: null, sourceName: null, sourceUpdatedAt: null, priceHistory: [], ...record,
});

// HousingAI / Parcel JSON feeds: { properties: [...] } with sale_price or list_price rows.
const fromJSONFeed = (payload, file, fileDate) => (payload.properties || []).map((row, index) => {
  const sold = Number.isFinite(num(row.sale_price));
  const status = STATUS(row.status, sold ? 'sold' : 'for-sale');
  const eventDate = parseDate(sold ? row.sold_date : row.listed_date) || parseDate(payload.as_of) || fileDate;
  return base({
    id: row.mls ? `mls-${row.mls}` : `${file}-${index}`, status, address: row.address, city: row.city || payload.city?.split(',')[0], zip: String(row.zip || row.source_zip || payload.zip || '') || null,
    price: sold ? num(row.sale_price) : num(row.list_price), listPrice: num(row.list_price), eventDate, listedDate: parseDate(row.listed_date),
    sqft: num(row.sqft), beds: num(row.beds), baths: num(row.baths), lotSize: num(row.lot_size), yearBuilt: num(row.year_built), propertyType: row.property_type || null,
    dom: num(row.days_on_market), lng: num(row.longitude), lat: num(row.latitude), url: row.url || row.source_url || null, mls: row.mls || null,
    sourceName: /redfin/i.test(file) ? 'Redfin export' : 'Curated snapshot', sourceUpdatedAt: eventDate,
  });
});

// Redfin "Download All" CSV (recently sold, for sale, pending).
const fromRedfinCSV = (text, file) => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() && !/^"?In accordance with local MLS/i.test(line));
  const header = splitCSVLine(lines.shift()).map((cell) => cell.trim().toUpperCase());
  return lines.map((line, index) => {
    const cells = splitCSVLine(line);
    const row = Object.fromEntries(header.map((key, position) => [key, cells[position]]));
    const status = STATUS(row.STATUS || row['SALE TYPE'], 'sold');
    const eventDate = parseDate(row['SOLD DATE']) || null;
    return base({
      id: row['MLS#'] ? `mls-${row['MLS#']}` : `${file}-${index}`, status, address: row.ADDRESS, city: row.CITY, zip: row['ZIP OR POSTAL CODE'],
      price: num(row.PRICE), eventDate, sqft: num(row['SQUARE FEET']), beds: num(row.BEDS), baths: num(row.BATHS), lotSize: num(row['LOT SIZE']),
      yearBuilt: num(row['YEAR BUILT']), propertyType: row['PROPERTY TYPE'], dom: num(row['DAYS ON MARKET']), lng: num(row.LONGITUDE), lat: num(row.LATITUDE),
      url: row[header.find((key) => key.startsWith('URL'))] || null, mls: row['MLS#'] || null, sourceName: 'Redfin export', sourceUpdatedAt: eventDate,
    });
  });
};

export async function loadInbox() {
  const files = (await readdir(INBOX).catch(() => [])).filter((file) => /\.(json|csv)$/i.test(file)).sort();
  const records = []; const manifest = [];
  for (const file of files) {
    const url = new URL(file, INBOX);
    const text = await readFile(url, 'utf8');
    const fileDate = (await stat(url)).mtime.toISOString().slice(0, 10);
    const rows = file.endsWith('.csv') ? fromRedfinCSV(text, file) : fromJSONFeed(JSON.parse(text), file, fileDate);
    const valid = rows.filter((row) => row.address && row.price > 10000 && Number.isFinite(row.lat) && Number.isFinite(row.lng));
    records.push(...valid);
    const dates = valid.map((row) => row.eventDate).filter(Boolean).sort();
    manifest.push({ file, records: valid.length, dropped: rows.length - valid.length, oldest: dates[0] || null, newest: dates.at(-1) || null });
  }
  return { records, files: manifest };
}

const priceHistory = (history = {}) => Object.entries(history)
  .map(([date, event]) => ({ date: parseDate(date), event: event.event || event.listingType || 'Listing', price: num(event.price) }))
  .filter((event) => event.date && event.price).sort((a, b) => a.date.localeCompare(b.date));

export const normalizeRentCast = (listing) => base({
  id: `rc-${listing.id}`, status: STATUS(listing.status, 'for-sale'), address: listing.addressLine1 || listing.formattedAddress, city: listing.city, zip: String(listing.zipCode || '') || null,
  price: num(listing.price), listPrice: num(listing.price), eventDate: parseDate(listing.status === 'Inactive' ? listing.removedDate : listing.listedDate),
  listedDate: parseDate(listing.listedDate), sqft: num(listing.squareFootage), beds: num(listing.bedrooms), baths: num(listing.bathrooms), lotSize: num(listing.lotSize),
  yearBuilt: num(listing.yearBuilt), propertyType: listing.propertyType || null, dom: num(listing.daysOnMarket), lng: num(listing.longitude), lat: num(listing.latitude),
  url: null, mls: listing.mlsNumber || null, sourceName: 'RentCast', sourceUpdatedAt: listing.lastSeenDate || listing.listedDate || null, priceHistory: priceHistory(listing.history),
});

// Active + recently delisted inventory from RentCast, bounded by a request budget.
export async function loadRentCast(config, apiKey, options) {
  if (!apiKey) return { records: [], source: { id: 'rentcast', name: 'RentCast listings API', status: 'not-configured', records: 0, note: 'Set RENTCAST_API_KEY to refresh on-market and delisted inventory.' } };
  const { center: [lng, lat], radiusMiles } = config.region;
  const result = await cached(`rentcast-${radiusMiles}.json`, config.ttlHours.listings, async () => {
    const rows = []; let requests = 0;
    for (const [status, extra] of [['Active', {}], ['Inactive', { daysOld: String(config.rentcast.inactiveDays) }]]) {
      for (let offset = 0; requests < config.rentcast.maxRequests; offset += config.rentcast.pageSize) {
        const params = new URLSearchParams({ latitude: String(lat), longitude: String(lng), radius: String(radiusMiles), status, limit: String(config.rentcast.pageSize), offset: String(offset), ...extra });
        const page = await getJSON(`${config.sources.rentcast}?${params}`, { headers: { 'X-Api-Key': apiKey, Accept: 'application/json' } });
        requests += 1;
        rows.push(...(Array.isArray(page) ? page : []));
        if (!Array.isArray(page) || page.length < config.rentcast.pageSize) break;
      }
    }
    return { rows, requests };
  }, options);
  const records = result.value.rows.map(normalizeRentCast).filter((row) => row.address && row.price > 10000 && Number.isFinite(row.lat) && Number.isFinite(row.lng));
  return { records, source: { id: 'rentcast', name: 'RentCast listings API (active + recently delisted)', url: config.sources.rentcast, fetchedAt: result.cachedAt, status: 'ok', records: records.length, requests: result.value.requests } };
}
