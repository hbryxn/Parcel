import { cagr, clamp, mean, median, monthsBetween, pctChange, percentileRank, spearman, stdev } from './stats.js';

// ---------------------------------------------------------------------------
// Series helpers. Series are [['YYYY-MM', value], ...] sorted ascending.
// ---------------------------------------------------------------------------
export const shiftMonth = (month, delta) => {
  const [year, m] = month.split('-').map(Number);
  const total = year * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
};

export const valueAt = (series = [], month) => {
  for (let index = series.length - 1; index >= 0; index -= 1) if (series[index][0] <= month) return series[index][1];
  return null;
};

export const truncate = (series = [], month) => series.filter(([key]) => key <= month);

// ---------------------------------------------------------------------------
// Feature extraction
// ---------------------------------------------------------------------------
export function priceFeatures(zhvi = [], zori = [], asOf = zhvi.at(-1)?.[0]) {
  if (!asOf || !zhvi.length) return {};
  const at = (offset) => valueAt(zhvi, shiftMonth(asOf, -offset));
  const value = at(0);
  const recent = truncate(zhvi, asOf).slice(-37);
  const monthly = recent.slice(1).map(([, v], index) => pctChange(v, recent[index][1]));
  const peak = Math.max(...recent.map(([, v]) => v));
  const rent = valueAt(zori, asOf);
  const rentAgo = valueAt(zori, shiftMonth(asOf, -12));
  const yoyPct = pctChange(value, at(12));
  const threeMonth = at(3) ? ((value / at(3)) ** 4 - 1) * 100 : null;
  return {
    value, yoyPct, change3moAnnPct: threeMonth, accelerationPct: Number.isFinite(threeMonth) && Number.isFinite(yoyPct) ? threeMonth - yoyPct : null,
    cagr3Pct: cagr(value, at(36), 3), cagr5Pct: cagr(value, at(60), 5), cagr10Pct: cagr(value, at(120), 10),
    drawdownPct: peak ? (value / peak - 1) * 100 : null, volatilityPct: stdev(monthly),
    rent, rentYoyPct: pctChange(rent, rentAgo), grossYieldPct: rent && value ? (rent * 12) / value * 100 : null,
  };
}

export function marketFeatures(redfin = []) {
  const latest = redfin.at(-1);
  if (!latest) return {};
  const yearAgo = redfin.find((point) => point.month === shiftMonth(latest.month, -12));
  const pct = (value) => (Number.isFinite(value) ? value * 100 : null);
  return {
    marketAsOf: latest.month, medianSale: latest.medianSale, medianPpsf: latest.medianPpsf, homesSold90d: latest.homesSold, inventory: latest.inventory,
    monthsSupply: latest.inventory && latest.homesSold ? latest.inventory / (latest.homesSold / 3) : null,
    medianDom: latest.medianDom, saleToListPct: Number.isFinite(latest.saleToList) ? (latest.saleToList - 1) * 100 : null,
    soldAboveListPct: pct(latest.soldAboveList), priceDropsPct: pct(latest.priceDrops), offMarket2wkPct: pct(latest.offMarket2wk),
    inventoryYoyPct: pctChange(latest.inventory, yearAgo?.inventory), medianSaleYoyPct: pctChange(latest.medianSale, yearAgo?.medianSale),
  };
}

// ---------------------------------------------------------------------------
// Scoring: every feature is ranked against the other ZIPs in the region, so a
// score of 50 means "typical for this region", not "average nationally".
// ---------------------------------------------------------------------------
export const COMPONENTS = {
  momentum: { label: 'Price momentum', weight: 0.25, features: { yoyPct: 0.4, cagr3Pct: 0.3, accelerationPct: 0.3 } },
  demand: { label: 'Buyer demand', weight: 0.2, features: { monthsSupply: -0.3, medianDom: -0.25, saleToListPct: 0.25, priceDropsPct: -0.2 } },
  value: { label: 'Value & yield', weight: 0.2, features: { grossYieldPct: 0.6, priceToIncome: -0.4 } },
  growth: { label: 'Growth drivers', weight: 0.2, features: { forecast1yPct: 0.3, projectIndex: 0.35, builtSince2010Pct: 0.15, newBuildSharePct: 0.2 } },
  resilience: { label: 'Resilience', weight: 0.15, features: { drawdownPct: 0.5, volatilityPct: -0.5 } },
};

export const VERDICTS = [
  { min: 66, key: 'strong', label: 'Strong opportunity' },
  { min: 56, key: 'favorable', label: 'Favorable' },
  { min: 44, key: 'neutral', label: 'Neutral' },
  { min: 34, key: 'caution', label: 'Caution' },
  { min: -Infinity, key: 'risk', label: 'High risk' },
];

export const MIN_CONFIDENCE = 35;
export const verdictFor = (score, confidence = 100) => {
  if (confidence < MIN_CONFIDENCE) return { key: 'limited', label: 'Limited data' };
  // Extreme calls need broad evidence; with thinner coverage they are capped one tier short.
  let verdict = VERDICTS.find((item) => score >= item.min);
  if (confidence < 60 && verdict.key === 'strong') verdict = VERDICTS.find((item) => item.key === 'favorable');
  if (confidence < 60 && verdict.key === 'risk') verdict = VERDICTS.find((item) => item.key === 'caution');
  return { key: verdict.key, label: verdict.label };
};

// Situations a single number hides, surfaced as short tags.
const tagsFor = (metrics, parts, ranks) => {
  const tags = [];
  if (ranks.projectIndex >= 0.8 && (parts.momentum ?? 50) < 40) tags.push({ key: 'pipeline-upside', label: 'Pipeline upside', hint: 'Weak recent prices but heavy planned investment nearby — a contrarian setup.' });
  if ((parts.momentum ?? 50) >= 70 && (parts.value ?? 50) < 35) tags.push({ key: 'priced-in', label: 'Momentum, thin yield', hint: 'Prices are rising but rents do not support current values well.' });
  if (ranks.grossYieldPct >= 0.8) tags.push({ key: 'cash-flow', label: 'Cash-flow market', hint: 'Rent-to-price is among the best in the region.' });
  if (Number.isFinite(metrics.drawdownPct) && metrics.drawdownPct <= -8) tags.push({ key: 'correction', label: 'In correction', hint: `Values are ${Math.abs(metrics.drawdownPct).toFixed(0)}% below their three-year peak.` });
  if (Number.isFinite(metrics.monthsSupply) && metrics.monthsSupply >= 7) tags.push({ key: 'buyers-market', label: "Buyer's market", hint: `${metrics.monthsSupply.toFixed(1)} months of supply gives buyers negotiating room.` });
  return tags;
};

const REASONS = {
  yoyPct: [(v) => `Values up ${v.toFixed(1)}% over 12 months`, (v) => `Values ${v >= 0 ? 'up only' : 'down'} ${Math.abs(v).toFixed(1)}% over 12 months`],
  cagr3Pct: [(v) => `Strong ${v.toFixed(1)}%/yr three-year growth`, (v) => `Weak ${v.toFixed(1)}%/yr three-year growth`],
  accelerationPct: [() => 'Price growth is accelerating', () => 'Price growth is decelerating'],
  monthsSupply: [(v) => `Tight supply (${v.toFixed(1)} months)`, (v) => `Heavy supply (${v.toFixed(1)} months)`],
  medianDom: [(v) => `Homes sell fast (${Math.round(v)} days)`, (v) => `Slow sales (${Math.round(v)} median days)`],
  saleToListPct: [(v) => `Sales close ${v >= 0 ? 'above' : 'near'} list (${v.toFixed(1)}%)`, (v) => `Deep discounts to list (${v.toFixed(1)}%)`],
  priceDropsPct: [(v) => `Few price cuts (${v.toFixed(0)}% of listings)`, (v) => `Frequent price cuts (${v.toFixed(0)}% of listings)`],
  grossYieldPct: [(v) => `High rent yield (${v.toFixed(1)}% gross)`, (v) => `Low rent yield (${v.toFixed(1)}% gross)`],
  priceToIncome: [(v) => `Affordable at ${v.toFixed(1)}× income`, (v) => `Stretched at ${v.toFixed(1)}× income`],
  forecast1yPct: [(v) => `Zillow forecasts ${v >= 0 ? '+' : ''}${v.toFixed(1)}% next year`, (v) => `Zillow forecasts ${v.toFixed(1)}% next year`],
  projectIndex: [(v) => `Strong project pipeline (+${v.toFixed(1)} pts)`, () => 'Little planned investment nearby'],
  newBuildSharePct: [(v) => `Active new construction (${v.toFixed(0)}% of sales are new builds)`, () => 'Little new construction selling'],
  builtSince2010Pct: [(v) => `Growing area (${v.toFixed(0)}% of homes built since 2010)`, (v) => `Mature housing stock (${v.toFixed(0)}% built since 2010)`],
  drawdownPct: [() => 'At or near peak values', (v) => `${Math.abs(v).toFixed(1)}% below recent peak`],
  volatilityPct: [() => 'Stable, low-volatility pricing', () => 'Volatile pricing'],
};

export function scoreAreas(areas, { components = COMPONENTS } = {}) {
  const populations = {};
  for (const component of Object.values(components)) {
    for (const feature of Object.keys(component.features)) populations[feature] = areas.map((area) => area.metrics[feature]);
  }
  return areas.map((area) => {
    const parts = {}; const signals = [];
    let weighted = 0; let weightUsed = 0;
    for (const [key, component] of Object.entries(components)) {
      let sum = 0; let used = 0;
      for (const [feature, weight] of Object.entries(component.features)) {
        const value = area.metrics[feature];
        const rank = percentileRank(populations[feature], value);
        if (rank === null) continue;
        const aligned = weight < 0 ? 1 - rank : rank;
        sum += aligned * Math.abs(weight); used += Math.abs(weight);
        signals.push({ feature, value, aligned, weight: Math.abs(weight) * component.weight });
      }
      if (used) { parts[key] = Math.round((sum / used) * 100); weighted += (sum / used) * component.weight; weightUsed += component.weight; }
    }
    const score = weightUsed ? Math.round((weighted / weightUsed) * 100) : null;
    const sampleFactor = Number.isFinite(area.metrics.homesSold90d) ? clamp(area.metrics.homesSold90d / 30, 0.4, 1) : 0.6;
    const confidence = Math.round(weightUsed * sampleFactor * 100);
    const ranks = Object.fromEntries(signals.map((signal) => [signal.feature, signal.aligned]));
    const reasons = (direction) => signals
      .filter((signal) => (direction > 0 ? signal.aligned >= 0.7 : signal.aligned <= 0.3) && REASONS[signal.feature])
      .sort((a, b) => (direction > 0 ? b.aligned * b.weight - a.aligned * a.weight : (1 - b.aligned) * b.weight - (1 - a.aligned) * a.weight))
      .slice(0, 3).map((signal) => REASONS[signal.feature][direction > 0 ? 0 : 1](signal.value));
    return {
      ...area,
      score: score === null ? null : {
        total: score, verdict: verdictFor(score, confidence), components: parts,
        confidence, strengths: reasons(1), risks: reasons(-1), tags: tagsFor(area.metrics, parts, ranks),
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Backtest: rebuild the price-only part of the score as of past months and check
// whether it ranked ZIPs by their *subsequent* 12-month appreciation.
// ---------------------------------------------------------------------------
const PRICE_ONLY = {
  momentum: COMPONENTS.momentum,
  value: { label: 'Value & yield', weight: 0.2, features: { grossYieldPct: 1 } },
  resilience: COMPONENTS.resilience,
};

export function backtestAreaModel(zhviByZip, zoriByZip = {}, { lookbacks = [12, 24, 36, 48], horizon = 12 } = {}) {
  const latest = Object.values(zhviByZip).map((series) => series.at(-1)?.[0]).filter(Boolean).sort().at(-1);
  if (!latest) return { available: false };
  const featureNames = Object.values(PRICE_ONLY).flatMap((component) => Object.keys(component.features));
  const periods = [];
  for (const lookback of lookbacks) {
    const asOf = shiftMonth(latest, -lookback);
    const end = shiftMonth(asOf, horizon);
    if (monthsBetween(end, latest) < 0) continue;
    const areas = Object.entries(zhviByZip).map(([zip, series]) => {
      const metrics = priceFeatures(series, zoriByZip[zip] || [], asOf);
      const forward = pctChange(valueAt(series, end), valueAt(series, asOf));
      return { zip, metrics, forward };
    }).filter((area) => Number.isFinite(area.metrics.value) && Number.isFinite(area.forward) && Number.isFinite(area.metrics.cagr3Pct));
    if (areas.length < 8) continue;
    const scored = scoreAreas(areas, { components: PRICE_ONLY });
    const scores = scored.map((area) => area.score.total); const forwards = scored.map((area) => area.forward);
    const ordered = [...scored].sort((a, b) => b.score.total - a.score.total);
    const third = Math.max(1, Math.floor(ordered.length / 3));
    periods.push({
      asOf, horizonEnd: end, zips: areas.length,
      rankCorrelation: spearman(scores, forwards),
      topThirdForwardPct: mean(ordered.slice(0, third).map((area) => area.forward)),
      bottomThirdForwardPct: mean(ordered.slice(-third).map((area) => area.forward)),
      featureCorrelations: Object.fromEntries(featureNames.map((feature) => [feature, spearman(areas.map((area) => area.metrics[feature]), forwards)])),
    });
  }
  const avg = (pick) => mean(periods.map(pick));
  return {
    available: periods.length > 0,
    method: 'Price-only score rebuilt at past dates vs. realized next-12-month ZHVI change (Spearman rank correlation)',
    periods,
    meanRankCorrelation: avg((period) => period.rankCorrelation),
    meanSpreadPct: avg((period) => period.topThirdForwardPct - period.bottomThirdForwardPct),
    featureCorrelations: Object.fromEntries(featureNames.map((feature) => [feature, avg((period) => period.featureCorrelations[feature])])),
  };
}

export const regionSeries = (seriesByZip) => {
  const months = new Map();
  for (const series of Object.values(seriesByZip)) for (const [month, value] of series) months.set(month, [...(months.get(month) || []), value]);
  return [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).filter(([, values]) => values.length >= 3).map(([month, values]) => [month, Math.round(median(values))]);
};
