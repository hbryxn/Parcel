// Small numeric toolkit shared by the browser and the offline pipeline.

export const finite = (values) => values.filter((value) => Number.isFinite(value));

export const median = (values) => quantile(values, 0.5);

export const quantile = (values, q) => {
  const sorted = finite(values).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
};

export const mean = (values) => {
  const clean = finite(values);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
};

export const stdev = (values) => {
  const clean = finite(values);
  if (clean.length < 2) return null;
  const average = mean(clean);
  return Math.sqrt(clean.reduce((sum, value) => sum + (value - average) ** 2, 0) / (clean.length - 1));
};

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const pctChange = (current, previous) => (
  Number.isFinite(current) && Number.isFinite(previous) && previous > 0 ? (current / previous - 1) * 100 : null
);

// Compound annual growth rate in percent.
export const cagr = (current, previous, years) => (
  Number.isFinite(current) && Number.isFinite(previous) && previous > 0 && years > 0
    ? ((current / previous) ** (1 / years) - 1) * 100 : null
);

// Percentile rank (0–1) of `value` inside `population`; ties share the midpoint.
export const percentileRank = (population, value) => {
  const clean = finite(population);
  if (!clean.length || !Number.isFinite(value)) return null;
  const below = clean.filter((item) => item < value).length;
  const equal = clean.filter((item) => item === value).length;
  return (below + equal / 2) / clean.length;
};

const ranks = (values) => {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const result = new Array(values.length);
  for (let start = 0; start < order.length;) {
    let end = start;
    while (end + 1 < order.length && order[end + 1].value === order[start].value) end += 1;
    for (let k = start; k <= end; k += 1) result[order[k].index] = (start + end) / 2;
    start = end + 1;
  }
  return result;
};

export const pearson = (xs, ys) => {
  const pairs = xs.map((x, index) => [x, ys[index]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 3) return null;
  const mx = mean(pairs.map(([x]) => x)); const my = mean(pairs.map(([, y]) => y));
  let num = 0; let dx = 0; let dy = 0;
  for (const [x, y] of pairs) { num += (x - mx) * (y - my); dx += (x - mx) ** 2; dy += (y - my) ** 2; }
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
};

export const spearman = (xs, ys) => {
  const pairs = xs.map((x, index) => [x, ys[index]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 3) return null;
  return pearson(ranks(pairs.map(([x]) => x)), ranks(pairs.map(([, y]) => y)));
};

export const milesBetween = ([lng1, lat1], [lng2, lat2]) => {
  const toRad = (degrees) => degrees * Math.PI / 180;
  const dLat = toRad(lat2 - lat1); const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Months between two 'YYYY-MM' keys (b - a).
export const monthsBetween = (a, b) => {
  const [ya, ma] = a.split('-').map(Number); const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
};

export const monthKey = (date) => {
  const value = date instanceof Date ? date : new Date(date);
  return Number.isNaN(value.getTime()) ? null : `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`;
};
