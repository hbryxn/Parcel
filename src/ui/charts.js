import { esc, money } from './format.js';

const toTime = (key) => Date.parse(key.length === 7 ? `${key}-15T00:00:00Z` : `${key}T00:00:00Z`);

const niceTicks = (min, max, count = 3) => {
  const span = max - min || Math.abs(max) || 1;
  const step = 10 ** Math.floor(Math.log10(span / count));
  const unit = [1, 2, 2.5, 5, 10].map((factor) => factor * step).find((candidate) => span / candidate <= count) || step * 10;
  const ticks = [];
  for (let value = Math.ceil(min / unit) * unit; value <= max + 1e-9; value += unit) ticks.push(value);
  return ticks;
};

/**
 * Responsive SVG line chart.
 * series: [{ points: [[dateKey, value]], className, label }]
 * markers: [{ date, value, label, className }]
 */
export function lineChart({ series, markers = [], height = 150, format = (value) => money(value, true), ariaLabel = 'Chart' }) {
  const width = 360; const pad = { top: 10, right: 10, bottom: 22, left: 44 };
  const all = [...series.flatMap((item) => item.points), ...markers.map((marker) => [marker.date, marker.value])].filter(([key, value]) => key && Number.isFinite(value));
  if (all.length < 2) return '<p class="chart-empty">Not enough history to chart.</p>';
  const times = all.map(([key]) => toTime(key)); const values = all.map(([, value]) => value);
  const [t0, t1] = [Math.min(...times), Math.max(...times)];
  let [v0, v1] = [Math.min(...values), Math.max(...values)];
  const margin = (v1 - v0) * 0.08 || v1 * 0.05; v0 -= margin; v1 += margin;
  const x = (key) => pad.left + ((toTime(key) - t0) / (t1 - t0 || 1)) * (width - pad.left - pad.right);
  const y = (value) => pad.top + (1 - (value - v0) / (v1 - v0 || 1)) * (height - pad.top - pad.bottom);
  const yTicks = niceTicks(v0, v1, 3);
  const years = [...new Set(times.map((time) => new Date(time).getUTCFullYear()))];
  const yearStep = Math.max(1, Math.ceil(years.length / 5));
  const xTicks = years.filter((year, index) => index % yearStep === 0 && Date.UTC(year, 0, 1) >= t0);
  const path = (points) => points.filter(([, value]) => Number.isFinite(value)).map(([key, value], index) => `${index ? 'L' : 'M'}${x(key).toFixed(1)},${y(value).toFixed(1)}`).join('');
  const primary = series[0];
  const primaryPoints = primary.points.filter(([, value]) => Number.isFinite(value));
  const area = primaryPoints.length > 1 ? `${path(primaryPoints)}L${x(primaryPoints.at(-1)[0]).toFixed(1)},${height - pad.bottom}L${x(primaryPoints[0][0]).toFixed(1)},${height - pad.bottom}Z` : '';
  const gradient = `g${Math.random().toString(36).slice(2, 8)}`;

  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(ariaLabel)}">
    <defs><linearGradient id="${gradient}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".22"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
    ${yTicks.map((tick) => `<line class="grid" x1="${pad.left}" x2="${width - pad.right}" y1="${y(tick).toFixed(1)}" y2="${y(tick).toFixed(1)}"/><text class="axis" x="${pad.left - 6}" y="${(y(tick) + 3).toFixed(1)}" text-anchor="end">${esc(format(tick))}</text>`).join('')}
    ${xTicks.map((year) => `<text class="axis" x="${x(`${year}-01`).toFixed(1)}" y="${height - 6}" text-anchor="middle">${year}</text>`).join('')}
    ${area ? `<path class="area ${primary.className || ''}" d="${area}" fill="url(#${gradient})"/>` : ''}
    ${series.map((item) => `<path class="line ${item.className || ''}" d="${path(item.points)}"/>`).join('')}
    ${markers.map((marker) => `<g class="marker ${marker.className || ''}"><circle cx="${x(marker.date).toFixed(1)}" cy="${y(marker.value).toFixed(1)}" r="4.2"><title>${esc(marker.label)}</title></circle></g>`).join('')}
  </svg>
  ${series.length > 1 || markers.length ? `<div class="chart-legend">${series.map((item) => `<span class="${item.className || ''}"><i></i>${esc(item.label)}</span>`).join('')}${markers.length ? `<span class="marker-key"><i></i>${esc(markers[0].legend || 'Recorded sale')}</span>` : ''}</div>` : ''}`;
}

// Horizontal range bar: estimate low–high with the estimate and an asking price marked.
export function rangeBar({ low, value, high, ask }) {
  if (![low, value, high].every(Number.isFinite)) return '';
  const min = Math.min(low, ask ?? low) * 0.97; const max = Math.max(high, ask ?? high) * 1.03;
  const at = (amount) => ((amount - min) / (max - min)) * 100;
  return `<div class="range-bar" aria-hidden="true">
    <div class="range-fill" style="left:${at(low)}%;width:${at(high) - at(low)}%"></div>
    <i class="range-est" style="left:${at(value)}%"></i>
    ${Number.isFinite(ask) ? `<i class="range-ask" style="left:${at(ask)}%"></i>` : ''}
  </div>
  <div class="range-labels"><span>${money(low, true)}</span>${Number.isFinite(ask) ? `<span class="ask-key">Ask ${money(ask, true)}</span>` : ''}<span>${money(high, true)}</span></div>`;
}

export const scoreRing = (score, color, size = 64) => {
  const radius = size / 2 - 5; const circumference = 2 * Math.PI * radius; const filled = Number.isFinite(score) ? (score / 100) * circumference : 0;
  return `<svg class="score-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" class="track"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" stroke="${color}" stroke-dasharray="${filled.toFixed(1)} ${circumference.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})" class="value"/>
    <text x="50%" y="53%" text-anchor="middle" dominant-baseline="middle">${Number.isFinite(score) ? Math.round(score) : '—'}</text>
  </svg>`;
};
