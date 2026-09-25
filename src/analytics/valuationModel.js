import { clamp, median, quantile } from './stats.js';
import { valueAt } from './areaModel.js';

// Sales flagged "U" by the assessor are not arm's-length (family transfers, foreclosures, bundles).
export const isUsableSale = (sale) => sale && sale.price >= 30000 && sale.quality !== 'U';

export const yearsBetween = (from, to) => (Date.parse(to) - Date.parse(from)) / (365.25 * 86400000);

// Home-price index lookups with a regional fallback for ZIPs Zillow does not cover.
export const createIndex = (seriesByZip, fallbackSeries) => (zip, date) => {
  const month = String(date).slice(0, 7);
  const series = seriesByZip[zip]?.length ? seriesByZip[zip] : fallbackSeries;
  const value = valueAt(series, month) ?? series[0]?.[1];
  return Number.isFinite(value) ? value : null;
};

export const indexAdjust = (index, zip, price, fromDate, toDate) => {
  const from = index(zip, fromDate); const to = index(zip, toDate);
  return from && to ? price * (to / from) : null;
};

const ageBucket = (years) => (years <= 3 ? 'recent' : years <= 10 ? 'mid' : 'old');
export const DEFAULT_WEIGHTS = { recent: 0.85, mid: 0.55, old: 0.25 };

// Assessor values drift from market values unevenly, by neighborhood and by price tier.
// Ratios are learned hierarchically: assessor neighborhood → ZIP × value band → ZIP → region.
const valueBand = (fmv) => (fmv < 150000 ? 0 : fmv < 300000 ? 1 : fmv < 500000 ? 2 : 3);
const MIN_RATIO_SAMPLES = 8;

export const assessmentRatios = (pairs) => {
  const groups = { neighborhood: new Map(), band: new Map(), zip: new Map() };
  const all = [];
  const add = (map, key, ratio) => map.set(key, [...(map.get(key) || []), ratio]);
  for (const { zip, neighborhood, price, fmv } of pairs) {
    if (!(fmv > 20000 && price > 0)) continue;
    const ratio = price / fmv;
    if (ratio < 0.3 || ratio > 4) continue; // data-entry outliers
    all.push(ratio);
    if (neighborhood) add(groups.neighborhood, neighborhood, ratio);
    add(groups.band, `${zip}|${valueBand(fmv)}`, ratio);
    add(groups.zip, zip, ratio);
  }
  const reduce = (map) => Object.fromEntries([...map.entries()].filter(([, ratios]) => ratios.length >= MIN_RATIO_SAMPLES).map(([key, ratios]) => [key, median(ratios)]));
  return { regional: median(all), byNeighborhood: reduce(groups.neighborhood), byBand: reduce(groups.band), byZip: reduce(groups.zip) };
};

export const ratioFor = (ratios, parcel) => ratios?.byNeighborhood?.[parcel.neighborhood]
  ?? ratios?.byBand?.[`${parcel.zip}|${valueBand(parcel.fmv)}`] ?? ratios?.byZip?.[parcel.zip] ?? ratios?.regional ?? null;

// An assessment set before the house was finished describes a lot, not a home.
export const assessmentReliable = (parcel) => {
  if (!(parcel.fmv > 20000)) return false;
  const year = parcel.assessmentYear || 2025;
  if (parcel.yearBuilt && parcel.yearBuilt >= year - 1 && !(parcel.fmvBuilding > parcel.fmv * 0.4)) return false;
  return !(parcel.fmvBuilding !== null && parcel.fmvBuilding !== undefined && parcel.fmvBuilding < parcel.fmv * 0.15);
};

// Point estimate for a parcel as of `asOf`, using only information that predates it.
export function estimateValue(parcel, { index, ratios, weights = DEFAULT_WEIGHTS, asOf, errorBands = {} }) {
  // A sale recorded before the house was built priced a lot, not this home.
  const builtBy = parcel.yearBuilt ? `${parcel.yearBuilt + 1}-01-01` : '0000';
  const prior = [...(parcel.sales || [])].filter((sale) => isUsableSale(sale) && sale.date < asOf && sale.date >= builtBy).at(-1);
  const indexed = prior ? indexAdjust(index, parcel.zip, prior.price, prior.date, asOf) : null;
  const ratio = ratioFor(ratios, parcel);
  const assessed = assessmentReliable(parcel) && ratio ? parcel.fmv * ratio : null;
  const age = prior ? yearsBetween(prior.date, asOf) : null;
  let value = null; let method = null;
  if (indexed && assessed) { const w = weights[ageBucket(age)]; value = indexed * w + assessed * (1 - w); method = 'blend'; } else if (indexed) { value = indexed; method = 'repeat-sale'; } else if (assessed) { value = assessed; method = 'assessment'; }
  if (!value) return null;
  const band = errorBands[method] ?? 0.15;
  return { value: Math.round(value), low: Math.round(value * (1 - band)), high: Math.round(value * (1 + band)), method, basisSale: prior || null, basisAgeYears: age };
}

const summarize = (rows) => {
  const apes = rows.map((row) => Math.abs(row.predicted - row.actual) / row.actual * 100);
  return {
    sampleSize: rows.length, medianErrorPct: median(apes), p80ErrorPct: quantile(apes, 0.8),
    within10Pct: rows.length ? apes.filter((ape) => ape <= 10).length / rows.length * 100 : null,
    within20Pct: rows.length ? apes.filter((ape) => ape <= 20).length / rows.length * 100 : null,
    biasPct: median(rows.map((row) => (row.predicted - row.actual) / row.actual * 100)),
  };
};

// Out-of-sample test on the most recent recorded sales. Assessment ratios and blend
// weights are learned on the other folds only, so nothing about a test sale leaks in.
export function backtestValuation(parcels, { index, testFrom, folds = 5 }) {
  const tests = [];
  for (const parcel of parcels) {
    const last = (parcel.sales || []).filter(isUsableSale).at(-1);
    if (!last || last.date < testFrom || last.quality !== 'Q' || !parcel.zip) continue;
    tests.push({ parcel, sale: last });
  }
  const grid = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
  const predictions = { blend: [], 'repeat-sale': [], assessment: [], combined: [] };
  let unvalued = 0;
  const learned = [];
  for (let fold = 0; fold < folds; fold += 1) {
    const train = tests.filter((_, position) => position % folds !== fold);
    const test = tests.filter((_, position) => position % folds === fold);
    const ratios = assessmentRatios(train.map(({ parcel, sale }) => ({ zip: parcel.zip, neighborhood: parcel.neighborhood, price: sale.price, fmv: parcel.fmv })));
    const weights = {};
    for (const bucket of ['recent', 'mid', 'old']) {
      const candidates = train.map(({ parcel, sale }) => {
        const estimate = estimateValue(parcel, { index, ratios, asOf: sale.date, weights: { recent: 0, mid: 0, old: 0 } });
        const indexedOnly = estimateValue({ ...parcel, fmv: null }, { index, ratios, asOf: sale.date });
        return estimate && indexedOnly && ageBucket(indexedOnly.basisAgeYears) === bucket ? { assessed: estimate.value, indexed: indexedOnly.value, actual: sale.price } : null;
      }).filter(Boolean);
      weights[bucket] = candidates.length < 20 ? DEFAULT_WEIGHTS[bucket] : grid.reduce((best, w) => {
        const error = median(candidates.map((row) => Math.abs(row.indexed * w + row.assessed * (1 - w) - row.actual) / row.actual));
        return error < best.error ? { w, error } : best;
      }, { w: DEFAULT_WEIGHTS[bucket], error: Infinity }).w;
    }
    learned.push(weights);
    for (const { parcel, sale } of test) {
      const estimate = estimateValue(parcel, { index, ratios, weights, asOf: sale.date });
      if (!estimate) { unvalued += 1; continue; }
      predictions[estimate.method].push({ predicted: estimate.value, actual: sale.price });
      predictions.combined.push({ predicted: estimate.value, actual: sale.price });
    }
  }
  const weights = Object.fromEntries(['recent', 'mid', 'old'].map((bucket) => [bucket, median(learned.map((item) => item[bucket]))]));
  const byMethod = Object.fromEntries(Object.entries(predictions).map(([method, rows]) => [method, summarize(rows)]));
  const errorBands = Object.fromEntries(Object.entries(byMethod).filter(([method]) => method !== 'combined').map(([method, stats]) => [method, clamp((stats.medianErrorPct ?? 15) / 100, 0.05, 0.35)]));
  return {
    method: `${folds}-fold out-of-sample test on qualified Chatham sales recorded since ${testFrom}`,
    testFrom, ...byMethod.combined, byMethod, weights, errorBands, unvalued, coveragePct: tests.length ? (1 - unvalued / tests.length) * 100 : null,
  };
}

// Comparable-sales estimate for listings that report square footage.
export function compsEstimate(listing, comps, { index, asOf, maxComps = 12 }) {
  if (!(listing.sqft > 300)) return null;
  const pool = comps.filter((comp) => comp.zip === listing.zip && comp.sqft > 300 && comp.price > 30000 && Math.abs(comp.sqft / listing.sqft - 1) <= 0.35 && comp.id !== listing.id);
  if (pool.length < 4) return null;
  const nearest = pool.map((comp) => ({ comp, distance: Math.hypot((comp.lng - listing.lng) * 0.85, comp.lat - listing.lat) }))
    .sort((a, b) => a.distance - b.distance).slice(0, maxComps).map(({ comp }) => comp);
  const ppsf = nearest.map((comp) => (indexAdjust(index, comp.zip, comp.price, comp.eventDate, asOf) || comp.price) / comp.sqft);
  const value = median(ppsf) * listing.sqft;
  return { value: Math.round(value), low: Math.round(quantile(ppsf, 0.25) * listing.sqft), high: Math.round(quantile(ppsf, 0.75) * listing.sqft), method: 'comps', comps: nearest.length };
}

// Turn an asking price, a value estimate and the area outlook into a plain-language call.
export function dealSignal({ ask, estimate, areaScore, projectLift = 0 }) {
  if (!(ask > 0) || !estimate?.value) return null;
  const gapPct = (estimate.value - ask) / estimate.value * 100;
  const area = Number.isFinite(areaScore) ? areaScore : 50;
  const score = Math.round(clamp(0.55 * clamp(50 + gapPct * 3, 0, 100) + 0.35 * area + 0.1 * clamp(50 + projectLift * 8, 0, 100), 0, 100));
  let key; let label;
  if (gapPct >= 7 && area >= 50) { key = 'good'; label = 'Potential good buy'; } else if (gapPct >= 7) { key = 'watch'; label = 'Discounted, softer area'; } else if (gapPct <= -10 && area < 45) { key = 'bad'; label = 'Overpriced in a soft market'; } else if (gapPct <= -7) { key = 'bad'; label = 'Priced above estimated value'; } else if (area >= 60) { key = 'watch'; label = 'Fair price, strong area'; } else { key = 'neutral'; label = 'Priced near value'; }
  return { key, label, gapPct: Number(gapPct.toFixed(1)), score };
}
