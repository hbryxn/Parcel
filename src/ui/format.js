const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const compactCurrency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
// Every string from a data source passes through here before touching innerHTML.
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]);

export const safeUrl = (value) => {
  try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null; } catch { return null; }
};

export const money = (value, compact = false) => (Number.isFinite(value) ? (compact ? compactCurrency : currency).format(value) : '—');
export const num = (value, digits = 0) => (Number.isFinite(value) ? (digits ? value.toFixed(digits) : integer.format(value)) : '—');
export const pct = (value, digits = 1, signed = true) => (Number.isFinite(value) ? `${signed && value > 0 ? '+' : ''}${value.toFixed(digits)}%` : '—');

export const date = (value, style = 'medium') => {
  if (!value) return '—';
  const parsed = new Date(String(value).length === 7 ? `${value}-01T12:00:00Z` : String(value).length === 10 ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return style === 'month' ? parsed.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : parsed.toLocaleDateString('en-US', { dateStyle: style, timeZone: 'UTC' });
};

export const ago = (value, now = Date.now()) => {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return 'unknown';
  const days = Math.round((now - time) / 86400000);
  if (days < 1) return 'today';
  if (days < 45) return `${days}d ago`;
  if (days < 540) return `${Math.round(days / 30)}mo ago`;
  return `${(days / 365).toFixed(1)}y ago`;
};

export const formatMetric = (value, format) => (format === 'pct' ? pct(value) : format === 'score' ? num(value) : format === 'money' ? money(value, true) : num(value, Math.abs(value) < 10 ? 1 : 0));
