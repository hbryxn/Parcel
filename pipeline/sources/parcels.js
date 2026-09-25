import { queryAll } from '../lib/arcgis.js';
import { cached, getJSON } from '../lib/http.js';
import { largestRing, ringCentroid, roundRing } from '../lib/geo.js';

// Chatham County Board of Assessors data published through SAGIS.
// PIN formats differ by vintage ("1-0992 -01-020" vs "10992 01020"); compare alphanumerics only.
export const normalizePin = (pin) => String(pin || '').toUpperCase().replace(/[^0-9A-Z]/g, '');

const saleDate = (yy, mm, dd) => {
  const year = Number(yy); const month = Number(mm) || 1; const day = Number(dd) || 1;
  if (!year || year < 1900) return null;
  return `${year}-${String(Math.min(12, month)).padStart(2, '0')}-${String(Math.min(31, day)).padStart(2, '0')}`;
};

const log = (message) => process.stdout.write(`\r    ${message}`.padEnd(70));

async function fetchCurrent(config) {
  const uses = config.residentialUseCodes.map((code) => `'${code}'`).join(',');
  const rows = await queryAll(config.sources.parcelsCurrent, {
    where: `Property_Use IN (${uses})`,
    outFields: 'PIN,PropAddress_Full,PropAddress_City,PropAddress_Zip,YearBuilt,Effective_YB,Acres,Sale_Price,Sale_YY,Sale_MM,Sale_DD,Sale_Quality,Date_Updated',
    geometry: true, maxAllowableOffset: 0.00002, onPage: (count) => log(`current parcels ${count}`),
  });
  process.stdout.write('\n');
  return rows.map(({ attributes: a, geometry }) => {
    const ring = geometry?.rings ? roundRing(largestRing(geometry.rings)) : null;
    const centroid = ring ? ringCentroid(ring).map((value) => Number(value.toFixed(6))) : null;
    return {
      pin: normalizePin(a.pin), address: a.propaddress_full?.trim() || null, city: a.propaddress_city?.trim() || null, zip: a.propaddress_zip?.trim() || null,
      yearBuilt: a.yearbuilt || a.effective_yb || null, acres: a.acres ?? null,
      sale: a.sale_price ? { price: a.sale_price, date: saleDate(a.sale_yy, a.sale_mm, a.sale_dd), quality: a.sale_quality || null } : null,
      updatedAt: a.date_updated ? new Date(a.date_updated).toISOString() : null, ring, centroid,
    };
  }).filter((parcel) => parcel.pin && parcel.centroid);
}

async function fetchAssessments(config) {
  const latest = config.parcelHistoryYears.at(-1);
  const rows = await queryAll(config.sources.parcelDigest(latest), {
    where: `Property_Use IN (${config.residentialUseCodes.map((code) => `'${code}'`).join(',')})`,
    outFields: 'PIN,FairMarketValue,FMV_Land,FMV_Building,Nbhd_Code_BOA', onPage: (count) => log(`${latest} assessments ${count}`),
  });
  process.stdout.write('\n');
  return { year: latest, values: Object.fromEntries(rows.map(({ attributes: a }) => [normalizePin(a.pin), [a.fairmarketvalue, a.fmv_building, a.nbhd_code_boa?.trim() || null]])) };
}

// Each annual digest carries the most recent sale as of that year. Pulling only recent
// sales from every vintage rebuilds a multi-sale history per parcel cheaply.
async function fetchHistory(config) {
  const events = [];
  for (const year of config.parcelHistoryYears) {
    const url = config.sources.parcelDigest(year);
    const meta = await getJSON(`${url}?f=json`);
    const field = (name) => meta.fields.find((item) => item.name.toLowerCase() === name);
    const yy = field('sale_yy');
    const quality = field('sale_quality');
    const since = year - 2;
    const where = yy.type === 'esriFieldTypeString' ? `${yy.name} >= '${since}' AND ${field('sale_price').name} > 0` : `${yy.name} >= ${since} AND ${field('sale_price').name} > 0`;
    const outFields = ['pin', 'sale_price', 'sale_yy', 'sale_mm', 'sale_dd'].map((name) => field(name).name).concat(quality ? [quality.name] : []).join(',');
    const rows = await queryAll(url, { where, outFields, orderBy: meta.fields.find((item) => item.type === 'esriFieldTypeOID').name, onPage: (count) => log(`${year} digest sales ${count}`) });
    for (const { attributes: a } of rows) {
      const date = saleDate(a.sale_yy, a.sale_mm, a.sale_dd);
      if (date) events.push([normalizePin(a.pin), date, a.sale_price, a.sale_quality ?? null]);
    }
  }
  process.stdout.write('\n');
  return events;
}

export async function loadParcels(config, options) {
  const [current, assessments, history] = [
    await cached('parcels-current.json', config.ttlHours.parcels, () => fetchCurrent(config), options),
    await cached('parcels-assessments-v2.json', config.ttlHours.parcels * 4, () => fetchAssessments(config), options),
    await cached('parcels-history.json', config.ttlHours.parcels * 4, () => fetchHistory(config), options),
  ];

  const salesByPin = new Map();
  const addSale = (pin, sale) => {
    if (!sale?.date || !(sale.price > 0)) return;
    const list = salesByPin.get(pin) || [];
    const duplicate = list.find((item) => item.date === sale.date || (item.price === sale.price && Math.abs(Date.parse(item.date) - Date.parse(sale.date)) < 45 * 86400000));
    if (duplicate) { duplicate.quality ||= sale.quality; } else list.push({ ...sale });
    salesByPin.set(pin, list);
  };
  for (const parcel of current.value) addSale(parcel.pin, parcel.sale);
  for (const [pin, date, price, quality] of history.value) addSale(pin, { date, price, quality });

  const parcels = current.value.map((parcel) => {
    const [fmv, fmvBuilding, neighborhood] = assessments.value.values[parcel.pin] || [];
    const sales = (salesByPin.get(parcel.pin) || []).sort((a, b) => a.date.localeCompare(b.date));
    return { ...parcel, sale: undefined, fmv: fmv || null, fmvBuilding: fmvBuilding || null, neighborhood, assessmentYear: assessments.value.year, sales };
  });

  const updated = current.value.map((parcel) => parcel.updatedAt).filter(Boolean).sort().at(-1);
  const newestSale = parcels.flatMap((parcel) => parcel.sales.map((sale) => sale.date)).sort().at(-1);
  return {
    parcels, assessmentYear: assessments.value.year,
    sources: [
      { id: 'parcels', name: 'Chatham County Board of Assessors parcels (SAGIS, current)', url: config.sources.parcelsCurrent, fetchedAt: current.cachedAt, asOf: updated, newestRecordAt: newestSale, records: parcels.length },
      { id: 'parcel-history', name: `Chatham parcel digests ${config.parcelHistoryYears[0]}–${config.parcelHistoryYears.at(-1)} (sale history)`, url: config.sources.parcelDigest(config.parcelHistoryYears.at(-1)), fetchedAt: history.cachedAt, records: history.value.length },
    ],
  };
}
