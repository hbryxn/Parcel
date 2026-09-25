import { createReadStream, existsSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { cached, cachePath, hashKey, streamLines } from '../lib/http.js';

const FIELDS = {
  MEDIAN_SALE_PRICE: 'medianSale', MEDIAN_PPSF: 'medianPpsf', MEDIAN_LIST_PRICE: 'medianList', HOMES_SOLD: 'homesSold',
  PENDING_SALES: 'pending', NEW_LISTINGS: 'newListings', INVENTORY: 'inventory', MEDIAN_DOM: 'medianDom',
  AVG_SALE_TO_LIST: 'saleToList', SOLD_ABOVE_LIST: 'soldAboveList', PRICE_DROPS: 'priceDrops', OFF_MARKET_IN_TWO_WEEKS: 'offMarket2wk',
};

// An optional pre-filtered local mirror avoids re-streaming the 1.5 GB national file.
// It is only trusted while it is younger than the Redfin cache window.
const LOCAL_MIRROR = cachePath('redfin_zip_ga_sc.tsv');

async function* lines(url, maxAgeHours) {
  if (existsSync(LOCAL_MIRROR) && (Date.now() - statSync(LOCAL_MIRROR).mtimeMs) / 3600000 <= maxAgeHours) {
    yield* createInterface({ input: createReadStream(LOCAL_MIRROR), crlfDelay: Infinity });
    return;
  }
  yield* streamLines(url, { gzip: true });
}

async function extract(url, zips, maxAgeHours) {
  const wanted = new Set(zips);
  const out = {};
  let header = null; let updated = null;
  for await (const line of lines(url, maxAgeHours)) {
    if (!header) { header = line.split('\t').map((cell) => cell.replace(/"/g, '')); continue; }
    const zipMatch = line.match(/"Zip Code: (\d{5})"/);
    if (!zipMatch || !wanted.has(zipMatch[1]) || !line.includes('"All Residential"')) continue;
    const cells = line.split('\t').map((cell) => cell.replace(/"/g, ''));
    const row = Object.fromEntries(header.map((key, index) => [key, cells[index]]));
    const point = { month: row.PERIOD_END.slice(0, 7) };
    for (const [column, key] of Object.entries(FIELDS)) {
      const value = Number(row[column]);
      point[key] = row[column] === 'NA' || row[column] === '' || !Number.isFinite(value) ? null : value;
    }
    updated = row.LAST_UPDATED || updated;
    (out[zipMatch[1]] ||= []).push(point);
  }
  for (const series of Object.values(out)) series.sort((a, b) => a.month.localeCompare(b.month));
  return { updated, zips: out };
}

export async function loadRedfin(config, zips, options) {
  const result = await cached(`redfin-${hashKey(zips.slice().sort().join(','))}.json`, config.ttlHours.redfin, () => extract(config.sources.redfinZip, zips, config.ttlHours.redfin), options);
  const asOf = Object.values(result.value.zips).map((series) => series.at(-1)?.month).filter(Boolean).sort().at(-1);
  return {
    byZip: result.value.zips,
    source: { id: 'redfin', name: 'Redfin Data Center ZIP market tracker (rolling 90-day)', url: config.sources.redfinZip, fetchedAt: result.cachedAt, asOf, publishedAt: result.value.updated, records: Object.keys(result.value.zips).length },
  };
}
