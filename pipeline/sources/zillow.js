import { cached, hashKey, splitCSVLine, streamLines } from '../lib/http.js';

// Zillow Research ZIP files are wide: one row per ZIP, one column per month.
async function extractSeries(url, zips) {
  const wanted = new Set(zips);
  const out = {};
  let header = null;
  for await (const line of streamLines(url)) {
    if (!header) { header = splitCSVLine(line); continue; }
    const zipGuess = line.match(/^[^,]*,[^,]*,"?(\d{5})"?/);
    if (!zipGuess || !wanted.has(zipGuess[1])) continue;
    const cells = splitCSVLine(line);
    const row = Object.fromEntries(header.map((key, index) => [key, cells[index]]));
    const zip = String(row.RegionName).padStart(5, '0');
    const series = header.filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key))
      .filter((key) => row[key] !== '' && row[key] !== undefined)
      .map((key) => [key.slice(0, 7), Math.round(Number(row[key]) * 100) / 100]).filter(([, value]) => Number.isFinite(value) && value > 0);
    out[zip] = { city: row.City, county: row.CountyName, metro: row.Metro, state: row.State, series };
  }
  return out;
}

export async function loadZillow(config, zips, options) {
  const key = hashKey(zips.slice().sort().join(','));
  const [zhvi, zori, zhvf] = await Promise.all([
    cached(`zillow-zhvi-${key}.json`, config.ttlHours.zillow, () => extractSeries(config.sources.zhvi, zips), options),
    cached(`zillow-zori-${key}.json`, config.ttlHours.zillow, () => extractSeries(config.sources.zori, zips), options),
    cached(`zillow-zhvf-${key}.json`, config.ttlHours.zillow, () => extractForecast(config.sources.zhvf, zips), options),
  ]);
  const latest = Object.values(zhvi.value).map((item) => item.series.at(-1)?.[0]).filter(Boolean).sort().at(-1);
  return {
    zhvi: zhvi.value, zori: zori.value, forecast: zhvf.value,
    sources: [
      { id: 'zhvi', name: 'Zillow Home Value Index (ZIP, mid-tier, smoothed & seasonally adjusted)', url: config.sources.zhvi, fetchedAt: zhvi.cachedAt, asOf: latest, records: Object.keys(zhvi.value).length },
      { id: 'zori', name: 'Zillow Observed Rent Index (ZIP)', url: config.sources.zori, fetchedAt: zori.cachedAt, asOf: Object.values(zori.value)[0]?.series.at(-1)?.[0], records: Object.keys(zori.value).length },
      { id: 'zhvf', name: 'Zillow Home Value Forecast (ZIP, 1-year)', url: config.sources.zhvf, fetchedAt: zhvf.cachedAt, asOf: Object.values(zhvf.value)[0]?.baseDate?.slice(0, 7), records: Object.keys(zhvf.value).length },
    ],
  };
}

// Forecast file: BaseDate plus three horizon columns (1m, 3m, 12m ahead growth in %).
async function extractForecast(url, zips) {
  const wanted = new Set(zips);
  const out = {};
  let header = null;
  for await (const line of streamLines(url)) {
    if (!header) { header = splitCSVLine(line); continue; }
    const cells = splitCSVLine(line);
    const row = Object.fromEntries(header.map((key, index) => [key, cells[index]]));
    const zip = String(row.RegionName).padStart(5, '0');
    if (!wanted.has(zip)) continue;
    const horizons = header.filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key));
    out[zip] = { baseDate: row.BaseDate, oneYearPct: Number(row[horizons.at(-1)]), horizonMonth: horizons.at(-1)?.slice(0, 7) };
  }
  return out;
}
