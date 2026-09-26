import { queryAll } from '../lib/arcgis.js';
import { cached } from '../lib/http.js';
import { largestRing, ringArea, ringCentroid, roundRing } from '../lib/geo.js';

const SAGIS = 'https://pub.sagis.org/arcgis/rest/services';
export const DEVELOPMENT_SOURCES = {
  commercialPermits: `${SAGIS}/Savannah/ZoningDevelopment_Map/MapServer/11`,
  apartments: `${SAGIS}/Savannah/COS_Apartments/MapServer/0`,
  subdivisionsSavannah: `${SAGIS}/OpenData/DPLAT_SAV/MapServer/8`,
  subdivisionsChatham: `${SAGIS}/OpenData/DPLAT_Chatham/MapServer/9`,
};

// Business types, most specific first. `effects` are value-lift priors (pts, miles):
// a grocery anchor lifts a wide area; a fuel station helps the area but not its next-door neighbours.
export const BUSINESS_TYPES = [
  { key: 'fuel', label: 'Gas & convenience', pattern: /gas station|gas pumps|fuel|convenience store|wawa|quiktrip|circle k|parker'?s|racetrac|love'?s travel/i, effects: [{ lift: 0.3, radiusMiles: 0.8 }, { lift: -0.4, radiusMiles: 0.15 }] },
  { key: 'hotel', label: 'Hotel', pattern: /hotel|\binn\b|\bsuites\b|\d+[- ]rooms?\b/i, effects: [{ lift: 0.5, radiusMiles: 0.5 }] },
  { key: 'grocery', label: 'Grocery', pattern: /grocery|supermarket|publix|kroger|aldi|lidl|trader joe|whole foods|food lion|harris teeter|costco|sam'?s club|meat market|fresh market|sprouts/i, effects: [{ lift: 1.6, radiusMiles: 1.2 }] },
  { key: 'restaurant', label: 'Restaurant & café', pattern: /restaurant|caf[eé]\b|coffee|bakery|brewery|taproom|pizza|smoothie|acai|ice cream|dining|food hall|bar and grill|\bbars?\b|chick-fil-a|starbucks|dunkin|mcdonald|taco|sushi|breakfast/i, effects: [{ lift: 0.7, radiusMiles: 0.5 }] },
  { key: 'retail', label: 'Retail store', pattern: /retail|\bstore\b|boutique|showroom|target|walmart|home depot|lowe'?s|tj ?maxx|marshalls|ross dress|dollar (general|tree)|five below|ulta|best buy|mercantile|\bshop\b/i, effects: [{ lift: 0.6, radiusMiles: 0.7 }] },
  { key: 'health', label: 'Health & medical', pattern: /clinic|medical|dental|dentist|urgent care|pharmacy|cvs|walgreens|physical therapy|veterinar|animal hospital|orthodont|dialysis/i, effects: [{ lift: 0.4, radiusMiles: 0.6 }] },
  { key: 'bank', label: 'Bank', pattern: /\bbank\b|credit union|fifth third|truist|wells fargo|chase|synovus|ameris/i, effects: [{ lift: 0.3, radiusMiles: 0.4 }] },
  { key: 'services', label: 'Fitness & services', pattern: /fitness|\bgym\b|yoga|pilates|cold plunge|\bspa\b|salon|barber|daycare|child care|laundromat|car wash/i, effects: [{ lift: 0.35, radiusMiles: 0.4 }] },
];

const BRANDS = ['Publix', 'Kroger', 'Aldi', 'Lidl', "Trader Joe's", 'Whole Foods', 'Food Lion', 'Harris Teeter', 'Costco', "Sam's Club", 'Target', 'Walmart', 'Home Depot', "Lowe's", 'TJ Maxx', 'Ulta', 'Five Below', 'Dollar General', 'Dollar Tree',
  'Starbucks', 'Chick-fil-A', 'Dunkin', "McDonald's", 'Wawa', 'QuikTrip', 'Circle K', "Parker's", 'RaceTrac', 'CVS', 'Walgreens', 'Fifth Third', 'Truist', 'Wells Fargo', 'Chase', 'Synovus', 'Ameris', 'UPS', 'Planet Fitness', 'Orangetheory'];
const brandPattern = (brand) => new RegExp(`\\b${brand.replace(/'/g, "'?").replace(/ /g, '\\s*').replace('-', '[- ]?')}\\b`, 'i');

// Renovations only count when they create a new customer-facing space, not repairs.
const OPENING_WORDS = /tenant|build[- ]?out|up-?fit|improvement|1st generation|first generation|convert|conversion|new (restaurant|store|business|location)|will be (utilized|used)|rented|open(ing)?\b|shell/i;
const INDUSTRIAL = /manufact|industrial|logistics|distribution|commerce (center|park)|business park|ports? parcel|\bga ports|georgia ports|warehouse/i;
const EXCLUDE = /fire damage|re-?roof|roof(ing)? (replacement|repair)|hvac|water damage|storm damage|sign(age)? only|cell tower|antenna|\bschool\b|cafetorium|church|storage|warehouse|multi-?family|apartment|dwelling units|quadplex|triplex|duplex|townhome|single[- ]family|community center|recreation center|demolition only|parking deck/i;

export const classifyBusiness = ({ workClass, description }) => {
  const text = String(description || '');
  if (!text || EXCLUDE.test(text)) return null;
  if (workClass !== 'New' && !OPENING_WORDS.test(text)) return null;
  const type = BUSINESS_TYPES.find((item) => item.pattern.test(text));
  if (!type) return null;
  const brand = BRANDS.find((name) => brandPattern(name).test(text)) || null;
  return { type, brand };
};

const title = (text) => String(text || '').toLowerCase().replace(/\b[a-z]/g, (char) => char.toUpperCase()).replace(/\s+/g, ' ').trim();
const yearOf = (ms) => (ms ? new Date(ms).getUTCFullYear() + new Date(ms).getUTCMonth() / 12 : null);
const isoDate = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : null);
const point = (geometry) => (geometry && Number.isFinite(geometry.x) ? { type: 'Point', coordinates: [Number(geometry.x.toFixed(6)), Number(geometry.y.toFixed(6))] } : null);

async function fetchRaw(nowYear) {
  const since = `${Math.floor(nowYear) - 3}-01-01`;
  const [commercial, apartments, subSavannah, subChatham] = await Promise.all([
    queryAll(DEVELOPMENT_SOURCES.commercialPermits, { where: `IssuedDate_DATE >= DATE '${since}'`, outFields: 'PermitNumber,WorkClass,PermitStatus,District,IssuedDate_DATE,FinalizedDate_DATE,Address,Description,Permit_Value', geometry: true }),
    queryAll(DEVELOPMENT_SOURCES.apartments, { where: "Status IN ('Proposed','Permitted')", outFields: 'PIN,PropAddress_Full,Acres,UNITS,NAME,PermitValue,Status', geometry: true, maxAllowableOffset: 0.00005 }),
    queryAll(DEVELOPMENT_SOURCES.subdivisionsSavannah, { where: `created_date >= DATE '${since}'`, outFields: 'SUBD_NAME,COS_PROJECT_NUMBER,created_date', geometry: true, maxAllowableOffset: 0.00003 }),
    queryAll(DEVELOPMENT_SOURCES.subdivisionsChatham, { where: `CREATE_DATE >= DATE '${since}'`, outFields: 'SUBD_NAME,CREATE_DATE', geometry: true, maxAllowableOffset: 0.00003 }),
  ]);
  return { commercial, apartments, subSavannah, subChatham };
}

// Square miles → acres for a lon/lat ring (planar approximation, fine at lot scale).
const ringAcres = (ring) => {
  const lat = ring[0][1] * Math.PI / 180;
  return Math.abs(ringArea(ring)) * (69.172 * Math.cos(lat)) * 69.0 * 640;
};

export async function loadDevelopment(options, now = new Date()) {
  const nowYear = now.getUTCFullYear() + now.getUTCMonth() / 12;
  const raw = await cached('development-raw.json', 72, () => fetchRaw(nowYear), options);
  const businesses = []; const seen = new Set();

  for (const { attributes: a, geometry } of raw.value.commercial) {
    if (seen.has(a.permitnumber)) continue;
    seen.add(a.permitnumber);
    const match = classifyBusiness({ workClass: a.workclass, description: a.description });
    const geo = point(geometry);
    if (!match || !geo) continue;
    const issued = yearOf(a.issueddate_date);
    const finalized = a.finalizeddate_date ? yearOf(a.finalizeddate_date) : null;
    // Permits are often never marked finalized; a year after issue the business has usually opened.
    const likelyOpen = !finalized && a.permitstatus === 'Issued' && issued && nowYear - issued > 1;
    const stage = finalized || likelyOpen ? 'complete' : a.permitstatus === 'Issued' ? 'construction' : 'approved';
    businesses.push({
      id: `biz-${a.permitnumber}`, name: match.brand ? `${match.brand} · ${title(a.address)}` : `${match.type.label} · ${title(a.address)}`,
      category: 'business', businessType: match.type.key, subtype: match.type.label, brand: match.brand, scale: 'site', stage,
      expectedYear: finalized ?? (issued + (a.workclass === 'New' ? 1.2 : 0.5)), openedAt: isoDate(a.finalizeddate_date), likelyOpen, permittedAt: isoDate(a.issueddate_date),
      workClass: a.workclass === 'New' ? 'New construction' : 'Tenant build-out', costUsd: a.permit_value || null, effects: match.type.effects,
      summary: String(a.description || '').replace(/\s+/g, ' ').trim().slice(0, 320), district: a.district || null,
      origin: 'City of Savannah permits', source: `City of Savannah commercial permit ${a.permitnumber}`, sourceUrl: null, geometry: geo,
    });
  }

  const housing = [];
  for (const { attributes: a, geometry } of raw.value.apartments) {
    const ring = geometry?.rings ? largestRing(geometry.rings) : null;
    if (!ring) continue;
    const units = Number(a.units) || null;
    const [x, y] = ringCentroid(ring);
    housing.push({
      id: `apt-${a.pin || a.objectid}-${a.propaddress_full}`.replace(/\s+/g, '-'), name: a.name?.trim() ? (/apartment|residence|lofts|flats/i.test(a.name) ? title(a.name) : `${title(a.name)} apartments`) : `${title(a.propaddress_full)} apartments`,
      category: 'multifamily', scale: units >= 200 ? 'neighborhood' : 'site', stage: a.status === 'Permitted' ? 'funded' : 'proposed', expectedYear: nowYear + (a.status === 'Permitted' ? 1.5 : 3),
      units, costUsd: Number(String(a.permitvalue || '').replace(/[^0-9.]/g, '')) || null, subtype: `${a.status} multifamily`,
      summary: `${units ? `${units} apartment units` : 'Apartment project'} at ${title(a.propaddress_full)}${a.acres ? ` on ${a.acres} acres` : ''} (${a.status.toLowerCase()} in the City of Savannah apartment pipeline).`,
      origin: 'City of Savannah apartment pipeline', source: 'City of Savannah apartment complex inventory', sourceUrl: null,
      geometry: { type: 'Point', coordinates: [Number(x.toFixed(6)), Number(y.toFixed(6))] },
    });
  }

  const plats = [
    ...raw.value.subSavannah.map(({ attributes: a, geometry }) => ({ name: a.subd_name, date: a.created_date, project: a.cos_project_number, geometry, jurisdiction: 'City of Savannah' })),
    ...raw.value.subChatham.map(({ attributes: a, geometry }) => ({ name: a.subd_name, date: a.create_date, geometry, jurisdiction: 'Chatham County' })),
  ];
  const platKeys = new Set();
  for (const plat of plats.sort((a, b) => (b.date || 0) - (a.date || 0))) {
    const ring = plat.geometry?.rings ? largestRing(plat.geometry.rings) : null;
    if (!ring || !plat.name) continue;
    const acres = ringAcres(ring);
    // Re-recorded plats repeat the same footprint; keep the latest.
    const [cx, cy] = ringCentroid(ring);
    const key = `${acres.toFixed(0)}|${cx.toFixed(3)}|${cy.toFixed(3)}`;
    if (platKeys.has(key)) continue;
    platKeys.add(key);
    const industrial = INDUSTRIAL.test(plat.name);
    const major = /phase|\bph\b|subdivision|tract|village|estates|plantation|landing|preserve|crossing|pointe|reserve/i.test(plat.name);
    if (acres < 1.5 && !major) continue; // skip lot splits and recombinations
    housing.push({
      id: `plat-${plat.project || plat.name}-${plat.date}`.replace(/\s+/g, '-'), name: title(plat.name), category: industrial ? 'industrial' : 'subdivision', scale: acres >= 25 ? 'neighborhood' : 'site',
      stage: 'approved', expectedYear: yearOf(plat.date) + 2, recordedAt: isoDate(plat.date), acres: Number(acres.toFixed(1)), subtype: industrial ? 'Industrial / logistics plat' : 'Recorded subdivision plat',
      summary: industrial
        ? `Industrial or logistics subdivision recorded ${isoDate(plat.date)} with ${plat.jurisdiction}, covering about ${acres.toFixed(1)} acres. It brings jobs to the region but truck traffic to its edges.`
        : `New subdivision plat recorded ${isoDate(plat.date)} with ${plat.jurisdiction}, covering about ${acres.toFixed(1)} acres. Lots are created, and homes typically follow within one to three years.`,
      origin: `${plat.jurisdiction} subdivision plats`, source: `${plat.jurisdiction} development plats (SAGIS)`, sourceUrl: null,
      geometry: { type: 'Polygon', coordinates: [roundRing(ring)] }, centroid: [Number(cx.toFixed(6)), Number(cy.toFixed(6))],
    });
  }

  const count = (items, key) => items.reduce((acc, item) => ({ ...acc, [item[key]]: (acc[item[key]] || 0) + 1 }), {});
  return {
    businesses, housing,
    source: {
      id: 'development', name: 'City of Savannah commercial permits (store openings), apartment pipeline, and Savannah + Chatham subdivision plats',
      url: DEVELOPMENT_SOURCES.commercialPermits, fetchedAt: raw.cachedAt,
      newestRecordAt: [...businesses.map((item) => item.permittedAt), ...housing.map((item) => item.recordedAt)].filter(Boolean).sort().at(-1),
      records: businesses.length + housing.length, breakdown: { ...count(businesses, 'businessType'), ...count(housing, 'category') },
    },
  };
}
