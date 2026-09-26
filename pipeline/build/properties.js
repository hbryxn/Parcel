import { impactAt } from '../../src/analytics/projectImpact.js';
import { cagr, median } from '../../src/analytics/stats.js';
import { compsEstimate, dealSignal, estimateValue, indexAdjust, isUsableSale, yearsBetween } from '../../src/analytics/valuationModel.js';

export const addressKey = (address, zip) => `${String(address || '').toUpperCase()
  .replace(/\b(UNIT|APT|STE|#)\s*/g, '#')
  .replace(/\bSTREET\b/g, 'ST').replace(/\bAVENUE\b/g, 'AVE').replace(/\bDRIVE\b/g, 'DR').replace(/\bROAD\b/g, 'RD').replace(/\bLANE\b/g, 'LN')
  .replace(/\bCOURT\b/g, 'CT').replace(/\bCIRCLE\b/g, 'CIR').replace(/\bBOULEVARD\b/g, 'BLVD').replace(/\bPLACE\b/g, 'PL').replace(/\bTERRACE\b/g, 'TER')
  .replace(/[^A-Z0-9#]/g, '')}|${String(zip || '').slice(0, 5)}`;

const round = (value, digits = 0) => (Number.isFinite(value) ? Number(value.toFixed(digits)) : null);
const titleCase = (text) => String(text || '').toLowerCase().replace(/\b[a-z]/g, (char) => char.toUpperCase());

// Price change between the two most recent arm's-length sales.
const resaleChange = (sales) => {
  const usable = sales.filter(isUsableSale);
  if (usable.length < 2) return null;
  const [previous, last] = usable.slice(-2);
  const years = yearsBetween(previous.date, last.date);
  if (years < 0.25) return null;
  return { fromDate: previous.date, fromPrice: previous.price, toDate: last.date, toPrice: last.price, changePct: round((last.price / previous.price - 1) * 100, 1), annualPct: round(cagr(last.price, previous.price, years), 1), years: round(years, 1) };
};

export function buildProperties({ parcels, inbox, rentcast, areasByZip, index, ratios, valuation, projects, now, soldWindowMonths }) {
  const today = now.toISOString().slice(0, 10);
  const soldSince = new Date(now); soldSince.setUTCMonth(soldSince.getUTCMonth() - soldWindowMonths);
  const soldFrom = soldSince.toISOString().slice(0, 10);
  const valuationContext = { index, ratios, weights: valuation.weights, errorBands: valuation.errorBands, asOf: today };
  const areaScore = (zip) => areasByZip.get(zip)?.score?.total ?? null;
  const lift = (point) => round(impactAt(point, projects), 2);

  const parcelByPin = new Map(parcels.map((parcel) => [parcel.pin, parcel]));
  const parcelByAddress = new Map(parcels.filter((parcel) => parcel.address).map((parcel) => [addressKey(parcel.address, parcel.zip), parcel]));
  const listingRecords = [...inbox.records, ...rentcast.records];
  const matchedPins = new Set();
  const detailsByPin = new Map();
  for (const record of listingRecords) {
    const parcel = parcelByAddress.get(addressKey(record.address, record.zip));
    if (parcel) { record.pin = parcel.pin; if (record.sqft || record.beds) detailsByPin.set(parcel.pin, { ...(detailsByPin.get(parcel.pin) || {}), ...Object.fromEntries(Object.entries(record).filter(([, value]) => value !== null && value !== undefined)) }); }
  }

  // Comps universe: every closed sale that reports square footage.
  const comps = listingRecords.filter((record) => record.status === 'sold' && record.sqft);

  const properties = [];
  const describeParcel = (parcel, extra = {}) => {
    const details = detailsByPin.get(parcel.pin) || {};
    const estimate = estimateValue(parcel, valuationContext);
    const lastSale = parcel.sales.filter(isUsableSale).at(-1) || null;
    const sinceSale = lastSale && estimate ? { changePct: round((estimate.value / lastSale.price - 1) * 100, 1), annualPct: round(cagr(estimate.value, lastSale.price, Math.max(0.25, yearsBetween(lastSale.date, today))), 1) } : null;
    return {
      id: `chatham-${parcel.pin}`, pin: parcel.pin, address: titleCase(parcel.address), city: titleCase(parcel.city) || areasByZip.get(parcel.zip)?.city || null, zip: parcel.zip,
      coordinates: parcel.centroid, footprint: parcel.ring, yearBuilt: parcel.yearBuilt || details.yearBuilt || null, acres: parcel.acres,
      sqft: details.sqft || null, beds: details.beds || null, baths: details.baths || null, propertyType: details.propertyType || 'Residential',
      assessedValue: parcel.fmv, estimate, sinceLastSale: sinceSale, resale: resaleChange(parcel.sales),
      history: parcel.sales.map((sale) => ({ date: sale.date, event: 'Sale', price: sale.price, quality: sale.quality || null })),
      newConstruction: Boolean(parcel.yearBuilt && parcel.yearBuilt >= now.getUTCFullYear() - 2 && lastSale && Number(lastSale.date.slice(0, 4)) >= parcel.yearBuilt),
      areaScore: areaScore(parcel.zip), projectLift: lift(parcel.centroid), sourceName: 'Chatham County Board of Assessors', ...extra,
    };
  };

  // 1. Recorded sales (public record, Chatham)
  for (const parcel of parcels) {
    const last = parcel.sales.filter(isUsableSale).at(-1);
    if (!last || last.date < soldFrom) continue;
    const details = detailsByPin.get(parcel.pin) || {};
    matchedPins.add(parcel.pin);
    properties.push(describeParcel(parcel, {
      status: 'sold', price: last.price, eventDate: last.date, saleQuality: last.quality, listPrice: details.listPrice || null,
      dom: details.dom || null, sourceUrl: details.url || null, sourceUpdatedAt: parcel.updatedAt,
    }));
  }

  // 2. On-market and off-market listing events (RentCast / Redfin exports / snapshots)
  const seen = new Set();
  const freshest = [...listingRecords].sort((a, b) => String(b.sourceUpdatedAt || b.eventDate).localeCompare(String(a.sourceUpdatedAt || a.eventDate)));
  for (const record of freshest) {
    const key = addressKey(record.address, record.zip);
    if (seen.has(key)) continue;
    seen.add(key);
    const parcel = record.pin ? parcelByPin.get(record.pin) : null;
    if (record.status === 'sold') {
      if (parcel || !record.eventDate || record.eventDate < soldFrom) continue; // Chatham public record already covers matched sales
      properties.push({
        id: record.id, address: record.address, city: record.city, zip: record.zip, coordinates: [record.lng, record.lat], footprint: null,
        yearBuilt: record.yearBuilt, sqft: record.sqft, beds: record.beds, baths: record.baths, propertyType: record.propertyType,
        status: 'sold', price: record.price, eventDate: record.eventDate, listPrice: record.listPrice, dom: record.dom,
        estimate: { value: Math.round(indexAdjust(index, record.zip, record.price, record.eventDate, today) || record.price), method: 'repeat-sale', basisSale: { date: record.eventDate, price: record.price } },
        sinceLastSale: null, resale: null, history: [{ date: record.eventDate, event: 'Sale', price: record.price }],
        areaScore: areaScore(record.zip), projectLift: lift([record.lng, record.lat]), sourceName: record.sourceName, sourceUrl: record.url, sourceUpdatedAt: record.sourceUpdatedAt,
      });
      continue;
    }
    const parcelEstimate = parcel ? estimateValue(parcel, valuationContext) : null;
    const comp = compsEstimate(record, comps, { index, asOf: today });
    const estimate = parcelEstimate && comp
      ? { value: Math.round((parcelEstimate.value + comp.value) / 2), low: Math.min(parcelEstimate.low, comp.low), high: Math.max(parcelEstimate.high, comp.high), method: 'comps + record', comps: comp.comps }
      : comp || parcelEstimate;
    const point = parcel?.centroid || [record.lng, record.lat];
    const projectLift = lift(point);
    const base = parcel ? describeParcel(parcel) : {
      id: record.id, address: record.address, city: record.city, zip: record.zip, coordinates: point, footprint: null, yearBuilt: record.yearBuilt,
      sqft: record.sqft, beds: record.beds, baths: record.baths, propertyType: record.propertyType, history: [], areaScore: areaScore(record.zip), projectLift,
    };
    if (parcel) matchedPins.add(parcel.pin);
    const ageDays = record.sourceUpdatedAt ? (now - Date.parse(record.sourceUpdatedAt)) / 86400000 : null;
    properties.push({
      ...base, id: record.id, status: record.status, price: record.price, listPrice: record.price, eventDate: record.eventDate || record.listedDate, listedDate: record.listedDate,
      sqft: record.sqft || base.sqft, beds: record.beds || base.beds, baths: record.baths || base.baths, propertyType: record.propertyType || base.propertyType,
      dom: record.dom, estimate, deal: record.status === 'for-sale' || record.status === 'pending' ? dealSignal({ ask: record.price, estimate, areaScore: base.areaScore, projectLift }) : null,
      history: [...(base.history || []), ...record.priceHistory.map((event) => ({ ...event, event: event.event || 'Listing' }))].sort((a, b) => a.date.localeCompare(b.date)),
      sourceName: record.sourceName, sourceUrl: record.url, sourceUpdatedAt: record.sourceUpdatedAt, stale: ageDays !== null && ageDays > 21,
    });
  }

  // 3. Everything else is off-market: published per ZIP and loaded on demand.
  const offMarket = new Map();
  for (const parcel of parcels) {
    if (matchedPins.has(parcel.pin) || !parcel.zip) continue;
    const estimate = estimateValue(parcel, valuationContext);
    const last = parcel.sales.filter(isUsableSale).at(-1);
    const row = [
      parcel.pin, titleCase(parcel.address), parcel.centroid[0], parcel.centroid[1], parcel.yearBuilt || null,
      last?.price || null, last?.date || null, estimate?.value || null, estimate?.method || null, parcel.fmv || null,
      last && estimate ? round(cagr(estimate.value, last.price, Math.max(0.25, yearsBetween(last.date, today))), 1) : null,
      parcel.sales.length,
    ];
    offMarket.set(parcel.zip, [...(offMarket.get(parcel.zip) || []), row]);
  }

  return { properties, offMarket, comps: comps.length, matched: matchedPins.size, medianResaleAnnual: median(properties.map((item) => item.resale?.annualPct)) };
}

export const OFF_MARKET_COLUMNS = ['pin', 'address', 'lng', 'lat', 'yearBuilt', 'lastSalePrice', 'lastSaleDate', 'estimate', 'estimateMethod', 'assessedValue', 'annualSinceSalePct', 'saleCount'];
