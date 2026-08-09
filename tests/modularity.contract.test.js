import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeListing } from '../src/domain/listing.js';
import { MarketService } from '../src/analytics/marketService.js';
import { ListingGeoJSON } from '../src/presentation/listingGeoJSON.js';
import { BuildingFootprintRepository } from '../src/data/buildingFootprintRepository.js';
import { ListingRepository } from '../src/data/listingRepository.js';
import { SIGNAL_COLOR_EXPRESSION } from '../src/map/layers/listingLayer.js';

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
    assert.equal(data.sold[0].priceKind, 'sale');
    assert.equal(data['for-sale'][0].priceKind, 'ask');
  } finally { globalThis.fetch = originalFetch; }
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
