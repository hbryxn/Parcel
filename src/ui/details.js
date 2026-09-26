import { STATUSES, VERDICT_COLORS } from '../config.js';
import { COMPONENTS } from '../analytics/areaModel.js';
import { lineChart, rangeBar, scoreRing } from './charts.js';
import { ago, date, esc, money, num, pct, safeUrl } from './format.js';
import { GROUP_COLORS } from '../map/layers/projectLayer.js';

const metric = (label, value, hint = '') => `<div class="metric"><span>${esc(label)}</span><strong>${value}</strong>${hint ? `<small>${esc(hint)}</small>` : ''}</div>`;
const tone = (value) => (!Number.isFinite(value) ? '' : value > 0.05 ? 'up' : value < -0.05 ? 'down' : '');
const signed = (value, digits = 1) => `<b class="${tone(value)}">${pct(value, digits)}</b>`;
const link = (url, label) => (safeUrl(url) ? `<a class="source-link" href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${esc(label)} <span aria-hidden="true">↗</span></a>` : '');
const verdictChip = (verdict) => `<span class="chip verdict" style="--chip:${VERDICT_COLORS[verdict?.key] || VERDICT_COLORS.limited}">${esc(verdict?.label || 'Limited data')}</span>`;

// ---------------------------------------------------------------- ZIP / area
export function areaDetail(area, { regionSeries, projects, asOf, openings = [], housing = [] }) {
  const m = area.metrics; const s = area.score || {};
  const components = Object.entries(COMPONENTS).map(([key, component]) => {
    const value = s.components?.[key];
    return `<div class="component"><span>${esc(component.label)}</span><div class="bar"><i style="width:${Number.isFinite(value) ? value : 0}%"></i></div><b>${Number.isFinite(value) ? value : '—'}</b></div>`;
  }).join('');
  const valueChart = lineChart({
    series: [{ points: area.series.zhvi, className: 'primary', label: `ZIP ${area.zip}` }, { points: regionSeries.filter(([month]) => month >= (area.series.zhvi[0]?.[0] || '2012-01')), className: 'secondary', label: 'Region median' }],
    ariaLabel: `Typical home value in ${area.zip} since 2012`,
  });
  const marketChart = area.series.market.length > 6 ? lineChart({ series: [{ points: area.series.market.map(([month, , dom]) => [month, dom]), className: 'tertiary', label: 'Median days on market' }], format: (value) => `${Math.round(value)}d`, height: 110, ariaLabel: 'Median days on market' }) : '';

  return `
    <header class="detail-head">
      <span class="eyebrow">ZIP ${esc(area.zip)} · ${esc([area.city, area.county].filter(Boolean).join(', ') || 'Savannah region')}</span>
      <div class="score-row">${scoreRing(s.total, VERDICT_COLORS[s.verdict?.key] || VERDICT_COLORS.limited)}<div><h2>${esc(area.city || `ZIP ${area.zip}`)}</h2>${verdictChip(s.verdict)}<p class="muted">Confidence ${num(s.confidence)}% · score is relative to ${esc(String(asOf ? 'the region' : 'peers'))}</p></div></div>
      ${(s.tags || []).length ? `<div class="tags">${s.tags.map((tag) => `<span class="tag" title="${esc(tag.hint)}">${esc(tag.label)}</span>`).join('')}</div>` : ''}
    </header>
    <section class="detail-section">
      <div class="metrics three">
        ${metric('Typical value', money(m.value, true), asOf ? `Zillow · ${date(asOf, 'month')}` : '')}
        ${metric('1-year change', signed(m.yoyPct))}
        ${metric('3-yr / yr', signed(m.cagr3Pct))}
        ${metric('Forecast 12 mo', signed(m.forecast1yPct), 'Zillow ZHVF')}
        ${metric('Rent yield', Number.isFinite(m.grossYieldPct) ? `${m.grossYieldPct.toFixed(1)}%` : '—', Number.isFinite(m.rent) ? `${money(m.rent)}/mo rent` : 'no rent index')}
        ${metric('Price / income', Number.isFinite(m.priceToIncome) ? `${m.priceToIncome.toFixed(1)}×` : '—', Number.isFinite(m.medianIncome) ? `${money(m.medianIncome, true)} household` : '')}
      </div>
      <div class="chart-card">${valueChart}</div>
    </section>
    <section class="detail-section">
      <h3>Why this score</h3>
      <div class="components">${components}</div>
      <div class="reasons">
        ${(s.strengths || []).map((reason) => `<p class="reason good">${esc(reason)}</p>`).join('')}
        ${(s.risks || []).map((reason) => `<p class="reason bad">${esc(reason)}</p>`).join('')}
      </div>
    </section>
    <section class="detail-section">
      <h3>Market health <small>${m.marketAsOf ? `Redfin · 90 days to ${esc(date(m.marketAsOf, 'month'))}` : 'No Redfin coverage'}</small></h3>
      <div class="metrics three">
        ${metric('Months of supply', num(m.monthsSupply, 1))}
        ${metric('Median days', num(m.medianDom))}
        ${metric('Sale-to-list', pct(m.saleToListPct))}
        ${metric('Price cuts', Number.isFinite(m.priceDropsPct) ? `${m.priceDropsPct.toFixed(0)}%` : '—')}
        ${metric('Recorded sales 12 mo', num(m.recordedSales12m), m.recordedMedian12m ? `median ${money(m.recordedMedian12m, true)}` : 'outside Chatham records')}
        ${metric('New-home permits', num(m.newHomePermits12m), 'City of Savannah, 12 mo')}
      </div>
      ${marketChart ? `<div class="chart-card compact">${marketChart}</div>` : ''}
    </section>
    <section class="detail-section">
      <h3>Planned projects nearby <small>+${num(m.projectIndex, 1)} pts expected lift</small></h3>
      ${projects.length ? `<ul class="project-list">${projects.map(({ project, contribution }) => `
        <li><button data-project="${esc(project.id)}"><i style="background:${GROUP_COLORS[project.group] || GROUP_COLORS.infrastructure}"></i><span>${esc(project.name)}<small>${esc(project.categoryLabel)} · ${esc(project.stageLabel)}</small></span><b class="${tone(contribution)}">${contribution > 0 ? '+' : ''}${contribution.toFixed(2)}</b></button></li>`).join('')}</ul>` : '<p class="muted">No tracked projects influence this ZIP.</p>'}
    </section>
    <section class="detail-section">
      <h3>New development <small>permits, plats & recorded sales</small></h3>
      <div class="metrics three">
        ${metric('New-build sales', Number.isFinite(m.newBuildSharePct) ? `${m.newBuildSharePct.toFixed(0)}%` : num(m.newBuildSales12m), Number.isFinite(m.newBuildSales12m) ? `${num(m.newBuildSales12m)} homes, 12 mo` : 'outside Chatham records')}
        ${metric('New businesses', num(m.businessOpenings12m), Number.isFinite(m.groceryOpenings12m) && m.groceryOpenings12m ? `${m.groceryOpenings12m} grocery · 12 mo` : m.businessOpenings12m === null ? 'outside city permits' : 'permitted, 12 mo')}
        ${metric('Apartment pipeline', num(m.apartmentUnitsPipeline), m.apartmentUnitsPipeline === null ? 'outside city data' : 'units proposed/permitted')}
        ${metric('New subdivisions', num(m.newSubdivisions3y), Number.isFinite(m.subdivisionAcres3y) ? `${num(m.subdivisionAcres3y)} acres · 3 yrs` : 'outside Chatham plats')}
        ${metric('New-home permits', num(m.newHomePermits12m), m.newHomePermits12m === null ? 'outside city permits' : '12 months')}
        ${metric('Built since 2010', Number.isFinite(m.builtSince2010Pct) ? `${m.builtSince2010Pct.toFixed(0)}%` : '—', 'share of all homes')}
      </div>
      ${openings.length ? `<h4 class="sub">Recent store & business openings</h4><ul class="project-list">${openings.map((project) => `
        <li><button data-project="${esc(project.id)}"><i style="background:${GROUP_COLORS.business}"></i><span>${esc(project.name)}<small>${esc(project.subtype)} · ${esc(project.stageLabel)} · ${esc(date(project.openedAt || project.permittedAt, 'month'))}</small></span></button></li>`).join('')}</ul>` : ''}
      ${housing.length ? `<h4 class="sub">Housing in the pipeline</h4><ul class="project-list">${housing.map((project) => `
        <li><button data-project="${esc(project.id)}"><i style="background:${GROUP_COLORS.housing}"></i><span>${esc(project.name)}<small>${esc(project.units ? `${num(project.units)} units · ${project.stageLabel}` : `${num(project.acres)} acres · recorded ${date(project.recordedAt, 'month')}`)}</small></span></button></li>`).join('')}</ul>` : ''}
    </section>
    <section class="detail-section">
      <h3>People & housing <small>ACS 2020–24</small></h3>
      <div class="metrics three">
        ${metric('Population', num(m.population))}
        ${metric('Renters', Number.isFinite(m.renterSharePct) ? `${m.renterSharePct.toFixed(0)}%` : '—')}
        ${metric('Vacancy', Number.isFinite(m.vacancyPct) ? `${m.vacancyPct.toFixed(0)}%` : '—')}
      </div>
    </section>
    <p class="fine-print">Scores rank this ZIP against the others in the region. They're a research signal, not investment advice. Verify with local comps, inspections and a licensed professional.</p>`;
}

// ---------------------------------------------------------------- property
export function propertyDetail(property, { area }) {
  const status = STATUSES[property.status] || STATUSES.sold;
  const estimate = property.estimate;
  const isListing = property.status === 'for-sale' || property.status === 'pending';
  const history = (property.history || []).filter((event) => Number.isFinite(event.price) && event.date);
  const qualified = history.filter((event) => event.quality !== 'U');
  const indexSeries = area?.series?.zhvi || [];
  const firstSale = qualified[0];
  // Scale the ZIP index to the first recorded sale so the "market path" is comparable.
  const baseline = firstSale ? indexSeries.find(([month]) => month >= firstSale.date.slice(0, 7))?.[1] : null;
  const marketPath = baseline ? indexSeries.filter(([month]) => month >= firstSale.date.slice(0, 7)).map(([month, value]) => [month, (value / baseline) * firstSale.price]) : [];
  const chart = qualified.length ? lineChart({
    series: [
      { points: marketPath.length ? marketPath : qualified.map((event) => [event.date, event.price]), className: marketPath.length ? 'secondary' : 'primary', label: marketPath.length ? 'If it tracked the ZIP index' : 'Recorded prices' },
      ...(estimate?.value ? [{ points: [[qualified.at(-1).date, qualified.at(-1).price], [new Date().toISOString().slice(0, 10), estimate.value]], className: 'estimate', label: 'To today’s estimate' }] : []),
    ],
    markers: qualified.map((event) => ({ date: event.date, value: event.price, label: `${event.event} ${date(event.date)} · ${money(event.price)}`, legend: 'Recorded sale / listing' })),
    ariaLabel: 'Price history',
  }) : '';

  const deal = property.deal;
  const dealBlock = isListing && deal ? `
    <div class="deal ${esc(deal.key)}">
      <div><span class="eyebrow">INVESTMENT SIGNAL</span><strong>${esc(deal.label)}</strong><p>${deal.gapPct >= 0 ? `Asking is ${Math.abs(deal.gapPct).toFixed(1)}% below` : `Asking is ${Math.abs(deal.gapPct).toFixed(1)}% above`} the estimated value, in a ZIP scoring ${num(property.areaScore)}/100.</p></div>
      ${scoreRing(deal.score, VERDICT_COLORS[deal.key] || VERDICT_COLORS.neutral, 56)}
    </div>` : '';

  const changeRows = [
    property.resale ? `<div class="change-row"><span>Last resale</span><p>${money(property.resale.fromPrice, true)} (${esc(date(property.resale.fromDate, 'month'))}) → ${money(property.resale.toPrice, true)} (${esc(date(property.resale.toDate, 'month'))})</p>${signed(property.resale.changePct)}<small>${pct(property.resale.annualPct)}/yr over ${num(property.resale.years, 1)} yrs</small></div>` : '',
    property.sinceLastSale && !isListing ? `<div class="change-row"><span>Since last sale</span><p>${money(estimate?.basisSale?.price ?? property.price, true)} → est. ${money(estimate?.value, true)} today</p>${signed(property.sinceLastSale.changePct)}<small>${pct(property.sinceLastSale.annualPct)}/yr</small></div>` : '',
    area?.metrics?.yoyPct !== undefined ? `<div class="change-row"><span>ZIP ${esc(property.zip)} market</span><p>Typical value ${money(area.metrics.value, true)}</p>${signed(area.metrics.yoyPct)}<small>last 12 months</small></div>` : '',
  ].filter(Boolean).join('');

  return `
    <header class="detail-head">
      <span class="eyebrow"><i class="status-dot ${esc(property.status)}"></i>${esc(status.label.toUpperCase())}${property.live ? ' · LIVE' : ''}${property.stale ? ' · SNAPSHOT' : ''} · ZIP ${esc(property.zip)}</span>
      <h2>${esc(property.address)}</h2>
      <p class="muted">${esc([property.city, property.propertyType !== 'Residential' ? property.propertyType : null, property.yearBuilt ? `built ${property.yearBuilt}` : null].filter(Boolean).join(' · '))}</p>
      ${property.newConstruction ? '<div class="tags"><span class="tag new-build">New construction</span></div>' : ''}
    </header>
    <section class="detail-section">
      <div class="metrics three">
        ${metric(status.priceLabel, money(property.status === 'off-market' ? property.lastSalePrice : property.price), property.eventDate ? `${status.dateLabel} ${date(property.eventDate)}` : '')}
        ${metric('Estimated value', money(estimate?.value), estimate?.method ? `${estimate.method}${estimate.comps ? ` · ${estimate.comps} comps` : ''}` : 'insufficient data')}
        ${metric('Price / ft²', property.sqft && Number.isFinite(property.price) ? money(property.price / property.sqft) : '—', property.sqft ? `${num(property.sqft)} ft²` : '')}
      </div>
      ${estimate?.low ? `<div class="estimate-range"><span class="eyebrow">ESTIMATE RANGE</span>${rangeBar({ low: estimate.low, value: estimate.value, high: estimate.high, ask: isListing ? property.price : undefined })}</div>` : ''}
      ${dealBlock}
    </section>
    ${changeRows ? `<section class="detail-section"><h3>Price change</h3>${changeRows}</section>` : ''}
    ${chart ? `<section class="detail-section"><h3>Price history</h3><div class="chart-card">${chart}</div>
      <ul class="timeline">${[...history].reverse().map((event) => `<li class="${event.quality === 'U' ? 'unqualified' : ''}"><span>${esc(date(event.date))}</span><b>${esc(event.event)}</b><strong>${money(event.price)}</strong>${event.quality === 'U' ? '<small>non-market transfer</small>' : ''}</li>`).join('')}</ul></section>` : ''}
    <section class="detail-section">
      <h3>Location context</h3>
      <div class="metrics three">
        ${metric('Area score', `${num(property.areaScore)}<small>/100</small>`, area?.score?.verdict?.label || '')}
        ${metric('Project lift', Number.isFinite(property.projectLift) ? `+${property.projectLift.toFixed(1)} pts` : '—', 'weighted planned investment')}
        ${metric('Assessed value', money(property.assessedValue, true), 'Chatham BOA 2025')}
      </div>
      <div class="facts">${[property.beds ? `${property.beds} bd` : null, property.baths ? `${property.baths} ba` : null, property.sqft ? `${num(property.sqft)} ft²` : null, property.acres ? `${property.acres} ac lot` : null, property.dom ? `${property.dom} days on market` : null].filter(Boolean).map((fact) => `<span>${esc(fact)}</span>`).join('')}</div>
      ${area ? `<button class="text-button" data-zip="${esc(property.zip)}">Open ZIP ${esc(property.zip)} analysis →</button>` : ''}
    </section>
    <p class="fine-print">Source: ${esc(property.sourceName || 'Unknown')}${property.sourceUpdatedAt ? ` · updated ${esc(ago(property.sourceUpdatedAt))}` : ''}${property.stale ? ' · listing status may have changed, so verify before acting' : ''}. ${link(property.sourceUrl, 'View source')}</p>`;
}

// ---------------------------------------------------------------- project
const timingTag = (project) => {
  if (project.group === 'business' || !project.expectedYear || project.recordedAt) return '';
  return `<span class="tag">${project.stage === 'complete' ? 'Completed' : 'Expected'} ~${Math.round(project.expectedYear)}</span>`;
};

export function projectDetail(project, { affectedAreas }) {
  return `
    <header class="detail-head">
      <span class="eyebrow"><i class="status-dot project" style="background:${GROUP_COLORS[project.group] || GROUP_COLORS.infrastructure}"></i>${esc({ business: 'NEW BUSINESS', housing: 'NEW DEVELOPMENT' }[project.group] || 'PLANNED PROJECT')} · ${esc(project.categoryLabel.toUpperCase())}</span>
      <h2>${esc(project.name)}</h2>
      <div class="tags"><span class="tag">${esc(project.stageLabel)}</span>${timingTag(project)}${project.brand ? `<span class="tag">${esc(project.brand)}</span>` : ''}${project.coordinatePrecision === 'approximate' ? '<span class="tag">Approximate location</span>' : ''}</div>
    </header>
    <section class="detail-section">
      <p class="lede">${esc(project.summary || 'No description published.')}</p>
      <div class="metrics three">
        ${metric('Expected lift', `${project.weightedPeak >= 0 ? '+' : ''}${project.weightedPeak.toFixed(1)} pts`, 'at the epicentre, weighted')}
        ${metric('Delivery odds', `${Math.round(project.probability * 100)}%`, `stage: ${project.stageLabel}`)}
        ${metric('Reach', `${num(project.reachMiles, 1)} mi`, project.direction === 'mixed' ? 'mixed: benefits and nuisance' : project.direction)}
      </div>
      <div class="facts">${[
        project.units ? `${num(project.units)} units` : null, project.acres ? `${num(project.acres, project.acres < 10 ? 1 : 0)} acres` : null,
        project.workClass || null, project.costUsd ? `${money(project.costUsd, true)} permit value` : null, project.jobs ? `${num(project.jobs)} target jobs` : null,
        project.permittedAt ? `Permitted ${date(project.permittedAt)}` : null, project.openedAt ? `Finalized ${date(project.openedAt)}` : null, project.recordedAt ? `Recorded ${date(project.recordedAt)}` : null,
      ].filter(Boolean).map((fact) => `<span>${esc(fact)}</span>`).join('')}</div>
    </section>
    <section class="detail-section">
      <h3>How it's scored</h3>
      <ul class="formula">
        ${project.effects.map((effect) => `<li><b class="${tone(effect.lift)}">${effect.lift > 0 ? '+' : ''}${effect.lift.toFixed(1)} pts</b> fading to 0 at ${effect.radiusMiles.toFixed(1)} mi</li>`).join('')}
        <li>× ${Math.round(project.probability * 100)}% delivery probability (${esc(project.stageLabel)})</li>
        <li>× ${project.timing.toFixed(2)} timing factor (${project.stage === 'complete' ? 'benefit partly priced in' : 'future benefits discounted ~10%/yr'})</li>
      </ul>
    </section>
    ${affectedAreas.length ? `<section class="detail-section"><h3>ZIPs it affects most</h3><ul class="project-list">${affectedAreas.map(({ area, contribution }) => `<li><button data-zip="${esc(area.zip)}"><i style="background:${VERDICT_COLORS[area.score?.verdict?.key] || VERDICT_COLORS.limited}"></i><span>${esc(area.zip)} · ${esc(area.city || '')}<small>${esc(area.score?.verdict?.label || '')}</small></span><b class="${tone(contribution)}">${contribution > 0 ? '+' : ''}${contribution.toFixed(2)}</b></button></li>`).join('')}</ul></section>` : ''}
    <p class="fine-print">Source: ${esc(project.source || project.origin)}. ${link(project.sourceUrl, 'View public record')} Lift values are transparent scenario assumptions, not appraisals.</p>`;
}
