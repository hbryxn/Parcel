import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { splitCSVLine } from '../pipeline/lib/http.js';
import { pointInGeometry, ringCentroid, samplePoints } from '../pipeline/lib/geo.js';
import { normalizePin } from '../pipeline/sources/parcels.js';
import { normalizeRentCast, parseDate } from '../pipeline/sources/listings.js';
import { addressKey } from '../pipeline/build/properties.js';
import { getLiveListingsResponse, normalizeRentCastListing } from '../server/liveListings.js';
import { changeMetric, fromOffMarketRow, makeProperty } from '../src/domain/property.js';
import { MarketService } from '../src/analytics/marketService.js';
import { esc, safeUrl } from '../src/ui/format.js';

test('CSV splitter respects quotes and escaped quotes', () => {
  assert.deepEqual(splitCSVLine('1,"Savannah, GA","say ""hi""",'), ['1', 'Savannah, GA', 'say "hi"', '']);
});

test('dates from every feed format normalize to ISO', () => {
  assert.equal(parseDate('July-28-2025'), '2025-07-28');
  assert.equal(parseDate('September-9-2025'), '2025-09-09');
  assert.equal(parseDate('2026-08-25T11:00:00Z'), '2026-08-25');
  assert.equal(parseDate(''), null);
});

test('parcel PINs from different digest vintages match', () => {
  assert.equal(normalizePin('1-0992 -01-020'), normalizePin('10992 01020'));
  assert.equal(normalizePin('10010 01001A'), '1001001001A');
});

test('address keys tolerate suffix spelling and case', () => {
  assert.equal(addressKey('28 River Oaks Road', '31410'), addressKey('28 RIVER OAKS RD', '31410-1234'));
  assert.notEqual(addressKey('28 River Oaks Rd', '31410'), addressKey('28 River Oaks Rd', '31411'));
});

test('geometry helpers find centroids and interior samples', () => {
  const square = [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]];
  assert.deepEqual(ringCentroid(square), [1, 1]);
  const geometry = { type: 'Polygon', coordinates: [square] };
  assert.ok(pointInGeometry([1, 1], geometry));
  assert.ok(!pointInGeometry([3, 1], geometry));
  assert.ok(samplePoints(geometry, 9).every((point) => pointInGeometry(point, geometry)));
});

test('RentCast records keep status and price history', () => {
  const record = normalizeRentCast({
    id: 'r1', status: 'Inactive', addressLine1: '1 Test St', zipCode: '31401', price: 300000, latitude: 32, longitude: -81,
    removedDate: '2026-08-01', listedDate: '2026-05-01', history: { '2026-05-01': { event: 'Sale Listing', price: 320000 }, '2026-07-01': { event: 'Sale Listing', price: 300000 } },
  });
  assert.equal(record.status, 'delisted');
  assert.equal(record.priceHistory.length, 2);
  assert.equal(record.eventDate, '2026-08-01');
});

test('live server requires a key and normalizes provider records with history', async () => {
  const missing = await getLiveListingsResponse('');
  assert.equal(missing.status, 503);
  const normalized = normalizeRentCastListing({
    id: 'rc-2', addressLine1: '12 Price Rd', city: 'Guyton', zipCode: '31312', price: 400000,
    squareFootage: 1800, latitude: 32.2, longitude: -81.3, history: { '2026-08-01': { price: 420000 } }, lastSeenDate: '2026-08-26T11:00:00Z',
  });
  assert.equal(normalized.address, '12 Price Rd');
  assert.ok(normalized.price_change_pct < 0);
  assert.equal(normalized.history[0].price, 420000);
});

test('live server spends one billable request by default', async () => {
  let calls = 0;
  const fake = async () => { calls += 1; return { ok: true, json: async () => Array.from({ length: 500 }, (_, i) => ({ id: `x${i}`, addressLine1: `${i} A St`, zipCode: '31401', price: 200000, latitude: 32, longitude: -81 })) }; };
  const response = await getLiveListingsResponse('key', fake);
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
});

test('price-change colouring is positive when good for the owner or buyer', () => {
  assert.equal(changeMetric({ status: 'for-sale', deal: { gapPct: 8 } }), 8);
  assert.equal(changeMetric({ status: 'sold', resale: { annualPct: -3 } }), -3);
  const off = fromOffMarketRow(['pin', 'address', 'lng', 'lat', 'yearBuilt', 'lastSalePrice', 'lastSaleDate', 'estimate', 'estimateMethod', 'assessedValue', 'annualSinceSalePct', 'saleCount'], ['P1', '1 A St', -81, 32, 1990, 200000, '2015-01-01', 320000, 'blend', 250000, 4.6, 2], '31401', 55);
  assert.equal(off.status, 'off-market');
  assert.equal(off.displayPrice, 320000);
  assert.equal(off.change, 4.6);
});

test('market service filters by status, band and search terms', () => {
  const properties = [
    makeProperty({ id: 'a', status: 'sold', address: '1 Oak St', zip: '31401', price: 200000, coordinates: [-81, 32] }),
    makeProperty({ id: 'b', status: 'for-sale', address: '2 Pine St', zip: '31405', price: 600000, coordinates: [-81, 32] }),
  ];
  const market = new MarketService({ properties, areas: [], projects: [] });
  assert.equal(market.query({ statuses: ['sold'], band: 'all', query: '', verdict: 'all' }).records.length, 1);
  assert.equal(market.query({ statuses: ['sold', 'for-sale'], band: 'upper', query: '', verdict: 'all' }).records[0].id, 'b');
  assert.equal(market.query({ statuses: ['sold', 'for-sale'], band: 'all', query: 'oak 31401', verdict: 'all' }).records[0].id, 'a');
  assert.equal(market.query({ statuses: ['sold', 'for-sale'], band: 'all', query: '', verdict: 'all' }).counts['for-sale'], 1);
});

test('untrusted text is escaped and only web links are allowed', () => {
  assert.equal(esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('https://gaports.com/x'), 'https://gaports.com/x');
});

test('published datasets honour the app contract', { skip: !existsSync(new URL('../public/data/manifest.json', import.meta.url)) }, () => {
  const read = (name) => JSON.parse(readFileSync(new URL(`../public/data/${name}`, import.meta.url), 'utf8'));
  const manifest = read('manifest.json');
  const { areas } = read('areas.json');
  const { properties } = read('properties.json');
  assert.ok(manifest.sources.length >= 8);
  assert.ok(manifest.quality.valuation.sampleSize > 100);
  assert.ok(areas.length >= 20 && areas.every((area) => area.geometry && area.score));
  assert.ok(properties.every((item) => item.coordinates.every(Number.isFinite) && item.price > 0 && item.status));
  for (const zip of manifest.offMarketColumns ? areas.map((area) => area.zip) : []) {
    const file = new URL(`../public/data/parcels/${zip}.json`, import.meta.url);
    if (existsSync(file)) { const payload = JSON.parse(readFileSync(file, 'utf8')); assert.deepEqual(payload.columns, manifest.offMarketColumns); }
  }
});

test('commercial permits become store openings only for real new businesses', async () => {
  const { classifyBusiness } = await import('../pipeline/sources/development.js');
  const kind = (workClass, description) => classifyBusiness({ workClass, description })?.type.key ?? null;
  assert.equal(kind('New', 'Construct Chick-fil-A fast food restaurant with drive-thru'), 'restaurant');
  assert.equal(classifyBusiness({ workClass: 'New', description: 'Construct Chick-fil-A fast food restaurant' }).brand, 'Chick-fil-A');
  assert.equal(kind('New', 'Ground up construction of a convenience store with (3) gas pumps.'), 'fuel');
  assert.equal(kind('New', 'Six story hotel with 242 rooms and ground floor retail'), 'hotel');
  assert.equal(kind('Renovation', 'Interior tenant improvement for a new restaurant'), 'restaurant');
  assert.equal(kind('Renovation', 'Re-roof of existing retail store'), null); // repair, not an opening
  assert.equal(kind('Renovation', 'Replace HVAC units at restaurant'), null);
  assert.equal(kind('New', 'Building A of a new construction quadplex'), null); // housing, not a store
});
