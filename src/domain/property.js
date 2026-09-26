import { clamp } from '../analytics/stats.js';

const finite = (value) => (Number.isFinite(value) ? value : null);

// One number per property for the "Price change" colouring. Positive is always good for
// the owner or buyer: appreciation for owned homes, a discount to estimated value for listings.
export const changeMetric = (property) => {
  if (property.status === 'for-sale' || property.status === 'pending') return finite(property.deal?.gapPct);
  return finite(property.resale?.annualPct) ?? finite(property.sinceLastSale?.annualPct) ?? finite(property.annualSinceSalePct);
};

export const investmentSignal = (property) => {
  if (Number.isFinite(property.deal?.score)) return property.deal.score;
  const area = Number.isFinite(property.areaScore) ? property.areaScore : 50;
  const projects = clamp(50 + (property.projectLift || 0) * 8, 0, 100);
  const momentum = Number.isFinite(property.sinceLastSale?.annualPct) ? clamp(50 + property.sinceLastSale.annualPct * 4, 0, 100) : 50;
  return Math.round(0.6 * area + 0.25 * projects + 0.15 * momentum);
};

export const displayPrice = (property) => (property.status === 'off-market' ? property.estimate?.value ?? property.lastSalePrice : property.price);

export const makeProperty = (record) => {
  const property = { ...record, coordinates: record.coordinates?.map(Number) };
  property.change = changeMetric(property);
  property.signal = investmentSignal(property);
  property.displayPrice = displayPrice(property);
  return Object.freeze(property);
};

export const isMappable = (property) => Array.isArray(property.coordinates) && property.coordinates.every(Number.isFinite) && Number.isFinite(property.displayPrice);

// Off-market ZIP files are column-oriented to stay small; expand a row into a property.
export const fromOffMarketRow = (columns, row, zip, areaScore = null) => {
  const item = Object.fromEntries(columns.map((column, index) => [column, row[index]]));
  return makeProperty({
    id: `off-${item.pin}`, pin: item.pin, status: 'off-market', address: item.address, zip, coordinates: [item.lng, item.lat],
    yearBuilt: item.yearBuilt, lastSalePrice: item.lastSalePrice, eventDate: item.lastSaleDate, price: item.lastSalePrice,
    estimate: item.estimate ? { value: item.estimate, method: item.estimateMethod } : null, assessedValue: item.assessedValue,
    annualSinceSalePct: item.annualSinceSalePct, saleCount: item.saleCount, areaScore, sourceName: 'Chatham County Board of Assessors',
  });
};
