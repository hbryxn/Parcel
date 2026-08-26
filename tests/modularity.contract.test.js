import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeListing } from '../src/domain/listing.js';
import { MarketService } from '../src/analytics/marketService.js';
import { ListingGeoJSON } from '../src/presentation/listingGeoJSON.js';
import { BuildingFootprintRepository } from '../src/data/buildingFootprintRepository.js';
import { ListingRepository } from '../src/data/listingRepository.js';
import { SIGNAL_COLOR_EXPRESSION } from '../src/map/layers/listingLayer.js';
import { LiveListingAdapter } from '../src/data/adapters/liveListingAdapter.js';
import { DataQualityService } from '../src/analytics/dataQualityService.js';
import { getLiveListingsResponse, normalizeRentCastListing } from '../server/liveListings.js';

const sold = makeListing({ id: 's1', mode: 'sold', address: 'Sold', zip: '31312', price: 300000, sqft: 1500, trend: -9.85, latitude: 32.2, longitude: -81.3 });
const active = makeListing({ id: 'a1', mode: 'for-sale', address: 'Active', zip: '31312', price: 450000, sqft: 2000, trend: -9.85, latitude: 32.3, longitude: -81.4 });

test('sold and active modes never mix summary prices', () => {
  const market = new MarketService({ sold: [sold], 'for-sale': [active] }, []);
  assert.equal(market.query().summary.medianPrice, 300000);
  market.setMode('for-sale');
  assert.equal(market.query().summary.medianPrice, 450000);
  assert.equal(market.query().records[0].priceKind, 'ask');
});

test('listing presentation produces a closed building footprint', () => {
  const market = new MarketService({ sold: [sold], 'for-sale': [] }, []);
  const feature = ListingGeoJSON.footprints([sold], market, new BuildingFootprintRepository()).features[0];
  assert.equal(feature.geometry.type, 'Polygon');
  assert.deepEqual(feature.geometry.coordinates[0][0], feature.geometry.coordinates[0].at(-1));
  assert.equal(feature.properties.score, -9.85);
  assert.equal(feature.properties.footprintPrecision, 'modeled footprint');
});

test('31312 expansion contains independently sourced sold records', async () => {
  const payload = JSON.parse(await readFile(new URL('../public/sold_31312.json', import.meta.url)));
  assert.equal(payload.zip, '31312');
  assert.ok(payload.properties.length >= 9);
});

test('composite repository normalizes sold and active feeds independently', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({ ok: true, json: async () => url.includes('active')
    ? { as_of: '2026-08-09', properties: [{ address: 'A', zip: '31312', list_price: 400000, sqft: 2000, latitude: 32.2, longitude: -81.3 }] }
    : { zip: '31312', properties: [{ address: 'S', sale_price: 300000, sqft: 1500, latitude: 32.2, longitude: -81.3 }] } });
  try {
    const data = await new ListingRepository({ sold: ['/sold.json'], 'for-sale': ['/active.json'] }).load();
    assert.equal(data.listings.sold[0].priceKind, 'sale');
    assert.equal(data.listings['for-sale'][0].priceKind, 'ask');
    assert.equal(data.provenance.live, false);
  } finally { globalThis.fetch = originalFetch; }
});

test('live adapter normalizes provenance and pricing fields', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({
    provider: 'RentCast', retrieved_at: '2026-08-26T12:00:00Z', source_updated_at: '2026-08-26T11:00:00Z',
    properties: [{ id: 'rc-1', address: '10 Live Way', city: 'Guyton', zip: '31312', list_price: 425000, sqft: 2000, latitude: 32.2, longitude: -81.3, source_updated_at: '2026-08-26T11:00:00Z' }],
  }) });
  try {
    const result = await new LiveListingAdapter({ endpoint: '/api/listings/live', timeoutMs: 100 }).load();
    assert.equal(result.records[0].sourceName, 'RentCast');
    assert.equal(result.records[0].priceKind, 'ask');
    assert.equal(result.metadata.sourceUpdatedAt, '2026-08-26T11:00:00Z');
  } finally { globalThis.fetch = originalFetch; }
});

test('repository falls back to snapshot when live provider fails', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url === '/api/listings/live') return { ok: false, status: 503, json: async () => ({ message: 'Live provider is not configured.' }) };
    return { ok: true, json: async () => url.includes('active')
      ? { as_of: '2026-08-09', properties: [{ address: 'Fallback', zip: '31312', list_price: 400000, sqft: 2000, latitude: 32.2, longitude: -81.3 }] }
      : { zip: '31312', properties: [{ address: 'Sale', sale_price: 300000, sqft: 1500, latitude: 32.2, longitude: -81.3 }] } };
  };
  try {
    const data = await new ListingRepository({ sold: ['/sold.json'], 'for-sale': ['/active.json'] }, { endpoint: '/api/listings/live', timeoutMs: 100 }).load();
    assert.equal(data.listings['for-sale'][0].address, 'Fallback');
    assert.equal(data.provenance.live, false);
    assert.match(data.provenance.fallbackReason, /not configured/i);
  } finally { globalThis.fetch = originalFetch; }
});

test('data quality separates freshness, completeness and held-out error', () => {
  const soldRecords = Array.from({ length: 25 }, (_, index) => makeListing({
    id: `q-${index}`, mode: 'sold', address: `${index} Test St`, zip: index < 13 ? '31312' : '31401',
    price: (180 + index % 5 * 5) * (1400 + index * 20), sqft: 1400 + index * 20,
    latitude: 32.1 + index / 1000, longitude: -81.2, sourceUpdatedAt: '2026-08-20T00:00:00Z',
  }));
  const activeRecords = [makeListing({ id: 'live-1', mode: 'for-sale', address: '10 Live Way', zip: '31312', price: 425000, sqft: 2000, latitude: 32.2, longitude: -81.3, sourceUpdatedAt: '2026-08-26T11:00:00Z' })];
  const report = new DataQualityService().evaluate({
    listings: { sold: soldRecords, 'for-sale': activeRecords }, references: { activeSnapshot: activeRecords }, provenance: { provider: 'RentCast', live: true }, now: new Date('2026-08-26T12:00:00Z'),
  });
  assert.equal(report.source.status, 'current');
  assert.equal(report.completeness.overallPct, 100);
  assert.equal(report.backtest.sampleSize, 25);
  assert.ok(report.backtest.medianErrorPct < 10);
  assert.equal(report.reconciliation.within2Pct, 100);
});

test('live server requires a key and safely normalizes provider records', async () => {
  const missing = await getLiveListingsResponse('');
  assert.equal(missing.status, 503);
  const normalized = normalizeRentCastListing({
    id: 'rc-2', addressLine1: '12 Price Rd', city: 'Guyton', zipCode: '31312', price: 400000,
    squareFootage: 1800, latitude: 32.2, longitude: -81.3, history: { '2026-08-01': { price: 420000 } }, lastSeenDate: '2026-08-26T11:00:00Z',
  });
  assert.equal(normalized.address, '12 Price Rd');
  assert.ok(normalized.price_change_pct < 0);
});

test('map color expression maps positive to green and negative to red', () => {
  assert.equal(SIGNAL_COLOR_EXPRESSION[2], '#42df92');
  assert.equal(SIGNAL_COLOR_EXPRESSION[4], '#ff5f57');
});

test('source building footprints are closed before GeoJSON projection', () => {
  const repository = new BuildingFootprintRepository();
  const listing = { ...sold, footprint: [[-81.31,32.2],[-81.30,32.2],[-81.30,32.21],[-81.31,32.21]] };
  const resolved = repository.resolve(listing);
  assert.equal(resolved.precision, 'source footprint');
  assert.deepEqual(resolved.ring[0], resolved.ring.at(-1));
});
