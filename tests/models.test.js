import test from 'node:test';
import assert from 'node:assert/strict';
import { cagr, median, percentileRank, quantile, spearman } from '../src/analytics/stats.js';
import { backtestAreaModel, priceFeatures, scoreAreas, shiftMonth, valueAt, verdictFor } from '../src/analytics/areaModel.js';
import { assessmentReliable, assessmentRatios, backtestValuation, createIndex, dealSignal, estimateValue, isUsableSale } from '../src/analytics/valuationModel.js';
import { impactAt, kernel, resolveProject, timeFactor } from '../src/analytics/projectImpact.js';

// Monthly series growing at `annual` % per year from `start`.
const series = (start, annual, months = 72, from = '2020-01') => Array.from({ length: months }, (_, index) => [shiftMonth(from, index), start * (1 + annual / 100) ** (index / 12)]);

test('stats helpers handle medians, quantiles, ranks and growth', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(quantile([0, 10], 0.25), 2.5);
  assert.equal(percentileRank([1, 2, 3, 4], 4), 0.875);
  assert.equal(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1);
  assert.ok(Math.abs(cagr(121, 100, 2) - 10) < 1e-9);
});

test('price features measure change, growth and yield from a series', () => {
  const zhvi = series(200000, 10, 60);
  const zori = zhvi.map(([month, value]) => [month, value * 0.006]);
  const features = priceFeatures(zhvi, zori);
  assert.ok(Math.abs(features.yoyPct - 10) < 0.01);
  assert.ok(Math.abs(features.cagr3Pct - 10) < 0.01);
  assert.ok(Math.abs(features.grossYieldPct - 7.2) < 0.01);
  assert.ok(features.drawdownPct <= 0 && features.drawdownPct > -0.01);
  assert.equal(valueAt(zhvi, '1999-01'), null);
});

test('area scores rank stronger markets higher and explain why', () => {
  const areas = [
    { zip: 'A', metrics: { yoyPct: 8, cagr3Pct: 7, accelerationPct: 1, monthsSupply: 2, medianDom: 20, grossYieldPct: 7, drawdownPct: 0, volatilityPct: 0.2, homesSold90d: 60 } },
    { zip: 'B', metrics: { yoyPct: 1, cagr3Pct: 2, accelerationPct: 0, monthsSupply: 5, medianDom: 60, grossYieldPct: 5.5, drawdownPct: -2, volatilityPct: 0.4, homesSold90d: 60 } },
    { zip: 'C', metrics: { yoyPct: -6, cagr3Pct: -2, accelerationPct: -2, monthsSupply: 9, medianDom: 120, grossYieldPct: 4, drawdownPct: -10, volatilityPct: 0.9, homesSold90d: 60 } },
  ];
  const [a, b, c] = scoreAreas(areas);
  assert.ok(a.score.total > b.score.total && b.score.total > c.score.total);
  assert.ok(a.score.strengths.length > 0);
  assert.ok(c.score.risks.some((reason) => /down/i.test(reason)));
  assert.ok(c.score.tags.some((tag) => tag.key === 'correction'));
});

test('verdicts require evidence: thin coverage cannot earn an extreme call', () => {
  assert.equal(verdictFor(80, 90).key, 'strong');
  assert.equal(verdictFor(80, 50).key, 'favorable');
  assert.equal(verdictFor(10, 50).key, 'caution');
  assert.equal(verdictFor(80, 20).key, 'limited');
});

test('area backtest detects a persistent momentum signal', () => {
  const zhvi = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`z${index}`, series(250000, index - 4, 110, '2017-01')]));
  const result = backtestAreaModel(zhvi, {}, { lookbacks: [12, 24] });
  assert.equal(result.available, true);
  assert.ok(result.meanRankCorrelation > 0.8);
  assert.ok(result.meanSpreadPct > 0);
});

const index = createIndex({ '31401': series(100, 12, 96, '2018-01') }, series(100, 5, 96, '2018-01'));

test('non-arm’s-length and lot sales never anchor a valuation', () => {
  assert.equal(isUsableSale({ price: 250000, quality: 'U' }), false);
  assert.equal(isUsableSale({ price: 10, quality: 'Q' }), false);
  const parcel = { zip: '31401', yearBuilt: 2021, fmv: null, sales: [{ date: '2019-03-01', price: 40000, quality: 'Q' }, { date: '2022-06-01', price: 300000, quality: 'Q' }] };
  const estimate = estimateValue(parcel, { index, ratios: null, asOf: '2024-06-01' });
  assert.equal(estimate.basisSale.price, 300000); // the 2019 lot sale is ignored
  assert.ok(estimate.value > 300000);
});

test('assessments set before construction are treated as unreliable', () => {
  assert.equal(assessmentReliable({ fmv: 60000, fmvBuilding: 0, yearBuilt: 2025, assessmentYear: 2025 }), false);
  assert.equal(assessmentReliable({ fmv: 300000, fmvBuilding: 220000, yearBuilt: 1990, assessmentYear: 2025 }), true);
});

test('assessment ratios prefer neighbourhood, then ZIP × value band, then ZIP', () => {
  const pairs = Array.from({ length: 10 }, () => ({ zip: '31401', neighborhood: 'N1', price: 130, fmv: 100000 }))
    .concat(Array.from({ length: 10 }, () => ({ zip: '31401', neighborhood: null, price: 110, fmv: 100000 })));
  const ratios = assessmentRatios(pairs.map((pair) => ({ ...pair, price: pair.price * 1000 })));
  assert.equal(ratios.byNeighborhood.N1, 1.3);
  assert.ok(ratios.byZip['31401'] > 1.1 && ratios.byZip['31401'] < 1.3);
});

test('valuation backtest predicts each sale only from earlier information', () => {
  const parcels = Array.from({ length: 40 }, (_, position) => ({
    pin: `p${position}`, zip: '31401', fmv: null, yearBuilt: 1990,
    sales: [{ date: '2019-01-15', price: 200000, quality: 'Q' }, { date: '2025-03-15', price: 0, quality: 'Q' }],
  }));
  // Price the test sale exactly on the index path so a leak-free model is near-perfect.
  for (const parcel of parcels) parcel.sales[1].price = Math.round(200000 * index('31401', '2025-03-15') / index('31401', '2019-01-15'));
  const result = backtestValuation(parcels, { index, testFrom: '2025-01-01' });
  assert.equal(result.sampleSize, 40);
  assert.ok(result.medianErrorPct < 1);
});

test('deal signals separate discounts from overpricing', () => {
  const estimate = { value: 400000 };
  assert.equal(dealSignal({ ask: 360000, estimate, areaScore: 60 }).key, 'good');
  assert.equal(dealSignal({ ask: 460000, estimate, areaScore: 60 }).key, 'bad');
  assert.equal(dealSignal({ ask: 400000, estimate, areaScore: 50 }).key, 'neutral');
  assert.equal(dealSignal({ ask: 400000, estimate: null, areaScore: 50 }), null);
});

test('project impact decays with distance, stage and time', () => {
  assert.equal(kernel(0, 1), 1);
  assert.equal(kernel(1, 1), 0);
  assert.ok(kernel(0.3, 1) > kernel(0.6, 1));
  const now = new Date('2026-09-01');
  assert.ok(timeFactor(2030, 'design', now) < timeFactor(2027, 'design', now));
  const base = { id: 'x', name: 'Park', category: 'parks', scale: 'neighborhood', expectedYear: 2027, geometry: { type: 'Point', coordinates: [-81.1, 32.08] } };
  const planned = resolveProject({ ...base, stage: 'planning' }, now);
  const building = resolveProject({ ...base, stage: 'construction' }, now);
  const withdrawn = resolveProject({ ...base, stage: 'withdrawn' }, now);
  const near = [-81.1, 32.081]; const far = [-81.0, 32.2];
  assert.ok(impactAt(near, [building]) > impactAt(near, [planned]));
  assert.equal(impactAt(near, [withdrawn]), 0);
  assert.equal(impactAt(far, [building]), 0);
});

test('ports lift the region but weigh on immediate neighbours', () => {
  const port = resolveProject({ id: 'p', name: 'Port', category: 'port', scale: 'regional', stage: 'construction', expectedYear: 2027, geometry: { type: 'Point', coordinates: [-81.1, 32.08] } }, new Date('2026-09-01'));
  assert.equal(port.direction, 'mixed');
  assert.ok(impactAt([-81.1, 32.0805], [port]) < 0);
  assert.ok(impactAt([-81.2, 32.15], [port]) > 0);
});

test('development projects: polygons count as zero distance inside, and group correctly', async () => {
  const { distanceToGeometry, groupOf } = await import('../src/analytics/projectImpact.js');
  const plat = { type: 'Polygon', coordinates: [[[-81.2, 32.0], [-81.19, 32.0], [-81.19, 32.01], [-81.2, 32.01], [-81.2, 32.0]]] };
  assert.equal(distanceToGeometry([-81.195, 32.005], plat), 0);
  assert.ok(distanceToGeometry([-81.18, 32.005], plat) > 0.5);
  assert.equal(groupOf('subdivision'), 'housing');
  assert.equal(groupOf('business'), 'business');
  assert.equal(groupOf('drainage'), 'infrastructure');
  const store = resolveProject({ id: 's', name: 'Grocery', category: 'business', subtype: 'Grocery', stage: 'complete', likelyOpen: true, effects: [{ lift: 1.6, radiusMiles: 1.2 }], geometry: { type: 'Point', coordinates: [-81.1, 32.08] } }, new Date('2026-09-01'));
  assert.equal(store.stageLabel, 'Likely open');
  assert.equal(store.group, 'business');
});
