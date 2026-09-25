import { readFile } from 'node:fs/promises';
import { queryAll } from '../lib/arcgis.js';
import { cached } from '../lib/http.js';

const CIP_STAGE = { Ongoing: 'funded', 'Conceptual/Planning': 'planning', 'Implementation/Construction': 'construction', 'Design/Pre-Construction': 'design', 'On-Hold': 'on-hold' };
const CIP_CATEGORY = {
  'Public Building Improvements': ['civic', 'site'], 'Sewer Improvements': ['utilities', 'neighborhood'], 'Traffic Improvements': ['mobility', 'neighborhood'],
  'Water Improvements': ['utilities', 'neighborhood'], 'Street Improvements': ['mobility', 'neighborhood'], 'Drainage Improvements': ['drainage', 'district'],
  'Community Development Improvements': ['district', 'neighborhood'], 'Squares and Monuments Improvements': ['parks', 'site'],
  'Parks and Recreation Improvements': ['parks', 'neighborhood'], 'Cemetery Improvements': ['civic', 'site'], 'Sanitation Improvements': ['utilities', 'site'],
};
const CIP_HORIZON = { construction: 1, funded: 1.5, design: 2.5, planning: 4, 'on-hold': 5 };

const toGeometry = (geometry) => {
  if (!geometry) return null;
  if (Number.isFinite(geometry.x)) return { type: 'Point', coordinates: [Number(geometry.x.toFixed(6)), Number(geometry.y.toFixed(6))] };
  if (geometry.paths) return { type: 'MultiLineString', coordinates: geometry.paths.map((path) => path.map(([x, y]) => [Number(x.toFixed(5)), Number(y.toFixed(5))])) };
  return null;
};

const yearOf = (ms) => (ms ? new Date(ms).getUTCFullYear() + new Date(ms).getUTCMonth() / 12 : null);
const clean = (text) => String(text || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const hrefOf = (html) => String(html || '').match(/href="([^"]+)"/)?.[1] || null;

async function fetchRaw(config) {
  const get = (url, options = {}) => queryAll(url, { geometry: true, ...options });
  const [cip, mtpPoints, mtpSegments, rezonings, residential, commercial, agenda] = await Promise.all([
    get(config.sources.capitalProjects),
    get(config.sources.transportPoints),
    get(config.sources.transportSegments, { maxAllowableOffset: 0.0003 }),
    get(config.sources.rezonings),
    get(config.sources.residentialPermits, { where: "WorkClass = 'New'", outFields: 'PermitNumber,WorkClass,PermitStatus,District,IssuedDate_DATE,Address,Permit_Value,Description' }),
    get(config.sources.commercialPermits, { outFields: 'PermitNumber,WorkClass,PermitStatus,District,IssuedDate_DATE,Address,Permit_Value,Description' }),
    get(config.sources.mpcAgenda),
  ]);
  return { cip, mtpPoints, mtpSegments, rezonings, residential, commercial, agenda };
}

export async function loadProjects(config, options, now = new Date()) {
  const raw = await cached('projects-raw.json', config.ttlHours.projects, () => fetchRaw(config), options);
  const catalysts = JSON.parse(await readFile(new URL('../catalysts.json', import.meta.url), 'utf8'));
  const nowYear = now.getUTCFullYear() + now.getUTCMonth() / 12;
  const projects = [];

  for (const item of catalysts.projects) {
    projects.push({ ...item, origin: 'curated', geometry: { type: 'Point', coordinates: item.coordinates }, coordinates: undefined });
  }

  for (const { attributes: a, geometry } of raw.value.cip) {
    const stage = CIP_STAGE[a.status] || 'planning';
    const [category, scale] = CIP_CATEGORY[a.category] || ['civic', 'site'];
    projects.push({
      id: `cip-${a.cipno || a.objectid}`, name: clean(a.projname), category, scale, stage, expectedYear: nowYear + (CIP_HORIZON[stage] ?? 3),
      summary: clean(a.descript), funding: clean(a.fundingsource) || null, subtype: a.category, origin: 'City of Savannah CIP',
      source: 'City of Savannah Capital Improvement Program', sourceUrl: a.link || null, geometry: toGeometry(geometry),
    });
  }

  for (const [kind, rows] of [['point', raw.value.mtpPoints], ['segment', raw.value.mtpSegments]]) {
    for (const { attributes: a, geometry } of rows) {
      const pipeline = /pipeline/i.test(a.long_pipe || '');
      projects.push({
        id: `mtp-${kind}-${a.objectid}`, name: clean(a.name), category: 'transportation', scale: 'district', stage: pipeline ? 'funded' : 'planning',
        expectedYear: nowYear + (pipeline ? 4 : 12), subtype: clean(a.project_ty) || 'Corridor',
        summary: [clean(a.project_ty), a.from_?.trim() && `from ${clean(a.from_)}`, clean(a.to_) && `to ${clean(a.to_)}`, pipeline ? 'In the funded pipeline.' : 'Longer-term plan element.'].filter(Boolean).join(' '),
        origin: 'CORE MPO 2050 MTP', source: 'CORE MPO 2050 Metropolitan Transportation Plan', sourceUrl: hrefOf(a.hyperlink), geometry: toGeometry(geometry),
      });
    }
  }

  for (const { attributes: a, geometry } of raw.value.rezonings) {
    const status = a.plan_status || '';
    const applied = yearOf(a.plan_applydate);
    if (/withdrawn|void|closed/i.test(status) || !/map amendment|special use/i.test(a.planworkclass || '') || !applied || applied < nowYear - 3) continue;
    projects.push({
      id: `rezone-${a.plan_no}`, name: `${a.plan_district && a.plan_district !== '<NONE>' ? a.plan_district : 'Rezoning'} · ${a.plan_no}`, category: 'rezoning', scale: 'site',
      stage: /approved/i.test(status) ? 'approved' : 'proposed', expectedYear: applied + 3, subtype: a.planworkclass, summary: clean(a.plan_description) || 'Zoning map amendment.',
      origin: 'City of Savannah zoning', source: 'City of Savannah zoning actions', sourceUrl: null, geometry: toGeometry(geometry),
    });
  }

  const developmentPattern = /new construction|subdivision|rezon|zoning map|planned unit|pud\b|general development plan|group development|master plan|townhome|apartment|multi-?family/i;
  for (const { attributes: a, geometry } of raw.value.agenda) {
    const date = yearOf(a.agendadate);
    if (!developmentPattern.test(a.itemtitle || '') || !date || date < nowYear - 2) continue;
    const residential = /residential|townhome|dwelling|subdivision|apartment|units|multi-?family|homes/i.test(a.itemtitle);
    projects.push({
      id: `mpc-${a.agendaitemid}`, name: clean(a.itemtitle).split('|').slice(-2).join(' · ').trim() || 'MPC petition', category: residential ? 'residential' : 'commercial', scale: 'site',
      stage: 'proposed', expectedYear: date + 2, subtype: `${a.agendaboard} petition`, summary: clean(a.itemtitle),
      origin: 'MPC agenda', source: `Metropolitan Planning Commission (${a.agendaboard})`, sourceUrl: a.itemurl || a.agendaurl, geometry: toGeometry(geometry),
    });
  }

  for (const { attributes: a, geometry } of raw.value.commercial) {
    const issued = yearOf(a.issueddate_date);
    if (a.workclass !== 'New' || !(a.permit_value >= 1000000) || !issued || issued < nowYear - 3) continue;
    projects.push({
      id: `permit-${a.permitnumber}`, name: `${clean(a.address) || 'Commercial project'} (${a.district || 'Savannah'})`, category: 'commercial', scale: a.permit_value >= 10000000 ? 'neighborhood' : 'site',
      stage: a.permitstatus === 'Issued' ? 'construction' : 'approved', expectedYear: issued + 1.5, costUsd: a.permit_value, subtype: 'New commercial permit',
      summary: clean(a.description).slice(0, 280), origin: 'City of Savannah permits', source: 'City of Savannah building permits', sourceUrl: null, geometry: toGeometry(geometry),
    });
  }

  // Individual new-home permits are too granular to plot as projects; keep them as a construction-activity signal.
  const permits = raw.value.residential.map(({ attributes: a, geometry }) => ({
    id: a.permitnumber, issuedAt: a.issueddate_date ? new Date(a.issueddate_date).toISOString().slice(0, 10) : null, value: a.permit_value || null,
    status: a.permitstatus, geometry: toGeometry(geometry),
  })).filter((permit) => permit.geometry);

  const usable = projects.filter((project) => project.geometry && project.name);
  const counts = usable.reduce((acc, project) => ({ ...acc, [project.origin]: (acc[project.origin] || 0) + 1 }), {});
  return {
    projects: usable, permits, catalystsReviewedAt: catalysts.reviewedAt,
    source: { id: 'projects', name: 'City of Savannah CIP, CORE MPO 2050 MTP, zoning actions, MPC petitions, commercial permits + curated catalysts', url: 'https://pub.sagis.org/arcgis/rest/services', fetchedAt: raw.cachedAt, records: usable.length, breakdown: counts },
    permitSource: { id: 'permits', name: 'City of Savannah new residential permits', url: config.sources.residentialPermits, fetchedAt: raw.cachedAt, records: permits.length, newestRecordAt: permits.map((permit) => permit.issuedAt).filter(Boolean).sort().at(-1) },
  };
}
