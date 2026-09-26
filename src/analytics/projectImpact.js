import { milesBetween } from './stats.js';

// How strongly a finished project of each kind tends to move nearby home values
// (percentage points at the epicentre) and how far that influence reaches.
// These are transparent scenario priors, not appraisals; each project can override them.
export const CATEGORY_EFFECTS = {
  employment: { label: 'Major employer', effects: [{ lift: 5, radiusMiles: 20 }] },
  port: { label: 'Port & logistics', effects: [{ lift: 1.5, radiusMiles: 15 }, { lift: -2.5, radiusMiles: 1.2 }] },
  transportation: { label: 'Transportation', effects: [{ lift: 1.5, radiusMiles: 2.5 }] },
  mobility: { label: 'Streets, trails & mobility', effects: [{ lift: 1.8, radiusMiles: 0.8 }] },
  parks: { label: 'Parks & open space', effects: [{ lift: 3, radiusMiles: 0.6 }] },
  district: { label: 'Mixed-use & civic district', effects: [{ lift: 4, radiusMiles: 1.4 }] },
  drainage: { label: 'Drainage & flood resilience', effects: [{ lift: 2.5, radiusMiles: 1 }] },
  utilities: { label: 'Water & sewer capacity', effects: [{ lift: 0.6, radiusMiles: 1 }] },
  civic: { label: 'Public buildings', effects: [{ lift: 0.8, radiusMiles: 0.5 }] },
  residential: { label: 'New housing', effects: [{ lift: 1.2, radiusMiles: 0.8 }] },
  commercial: { label: 'Commercial construction', effects: [{ lift: 1.4, radiusMiles: 0.6 }] },
  rezoning: { label: 'Rezoning', effects: [{ lift: 0.9, radiusMiles: 0.5 }] },
  subdivision: { label: 'New subdivision', effects: [{ lift: 0.8, radiusMiles: 0.6 }] },
  multifamily: { label: 'Apartment development', effects: [{ lift: 0.9, radiusMiles: 0.7 }] },
  industrial: { label: 'Industrial / logistics', effects: [{ lift: 0.8, radiusMiles: 4 }, { lift: -1, radiusMiles: 0.4 }] },
  business: { label: 'New business', effects: [{ lift: 0.5, radiusMiles: 0.5 }] },
};

// How projects are grouped in filters and on the map.
export const PROJECT_GROUPS = {
  infrastructure: { label: 'Infrastructure & civic', categories: ['employment', 'port', 'transportation', 'mobility', 'parks', 'district', 'drainage', 'utilities', 'civic', 'rezoning'] },
  housing: { label: 'New housing', categories: ['residential', 'subdivision', 'multifamily'] },
  business: { label: 'New businesses', categories: ['business', 'commercial', 'industrial'] },
};
export const groupOf = (category) => Object.entries(PROJECT_GROUPS).find(([, group]) => group.categories.includes(category))?.[0] || 'infrastructure';

// Likelihood the project is delivered roughly as described.
export const STAGE_PROBABILITY = {
  withdrawn: 0, 'on-hold': 0.2, proposed: 0.35, planning: 0.45, approved: 0.6, design: 0.65, funded: 0.75, construction: 0.9, complete: 1,
};

export const STAGE_LABELS = {
  withdrawn: 'Withdrawn', 'on-hold': 'On hold', proposed: 'Proposed', planning: 'Planning', approved: 'Approved', design: 'Design',
  funded: 'Funded / ongoing', construction: 'Under construction', complete: 'Complete',
};

// Businesses read better as opening status than as planning stages.
const stageLabel = (project) => {
  if (project.category === 'business') return project.likelyOpen ? 'Likely open' : { complete: 'Opened', construction: 'Opening soon', approved: 'In permitting' }[project.stage] || STAGE_LABELS[project.stage];
  if (project.category === 'subdivision' || project.category === 'industrial') return 'Plat recorded';
  return STAGE_LABELS[project.stage] || project.stage;
};

const SCALE = { site: { lift: 0.7, radius: 0.7 }, neighborhood: { lift: 1, radius: 1 }, district: { lift: 1.3, radius: 1.5 }, regional: { lift: 1, radius: 1 } };

// Future benefits are discounted; benefits delivered long ago are mostly priced in already.
export const timeFactor = (expectedYear, stage, now = new Date()) => {
  const year = now.getUTCFullYear() + now.getUTCMonth() / 12;
  if (!Number.isFinite(expectedYear)) return stage === 'complete' ? 0.5 : 0.8;
  const delta = expectedYear - year;
  if (delta > 0) return 0.9 ** delta;
  return delta > -2 ? 0.75 : 0.4;
};

export const kernel = (distance, radius) => (distance >= radius ? 0 : (1 - (distance / radius) ** 2) ** 2);

const distanceToSegment = (point, a, b) => {
  const scale = Math.cos(point[1] * Math.PI / 180);
  const [px, py] = [point[0] * scale, point[1]]; const [ax, ay] = [a[0] * scale, a[1]]; const [bx, by] = [b[0] * scale, b[1]];
  const lengthSq = (bx - ax) ** 2 + (by - ay) ** 2;
  const t = lengthSq ? Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / lengthSq)) : 0;
  return milesBetween(point, [(ax + t * (bx - ax)) / scale, ay + t * (by - ay)]);
};

const insideRing = ([x, y], ring) => {
  let inside = false;
  for (let index = 0, prev = ring.length - 1; index < ring.length; prev = index, index += 1) {
    const [xi, yi] = ring[index]; const [xj, yj] = ring[prev];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

export const distanceToGeometry = (point, geometry) => {
  if (geometry.type === 'Point') return milesBetween(point, geometry.coordinates);
  if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    if (polygons.some(([outer]) => insideRing(point, outer))) return 0;
    return distanceToGeometry(point, { type: 'MultiLineString', coordinates: polygons.flat() });
  }
  const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  let best = Infinity;
  for (const line of lines) for (let index = 1; index < line.length; index += 1) best = Math.min(best, distanceToSegment(point, line[index - 1], line[index]));
  return best;
};

// Resolve a raw project into weighted effects the map and scorer can apply.
export const resolveProject = (project, now = new Date()) => {
  const category = CATEGORY_EFFECTS[project.category] || CATEGORY_EFFECTS.civic;
  const scale = SCALE[project.scale] || SCALE.neighborhood;
  const probability = STAGE_PROBABILITY[project.stage] ?? 0.4;
  const timing = timeFactor(project.expectedYear, project.stage, now);
  const effects = (project.effects || category.effects).map((effect) => ({
    lift: effect.lift * (project.effects ? 1 : scale.lift),
    radiusMiles: effect.radiusMiles * (project.effects ? 1 : scale.radius),
  }));
  const weight = probability * timing;
  const peak = effects.reduce((sum, effect) => sum + effect.lift, 0) * weight;
  return {
    ...project, categoryLabel: project.subtype && project.category === 'business' ? project.subtype : category.label, stageLabel: stageLabel(project), group: groupOf(project.category),
    probability, timing, effects, weightedPeak: Number(peak.toFixed(2)),
    reachMiles: Math.max(...effects.map((effect) => effect.radiusMiles)),
    direction: effects.every((effect) => effect.lift >= 0) ? 'positive' : effects.every((effect) => effect.lift <= 0) ? 'negative' : 'mixed',
  };
};

// Expected value premium (percentage points) at a location from all resolved projects.
export const impactAt = (point, resolvedProjects, { withBreakdown = false } = {}) => {
  let total = 0; const breakdown = [];
  for (const project of resolvedProjects) {
    if (!project.probability) continue;
    const distance = distanceToGeometry(point, project.geometry);
    let contribution = 0;
    for (const effect of project.effects) contribution += effect.lift * kernel(distance, effect.radiusMiles);
    contribution *= project.probability * project.timing;
    if (Math.abs(contribution) >= 0.01) {
      total += contribution;
      if (withBreakdown) breakdown.push({ id: project.id, name: project.name, contribution: Number(contribution.toFixed(2)), distanceMiles: Number(distance.toFixed(2)) });
    }
  }
  return withBreakdown ? { total, breakdown: breakdown.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)) } : total;
};
