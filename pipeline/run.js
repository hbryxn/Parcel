#!/usr/bin/env node
// Parcel data pipeline: fetch → normalize → model → publish static JSON to public/data.
//   npm run pipeline             refresh anything whose cache has expired
//   npm run pipeline -- --offline  rebuild outputs from cached sources only
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { PIPELINE_CONFIG as config } from './config.js';
import { loadZctas } from './sources/zctas.js';
import { loadZillow } from './sources/zillow.js';
import { loadRedfin } from './sources/redfin.js';
import { loadACS } from './sources/acs.js';
import { loadParcels } from './sources/parcels.js';
import { loadProjects } from './sources/projects.js';
import { loadDevelopment } from './sources/development.js';
import { loadInbox, loadRentCast } from './sources/listings.js';
import { buildProperties, OFF_MARKET_COLUMNS } from './build/properties.js';
import { createZipIndex, samplePoints } from './lib/geo.js';
import { backtestAreaModel, marketFeatures, priceFeatures, regionSeries, scoreAreas, shiftMonth } from '../src/analytics/areaModel.js';
import { impactAt, resolveProject } from '../src/analytics/projectImpact.js';
import { assessmentRatios, backtestValuation, createIndex } from '../src/analytics/valuationModel.js';
import { median, pctChange } from '../src/analytics/stats.js';

const args = new Set(process.argv.slice(2));
const anchorOf = (project) => {
  const { type, coordinates } = project.geometry;
  if (type === 'Point') return coordinates;
  if (type === 'LineString') return coordinates[Math.floor(coordinates.length / 2)];
  if (type === 'MultiLineString') return coordinates[0][Math.floor(coordinates[0].length / 2)];
  return coordinates[0][0];
};
const options = { offline: args.has('--offline') };
const now = new Date();
const today = now.toISOString().slice(0, 10);
const step = (label) => console.log(`\n▸ ${label}`);
const round = (value, digits = 1) => (Number.isFinite(value) ? Number(value.toFixed(digits)) : null);
const roundMetrics = (metrics) => Object.fromEntries(Object.entries(metrics).map(([key, value]) => [key, typeof value === 'number' ? round(value, Math.abs(value) >= 1000 ? 0 : 2) : value]));

async function loadEnvKey() {
  if (process.env.RENTCAST_API_KEY) return process.env.RENTCAST_API_KEY;
  try {
    const { readFile } = await import('node:fs/promises');
    for (const file of ['.env.local', '.env']) {
      const text = await readFile(new URL(`../${file}`, import.meta.url), 'utf8').catch(() => '');
      const match = text.match(/^RENTCAST_API_KEY=(.+)$/m);
      if (match?.[1]?.trim()) return match[1].trim();
    }
  } catch { /* no key */ }
  return null;
}

async function main() {
  const started = Date.now();
  step('Region ZIP codes');
  const zctas = await loadZctas(config, options);
  const zips = zctas.areas.map((area) => area.zip);
  console.log(`  ${zips.length} ZCTAs within ${config.region.radiusMiles} mi`);

  step('Area market data (Zillow · Redfin · ACS)');
  const [zillow, redfin, acs] = await Promise.all([loadZillow(config, zips, options), loadRedfin(config, zips, options), loadACS(config, zips, options)]);
  const zhviByZip = Object.fromEntries(Object.entries(zillow.zhvi).map(([zip, item]) => [zip, item.series]));
  const zoriByZip = Object.fromEntries(Object.entries(zillow.zori).map(([zip, item]) => [zip, item.series]));
  console.log(`  ZHVI ${Object.keys(zhviByZip).length} · ZORI ${Object.keys(zoriByZip).length} · Redfin ${Object.keys(redfin.byZip).length} · ACS ${Object.keys(acs.byZip).length}`);

  step('Chatham County parcels & recorded sales');
  const parcelData = await loadParcels(config, options);
  console.log(`  ${parcelData.parcels.length} residential parcels`);

  step('Planned projects & permits');
  const [projectData, development] = await Promise.all([loadProjects(config, options, now), loadDevelopment(options, now)]);
  const projects = [...projectData.projects, ...development.businesses, ...development.housing]
    .map((project) => resolveProject(project, now)).filter((project) => project.probability > 0);
  console.log(`  ${projectData.projects.length} projects · ${development.businesses.length} business openings · ${development.housing.length} housing developments · ${projectData.permits.length} new-home permits`);

  step('Listings (RentCast · inbox exports)');
  const [inbox, rentcast] = await Promise.all([loadInbox(), loadRentCast(config, await loadEnvKey(), options)]);
  console.log(`  inbox ${inbox.records.length} records · RentCast ${rentcast.source.status} (${rentcast.records.length})`);

  // ---------------------------------------------------------------- models
  step('Valuation backtest');
  const regional = regionSeries(zhviByZip);
  const index = createIndex(zhviByZip, regional);
  const testFrom = shiftMonth(today.slice(0, 7), -12) + '-01';
  const valuation = backtestValuation(parcelData.parcels, { index, testFrom });
  console.log(`  ${valuation.sampleSize} held-out sales · median error ${round(valuation.medianErrorPct)}% · within 10%: ${round(valuation.within10Pct)}%`);
  const recentPairs = parcelData.parcels.flatMap((parcel) => parcel.sales.filter((sale) => sale.quality === 'Q' && sale.date >= testFrom).map((sale) => ({ zip: parcel.zip, neighborhood: parcel.neighborhood, price: sale.price, fmv: parcel.fmv })));
  const ratios = assessmentRatios(recentPairs);

  step('Area scores');
  const zipOf = createZipIndex(zctas.areas);
  const permitsByZip = new Map();
  const permitCutoff = new Date(now); permitCutoff.setUTCFullYear(permitCutoff.getUTCFullYear() - 1);
  for (const permit of projectData.permits) {
    if (!permit.issuedAt || permit.issuedAt < permitCutoff.toISOString().slice(0, 10)) continue;
    const zip = zipOf(permit.geometry.coordinates);
    if (zip) permitsByZip.set(zip, (permitsByZip.get(zip) || 0) + 1);
  }
  const salesByZip = new Map();
  for (const parcel of parcelData.parcels) {
    for (const sale of parcel.sales) if (sale.quality === 'Q' && sale.price >= 30000) salesByZip.set(parcel.zip, [...(salesByZip.get(parcel.zip) || []), sale]);
  }
  const yearAgo = shiftMonth(today.slice(0, 7), -12); const twoYearsAgo = shiftMonth(today.slice(0, 7), -24);

  // Development activity per ZIP. City permit data only covers Savannah, so ZIPs with no
  // permit history report null (unknown) rather than zero.
  const permitZips = new Set(projectData.permits.map((permit) => zipOf(permit.geometry.coordinates)).filter(Boolean));
  const chathamZips = new Set(parcelData.parcels.map((parcel) => parcel.zip));
  const devByZip = new Map();
  const bump = (zip, key, amount = 1) => { if (!zip) return; const row = devByZip.get(zip) || {}; row[key] = (row[key] || 0) + amount; devByZip.set(zip, row); };
  const cutoff12 = `${yearAgo}-01`;
  for (const project of projects) {
    const zip = zipOf(project.centroid || anchorOf(project));
    if (project.category === 'business' && (project.permittedAt || '') >= cutoff12) { bump(zip, 'businessOpenings12m'); if (project.businessType === 'grocery') bump(zip, 'groceryOpenings12m'); }
    if (project.category === 'multifamily') bump(zip, 'apartmentUnitsPipeline', project.units || 0);
    if (project.category === 'subdivision') { bump(zip, 'newSubdivisions3y'); bump(zip, 'subdivisionAcres3y', project.acres || 0); }
  }
  const builtRecently = (parcel) => parcel.yearBuilt && parcel.yearBuilt >= now.getUTCFullYear() - 2;
  const newBuildByZip = new Map();
  for (const parcel of parcelData.parcels) {
    const sales = parcel.sales.filter((sale) => sale.quality === 'Q' && sale.price >= 30000 && sale.date.slice(0, 7) > yearAgo);
    if (!sales.length) continue;
    const row = newBuildByZip.get(parcel.zip) || { total: 0, fresh: 0 };
    row.total += sales.length;
    if (builtRecently(parcel) && sales.some((sale) => Number(sale.date.slice(0, 4)) >= parcel.yearBuilt)) row.fresh += 1;
    newBuildByZip.set(parcel.zip, row);
  }

  const rawAreas = zctas.areas.map((area) => {
    const z = zillow.zhvi[area.zip]; const census = acs.byZip[area.zip] || {};
    const price = priceFeatures(zhviByZip[area.zip], zoriByZip[area.zip]);
    const market = marketFeatures(redfin.byZip[area.zip]);
    const samples = samplePoints(area.geometry, 16);
    const points = samples.length ? samples : [area.centroid];
    const contributions = new Map();
    let projectTotal = 0;
    for (const point of points) {
      const { total, breakdown } = impactAt(point, projects, { withBreakdown: true });
      projectTotal += total;
      for (const item of breakdown) contributions.set(item.id, { ...item, contribution: (contributions.get(item.id)?.contribution || 0) + item.contribution / points.length });
    }
    const recorded = salesByZip.get(area.zip) || [];
    const last12 = recorded.filter((sale) => sale.date.slice(0, 7) > yearAgo).map((sale) => sale.price);
    const prior12 = recorded.filter((sale) => sale.date.slice(0, 7) <= yearAgo && sale.date.slice(0, 7) > twoYearsAgo).map((sale) => sale.price);
    const metrics = {
      ...price, ...market, forecast1yPct: zillow.forecast[area.zip]?.oneYearPct ?? null,
      medianIncome: census.medianIncome, population: census.population, renterSharePct: census.renterSharePct, builtSince2010Pct: census.builtSince2010Pct, vacancyPct: census.vacancyPct,
      priceToIncome: price.value && census.medianIncome ? price.value / census.medianIncome : null,
      projectIndex: projectTotal / points.length, newHomePermits12m: permitsByZip.get(area.zip) ?? (permitZips.has(area.zip) ? 0 : null),
      businessOpenings12m: permitZips.has(area.zip) ? devByZip.get(area.zip)?.businessOpenings12m || 0 : null,
      groceryOpenings12m: permitZips.has(area.zip) ? devByZip.get(area.zip)?.groceryOpenings12m || 0 : null,
      apartmentUnitsPipeline: permitZips.has(area.zip) ? devByZip.get(area.zip)?.apartmentUnitsPipeline || 0 : null,
      newSubdivisions3y: chathamZips.has(area.zip) ? devByZip.get(area.zip)?.newSubdivisions3y || 0 : null,
      subdivisionAcres3y: chathamZips.has(area.zip) ? Math.round(devByZip.get(area.zip)?.subdivisionAcres3y || 0) : null,
      newBuildSales12m: newBuildByZip.get(area.zip)?.fresh ?? null,
      newBuildSharePct: newBuildByZip.get(area.zip)?.total >= 10 ? (newBuildByZip.get(area.zip).fresh / newBuildByZip.get(area.zip).total) * 100 : null,
      recordedSales12m: recorded.length ? last12.length : null, recordedMedian12m: median(last12), recordedYoyPct: last12.length >= 15 && prior12.length >= 15 ? pctChange(median(last12), median(prior12)) : null,
    };
    return {
      zip: area.zip, city: z?.city || null, county: z?.county || null, state: z?.state || null, metro: z?.metro || null,
      centroid: area.centroid, landSqMi: round(area.landSqMi, 1), geometry: area.geometry, metrics,
      topProjects: [...contributions.values()].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 5).map((item) => ({ id: item.id, name: item.name, contribution: round(item.contribution, 2) })),
      series: {
        zhvi: (zhviByZip[area.zip] || []).filter(([month]) => month >= '2012-01'),
        zori: (zoriByZip[area.zip] || []).filter(([month]) => month >= '2016-01'),
        market: (redfin.byZip[area.zip] || []).filter((point) => point.month >= '2019-01').map((point) => [point.month, point.medianSale, point.medianDom, point.inventory, point.homesSold]),
      },
    };
  }).filter((area) => area.series.zhvi.length || area.series.market.length || area.metrics.recordedSales12m);
  const areas = scoreAreas(rawAreas).map((area) => ({ ...area, metrics: roundMetrics(area.metrics) }));
  const areasByZip = new Map(areas.map((area) => [area.zip, area]));
  const areaBacktest = backtestAreaModel(Object.fromEntries(Object.entries(zhviByZip).filter(([zip]) => areasByZip.has(zip))), zoriByZip);
  console.log(`  ${areas.length} ZIPs scored · backtest mean rank correlation ${round(areaBacktest.meanRankCorrelation, 2)} · top-vs-bottom spread ${round(areaBacktest.meanSpreadPct)} pts`);

  step('Property records');
  const built = buildProperties({ parcels: parcelData.parcels, inbox, rentcast, areasByZip, index, ratios, valuation, projects, now, soldWindowMonths: config.soldWindowMonths });
  const counts = built.properties.reduce((acc, item) => ({ ...acc, [item.status]: (acc[item.status] || 0) + 1 }), {});
  const offMarketCount = [...built.offMarket.values()].reduce((sum, rows) => sum + rows.length, 0);
  console.log(`  ${JSON.stringify(counts)} · off-market ${offMarketCount} across ${built.offMarket.size} ZIPs`);

  // ---------------------------------------------------------------- publish
  step('Publishing');
  const out = config.outputDir;
  await rm(new URL('parcels/', out), { recursive: true, force: true });
  await mkdir(new URL('parcels/', out), { recursive: true });
  const write = (name, value) => writeFile(new URL(name, out), JSON.stringify(value));

  const listingSources = [...inbox.files.map((file) => ({ id: `inbox-${file.file}`, name: `Inbox export · ${file.file}`, records: file.records, asOf: file.newest, oldest: file.oldest })), rentcast.source];
  const activeRecords = built.properties.filter((item) => item.status === 'for-sale');
  const newestActive = activeRecords.map((item) => item.sourceUpdatedAt || item.eventDate).filter(Boolean).sort().at(-1) || null;
  const completenessFields = ['address', 'zip', 'price', 'eventDate', 'coordinates', 'footprint', 'sqft', 'estimate'];
  const completeness = Object.fromEntries(completenessFields.map((field) => [field, round(built.properties.filter((item) => item[field] !== null && item[field] !== undefined).length / (built.properties.length || 1) * 100)]));

  const manifest = {
    generatedAt: now.toISOString(), region: { ...config.region, zips: areas.length },
    counts: {
      ...counts, offMarket: offMarketCount, projects: projects.length, permits: projectData.permits.length,
      businessOpenings: development.businesses.length, subdivisions: development.housing.filter((item) => item.category === 'subdivision').length,
      apartmentUnits: development.housing.filter((item) => item.category === 'multifamily').reduce((sum, item) => sum + (item.units || 0), 0),
    },
    sources: [zctas.source, ...zillow.sources, redfin.source, acs.source, ...parcelData.sources, projectData.source, development.source, projectData.permitSource, ...listingSources],
    quality: {
      valuation: valuation, areaModel: areaBacktest, completeness,
      activeInventory: { provider: rentcast.source.status === 'ok' ? 'RentCast' : 'Saved snapshot', live: rentcast.source.status === 'ok', records: activeRecords.length, newestRecordAt: newestActive, note: rentcast.source.note || null },
      matching: { listingsMatchedToParcels: built.matched, compsWithSqft: built.comps },
      catalystsReviewedAt: projectData.catalystsReviewedAt,
    },
    offMarketColumns: OFF_MARKET_COLUMNS,
  };

  await Promise.all([
    write('areas.json', { generatedAt: manifest.generatedAt, asOf: zillow.sources[0].asOf, regionSeries: regional.filter(([month]) => month >= '2012-01'), areas }),
    write('properties.json', { generatedAt: manifest.generatedAt, properties: built.properties }),
    write('projects.json', {
      generatedAt: manifest.generatedAt,
      projects: projects.map((project) => ({ ...project, zip: zipOf(project.centroid || anchorOf(project)), summary: project.summary?.slice(0, 400) || '' })),
      permits: projectData.permits.filter((permit) => permit.issuedAt >= permitCutoff.toISOString().slice(0, 10)).map((permit) => ({ id: permit.id, issuedAt: permit.issuedAt, value: permit.value, coordinates: permit.geometry.coordinates })),
    }),
    write('manifest.json', manifest),
    ...[...built.offMarket.entries()].map(([zip, rows]) => write(`parcels/${zip}.json`, { zip, columns: OFF_MARKET_COLUMNS, rows })),
  ]);
  console.log(`\n✓ Done in ${Math.round((Date.now() - started) / 1000)}s → public/data`);
}

main().catch((error) => { console.error('\n✗ Pipeline failed:', error); process.exitCode = 1; });
