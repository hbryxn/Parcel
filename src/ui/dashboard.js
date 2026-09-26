import { AREA_METRICS, COLOR_MODES, DIVERGING, PRICE_BANDS, STATUSES, VERDICT_COLORS } from '../config.js';
import { ago, date, esc, formatMetric, money, num, pct } from './format.js';
import { GROUP_COLORS } from '../map/layers/projectLayer.js';

const STATUS_ORDER = ['for-sale', 'pending', 'sold', 'delisted', 'off-market'];
const ICONS = {
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  reset: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
  layers: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/></svg>',
  cube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M12 12v9M12 12l8-4.5M12 12 4 7.5"/></svg>',
};

const gradient = (colors) => `linear-gradient(90deg, ${colors.join(', ')})`;

export class Dashboard {
  constructor(root) { this.root = root; this.handler = () => {}; this.state = { tab: 'explore' }; }
  onIntent(handler) { this.handler = handler; }
  emit(intent) { this.handler(intent); }
  $(selector) { return this.root.querySelector(selector); }
  $$(selector) { return [...this.root.querySelectorAll(selector)]; }

  render({ manifest, live, theme, filters, areaMetric, colorMode }) {
    this.manifest = manifest;
    const freshness = this.freshness(manifest, live);
    this.root.innerHTML = `
      <main class="shell">
        <div id="map" aria-label="Map of Savannah-area homes, ZIP scores and planned projects"></div>

        <header class="topbar">
          <div class="brand"><span class="brand-mark" aria-hidden="true"></span><span class="brand-name">Parcel</span><span class="brand-sub">Savannah region</span></div>
          <div class="search">
            ${ICONS.search}
            <input id="search" type="search" autocomplete="off" placeholder="Search address, ZIP or project" aria-label="Search" aria-controls="search-results" />
            <kbd>/</kbd>
            <div class="search-results" id="search-results" role="listbox" hidden></div>
          </div>
          <div class="top-actions">
            <button class="pill freshness ${freshness.tone}" id="quality-button" title="Data sources and accuracy"><i></i><span>${esc(freshness.label)}</span></button>
            <button class="icon-button" id="theme-button" aria-label="Toggle dark mode">${theme === 'dark' ? ICONS.sun : ICONS.moon}</button>
          </div>
        </header>

        <aside class="panel" id="panel" aria-label="Map controls">
          <button class="panel-grip" id="panel-grip" aria-label="Expand panel"></button>
          <nav class="tabs" role="tablist">
            <button role="tab" data-tab="explore" class="active">Explore</button>
            <button role="tab" data-tab="areas">Areas</button>
            <button role="tab" data-tab="projects">Projects</button>
          </nav>

          <div class="tab-body" data-body="explore">
            <section class="region-kpis" id="region-kpis"></section>
            <section class="control-group">
              <h4>Show</h4>
              <div class="status-chips" id="status-chips">
                ${STATUS_ORDER.map((status) => `<button class="status-chip ${filters.statuses.includes(status) ? 'on' : ''}" data-status="${status}"><i class="status-dot ${status}"></i>${esc(STATUSES[status].label)}<b data-count="${status}">0</b></button>`).join('')}
              </div>
              <p class="hint" id="offmarket-hint" hidden>Zoom in to load off-market homes (Chatham County public record).</p>
            </section>
            <section class="control-group">
              <h4>Color homes by</h4>
              <div class="segmented" role="radiogroup">
                ${Object.entries(COLOR_MODES).map(([key, mode]) => `<button role="radio" data-color="${key}" class="${key === colorMode ? 'active' : ''}" title="${esc(mode.description)}">${esc(mode.label)}</button>`).join('')}
              </div>
            </section>
            <section class="control-group two-col">
              <label><span>Price</span><select id="band-filter"><option value="all">Any price</option>${PRICE_BANDS.map((band) => `<option value="${band.key}">${esc(band.label)}</option>`).join('')}</select></label>
              <label><span>Signal</span><select id="verdict-filter"><option value="all">All homes</option><option value="good">Strong signals</option><option value="bad">Weak signals</option></select></label>
            </section>
            <section class="summary" id="summary"></section>
            <section class="control-group">
              <h4>Map layers</h4>
              <label class="toggle"><input type="checkbox" data-layer="areas" checked /><span></span>ZIP scores</label>
              <label class="toggle"><input type="checkbox" data-layer="infrastructure" checked /><span></span><i class="swatch" style="background:${GROUP_COLORS.infrastructure}"></i>Infrastructure & civic projects</label>
              <label class="toggle"><input type="checkbox" data-layer="housing" checked /><span></span><i class="swatch" style="background:${GROUP_COLORS.housing}"></i>New housing development</label>
              <label class="toggle"><input type="checkbox" data-layer="business" checked /><span></span><i class="swatch" style="background:${GROUP_COLORS.business}"></i>New stores & businesses</label>
              <label class="toggle"><input type="checkbox" data-layer="properties" checked /><span></span>Homes</label>
              <label class="toggle"><input type="checkbox" id="three-d" /><span></span>3D massing</label>
            </section>
          </div>

          <div class="tab-body" data-body="areas" hidden>
            <label class="select-row"><span>Shade ZIPs by</span><select id="area-metric">${Object.entries(AREA_METRICS).map(([key, item]) => `<option value="${key}" ${key === areaMetric ? 'selected' : ''}>${esc(item.label)}</option>`).join('')}</select></label>
            <p class="hint" id="area-metric-hint"></p>
            <ol class="area-list" id="area-list"></ol>
          </div>

          <div class="tab-body" data-body="projects" hidden>
            <div class="segmented small" id="project-filter">
              <button data-pfilter="major" class="active">Infrastructure</button><button data-pfilter="housing">New housing</button><button data-pfilter="business">New stores</button><button data-pfilter="all">All</button>
            </div>
            <ul class="project-list tall" id="project-list"></ul>
          </div>
        </aside>

        <div class="legend" id="legend" aria-live="polite"></div>

        <section class="drawer" id="drawer" aria-live="polite" aria-label="Details">
          <div class="drawer-bar"><button class="icon-button" id="drawer-back" aria-label="Back" hidden>←</button><span id="drawer-title"></span><button class="icon-button" id="drawer-close" aria-label="Close details">${ICONS.close}</button></div>
          <div class="drawer-body" id="drawer-body"></div>
        </section>

        <div class="modal" id="quality-modal" role="dialog" aria-modal="true" aria-labelledby="quality-title" hidden>
          <div class="modal-card">
            <button class="icon-button modal-close" aria-label="Close">${ICONS.close}</button>
            <div id="quality-content"></div>
          </div>
        </div>
        <button class="fab-reset icon-button" id="reset-view" title="Reset view" aria-label="Reset view">${ICONS.reset}</button>
      </main>`;
    this.bind();
  }

  freshness(manifest, live) {
    const parcels = manifest.sources.find((source) => source.id === 'parcels');
    const zhvi = manifest.sources.find((source) => source.id === 'zhvi');
    const built = Date.now() - Date.parse(manifest.generatedAt);
    const days = built / 86400000;
    const tone = days <= 8 ? 'fresh' : days <= 35 ? 'aging' : 'stale';
    return { tone, label: `${live.live ? 'Live listings · ' : ''}Data ${ago(manifest.generatedAt)} · values ${date(zhvi?.asOf, 'month')}`, parcels };
  }

  bind() {
    const search = this.$('#search'); const results = this.$('#search-results'); let timer;
    search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => this.emit({ type: 'search', query: search.value }), 120); });
    search.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { results.querySelector('button')?.click(); }
      if (event.key === 'Escape') { search.value = ''; this.showSearchResults([]); this.emit({ type: 'search', query: '' }); }
    });
    results.addEventListener('click', (event) => {
      const button = event.target.closest('button'); if (!button) return;
      this.showSearchResults([]);
      this.emit({ type: button.dataset.kind, id: button.dataset.id });
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === '/' && document.activeElement !== search) { event.preventDefault(); search.focus(); }
      if (event.key === 'Escape' && event.target !== search) { if (!this.$('#quality-modal').hidden) this.closeModal(); else this.emit({ type: 'closeDetail' }); }
    });
    document.addEventListener('click', (event) => { if (!event.target.closest('.search')) this.showSearchResults([]); });

    this.$$('[data-tab]').forEach((button) => button.addEventListener('click', () => this.showTab(button.dataset.tab)));
    this.$$('[data-status]').forEach((button) => button.addEventListener('click', () => {
      button.classList.toggle('on');
      this.emit({ type: 'statuses', statuses: this.$$('[data-status].on').map((item) => item.dataset.status) });
    }));
    this.$$('[data-color]').forEach((button) => button.addEventListener('click', () => {
      this.$$('[data-color]').forEach((item) => item.classList.toggle('active', item === button));
      this.emit({ type: 'colorMode', mode: button.dataset.color });
    }));
    this.$('#band-filter').addEventListener('change', (event) => this.emit({ type: 'filter', filters: { band: event.target.value } }));
    this.$('#verdict-filter').addEventListener('change', (event) => this.emit({ type: 'filter', filters: { verdict: event.target.value } }));
    this.$$('[data-layer]').forEach((input) => input.addEventListener('change', () => this.emit({ type: 'layer', layer: input.dataset.layer, visible: input.checked })));
    this.$('#three-d').addEventListener('change', (event) => this.emit({ type: '3d', enabled: event.target.checked }));
    this.$('#area-metric').addEventListener('change', (event) => this.emit({ type: 'areaMetric', metric: event.target.value }));
    this.$('#project-filter').addEventListener('click', (event) => {
      const button = event.target.closest('[data-pfilter]'); if (!button) return;
      this.$$('[data-pfilter]').forEach((item) => item.classList.toggle('active', item === button));
      this.emit({ type: 'projectFilter', filter: button.dataset.pfilter });
    });
    this.$('#theme-button').addEventListener('click', () => this.emit({ type: 'theme' }));
    this.$('#reset-view').addEventListener('click', () => this.emit({ type: 'reset' }));
    this.$('#quality-button').addEventListener('click', () => this.openModal());
    this.$('.modal-close').addEventListener('click', () => this.closeModal());
    this.$('#quality-modal').addEventListener('click', (event) => { if (event.target.id === 'quality-modal') this.closeModal(); });
    this.$('#drawer-close').addEventListener('click', () => this.emit({ type: 'closeDetail' }));
    this.$('#drawer-back').addEventListener('click', () => this.emit({ type: 'back' }));
    this.$('#panel-grip').addEventListener('click', () => this.$('#panel').classList.toggle('expanded'));
    // Delegated navigation from lists and detail views.
    this.root.addEventListener('click', (event) => {
      const zip = event.target.closest('[data-zip]'); const project = event.target.closest('[data-project]'); const property = event.target.closest('[data-property]');
      if (zip && !zip.closest('.search-results')) this.emit({ type: 'selectArea', id: zip.dataset.zip });
      else if (project && !project.closest('.search-results')) this.emit({ type: 'selectProject', id: project.dataset.project });
      else if (property && !property.closest('.search-results')) this.emit({ type: 'selectProperty', id: property.dataset.property });
    });
  }

  showTab(tab) {
    this.state.tab = tab;
    this.$$('[data-tab]').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
    this.$$('[data-body]').forEach((body) => { body.hidden = body.dataset.body !== tab; });
    this.emit({ type: 'tab', tab });
  }

  setReady() { this.$('.shell').classList.add('ready'); }
  setThemeIcon(theme) { this.$('#theme-button').innerHTML = theme === 'dark' ? ICONS.sun : ICONS.moon; }

  // ------------------------------------------------------------ explore tab
  renderRegion(region) {
    this.$('#region-kpis').innerHTML = `
      <div><span>Typical value</span><strong>${money(region.medianValue, true)}</strong></div>
      <div><span>1-yr change</span><strong class="${region.yoyPct >= 0 ? 'up' : 'down'}">${pct(region.yoyPct)}</strong></div>
      <div><span>12-mo outlook</span><strong class="${region.forecastPct >= 0 ? 'up' : 'down'}">${pct(region.forecastPct)}</strong></div>`;
  }

  renderView(view, { offMarketHint }) {
    for (const status of STATUS_ORDER) { const badge = this.$(`[data-count="${status}"]`); if (badge) badge.textContent = num(view.counts[status] || 0); }
    this.$('#offmarket-hint').hidden = !offMarketHint;
    const s = view.summary;
    const top = view.records.filter((record) => record.status === 'for-sale' || record.status === 'pending').sort((a, b) => (b.signal ?? 0) - (a.signal ?? 0)).slice(0, 4);
    this.$('#summary').innerHTML = `
      <div class="summary-grid">
        <div><span>Homes shown</span><strong>${num(s.count)}</strong></div>
        <div><span>Median sale</span><strong>${money(s.medianSale, true)}</strong></div>
        <div><span>Median resale gain</span><strong class="${s.medianResaleAnnual >= 0 ? 'up' : 'down'}">${Number.isFinite(s.medianResaleAnnual) ? `${pct(s.medianResaleAnnual)}/yr` : '—'}</strong></div>
      </div>
      ${top.length ? `<h4>Top listing signals</h4><ul class="mini-list">${top.map((record) => `<li><button data-property="${esc(record.id)}"><i style="background:${VERDICT_COLORS[record.deal?.key] || VERDICT_COLORS.neutral}"></i><span>${esc(record.address)}<small>${money(record.price, true)} · ${esc(record.deal?.label || '')}</small></span><b>${num(record.signal)}</b></button></li>`).join('')}</ul>` : ''}`;
  }

  // ------------------------------------------------------------ areas tab
  renderAreas(areas, metric) {
    const definition = AREA_METRICS[metric];
    this.$('#area-metric-hint').textContent = definition.description;
    this.$('#area-list').innerHTML = areas.map((area, index) => {
      const value = metric === 'score' ? area.score?.total : area.metrics[metric];
      const verdict = area.score?.verdict;
      return `<li><button data-zip="${esc(area.zip)}">
        <span class="rank">${index + 1}</span>
        <span class="area-name">${esc(area.zip)} <small>${esc(area.city || '')}</small></span>
        <span class="chip verdict small" style="--chip:${VERDICT_COLORS[verdict?.key] || VERDICT_COLORS.limited}">${esc(verdict?.label || '')}</span>
        <strong>${esc(formatMetric(value, definition.format))}</strong>
      </button></li>`;
    }).join('');
  }

  // ------------------------------------------------------------ projects tab
  renderProjects(projects) {
    const detail = (project) => {
      if (project.category === 'business') return [project.subtype, project.stageLabel, project.openedAt ? `opened ${date(project.openedAt, 'month')}` : project.permittedAt ? `permitted ${date(project.permittedAt, 'month')}` : null];
      if (project.category === 'multifamily') return [project.units ? `${num(project.units)} units` : null, project.stageLabel];
      if (project.category === 'subdivision' || project.category === 'industrial') return [project.acres ? `${num(project.acres)} acres` : null, `recorded ${date(project.recordedAt, 'month')}`];
      return [project.categoryLabel, project.stageLabel, project.expectedYear && project.stage !== 'complete' ? `~${Math.round(project.expectedYear)}` : null];
    };
    this.$('#project-list').innerHTML = projects.slice(0, 250).map((project) => `<li><button data-project="${esc(project.id)}">
      <i style="background:${GROUP_COLORS[project.group] || GROUP_COLORS.infrastructure}"></i>
      <span>${esc(project.name)}<small>${esc(detail(project).filter(Boolean).join(' · '))}</small></span>
      <b>${project.weightedPeak >= 0 ? '+' : ''}${project.weightedPeak.toFixed(1)}</b></button></li>`).join('') || '<li class="muted">No projects match.</li>';
  }

  // ------------------------------------------------------------ search
  showSearchResults(items) {
    const results = this.$('#search-results');
    results.hidden = !items.length;
    results.innerHTML = items.map((item) => `<button role="option" data-kind="${item.kind}" data-id="${esc(item.id)}"><span class="kind">${esc(item.label)}</span><span>${esc(item.title)}<small>${esc(item.subtitle || '')}</small></span></button>`).join('');
  }

  // ------------------------------------------------------------ legend
  renderLegend({ colorMode, areaMetric, layers }) {
    const area = AREA_METRICS[areaMetric];
    const homeScale = colorMode === 'price'
      ? { colors: ['#d9e2f5', '#a9bbec', '#7b93dc', '#5569c2', '#343f94'], left: '$150k', right: '$1.1M' }
      : colorMode === 'deal' ? { colors: DIVERGING, left: 'Weak', right: 'Strong' } : { colors: DIVERGING, left: 'Falling · above value', right: 'Rising · below value' };
    this.$('#legend').innerHTML = `
      ${layers.properties ? `<div class="legend-row"><span class="legend-title">Homes · ${esc(COLOR_MODES[colorMode].label)}</span><div class="legend-scale" style="background:${gradient(homeScale.colors)}"></div><div class="legend-ends"><span>${esc(homeScale.left)}</span><span>${esc(homeScale.right)}</span></div></div>` : ''}
      ${layers.areas ? `<div class="legend-row"><span class="legend-title">ZIPs · ${esc(area.label)}</span><div class="legend-scale" style="background:${gradient(area.stops.map(([, index]) => DIVERGING[index]))}"></div><div class="legend-ends"><span>${esc(formatMetric(area.stops[0][0], area.format))}</span><span>${esc(formatMetric(area.stops.at(-1)[0], area.format))}</span></div></div>` : ''}
      <div class="legend-row inline">${[['infrastructure', 'Infrastructure'], ['housing', 'New housing'], ['business', 'New stores']].filter(([key]) => layers[key]).map(([key, label]) => `<span><i style="background:${GROUP_COLORS[key]}"></i>${label}</span>`).join('')}${layers.properties ? '<span><i class="ring"></i>Listing</span>' : ''}</div>`;
  }

  // ------------------------------------------------------------ drawer
  openDrawer(title, html, { canGoBack = false } = {}) {
    this.$('#drawer-title').textContent = title;
    this.$('#drawer-body').innerHTML = html;
    this.$('#drawer-body').scrollTop = 0;
    this.$('#drawer-back').hidden = !canGoBack;
    this.$('#drawer').classList.add('open');
    document.body.classList.add('drawer-open');
  }

  closeDrawer() { this.$('#drawer').classList.remove('open'); document.body.classList.remove('drawer-open'); }

  // ------------------------------------------------------------ data quality
  openModal() { this.$('#quality-content').innerHTML = this.qualityReport(this.manifest); this.$('#quality-modal').hidden = false; this.$('.modal-close').focus(); }
  closeModal() { this.$('#quality-modal').hidden = true; }

  qualityReport(manifest) {
    const q = manifest.quality; const v = q.valuation; const a = q.areaModel;
    const sourceRows = manifest.sources.map((source) => {
      const stamp = source.newestRecordAt || source.asOf || source.fetchedAt;
      const isDate = stamp && /^\d{4}-\d{2}(-\d{2})?/.test(stamp);
      const age = isDate ? (Date.now() - Date.parse(stamp.length === 7 ? `${stamp}-15` : stamp)) / 86400000 : null;
      // Structural sources (boundaries, census vintages) are not expected to be recent.
      const tone = source.status === 'not-configured' ? 'off' : !isDate ? 'fresh' : age <= 45 ? 'fresh' : age <= 150 ? 'aging' : 'stale';
      const label = source.status === 'not-configured' ? 'Not configured' : !stamp ? '—' : !isDate ? stamp : stamp.length === 7 ? date(stamp, 'month') : date(stamp.slice(0, 10));
      return `<tr><td><i class="dot ${tone}"></i>${esc(source.name)}</td><td>${esc(label)}</td><td>${num(source.records)}</td></tr>`;
    }).join('');
    const methodRows = Object.entries(v.byMethod || {}).filter(([method]) => method !== 'combined' && v.byMethod[method].sampleSize >= 5)
      .map(([method, stats]) => `<tr><td>${esc(method)}</td><td>${num(stats.sampleSize)}</td><td>${pct(stats.medianErrorPct, 1, false)}</td><td>${pct(stats.within10Pct, 0, false)}</td><td>${pct(stats.biasPct)}</td></tr>`).join('');
    const periods = (a.periods || []).map((period) => `<tr><td>${esc(date(period.asOf, 'month'))}</td><td>${num(period.zips)}</td><td>${num(period.rankCorrelation, 2)}</td><td>${pct(period.topThirdForwardPct)}</td><td>${pct(period.bottomThirdForwardPct)}</td></tr>`).join('');
    return `
      <span class="eyebrow">DATA & ACCURACY</span><h2 id="quality-title">What the map can prove</h2>
      <p class="muted">Pipeline run ${esc(date(manifest.generatedAt))} (${esc(ago(manifest.generatedAt))}) · ${num(manifest.region.zips)} ZIPs · ${num(manifest.counts.sold)} recorded sales · ${num(manifest.counts.offMarket)} off-market homes · ${num(manifest.counts.projects)} projects.</p>

      <h3>Sources</h3>
      <div class="table-wrap"><table><thead><tr><th>Source</th><th>Newest data</th><th>Records</th></tr></thead><tbody>${sourceRows}</tbody></table></div>
      ${q.activeInventory.live ? '' : `<p class="note warn">On-market inventory is a small saved snapshot (${num(q.activeInventory.records)} listings, ${esc(date(q.activeInventory.newestRecordAt))}). Add a RentCast key (see README) or drop a Redfin CSV export into <code>pipeline/inbox/</code> to refresh listings.</p>`}

      <h3>Valuation accuracy <small>out-of-sample</small></h3>
      <p class="muted">${esc(v.method)}. Each sale is predicted only from information recorded before it.</p>
      <div class="kpi-row">
        <div><span>Median error</span><strong>${pct(v.medianErrorPct, 1, false)}</strong></div>
        <div><span>Within 10%</span><strong>${pct(v.within10Pct, 0, false)}</strong></div>
        <div><span>Within 20%</span><strong>${pct(v.within20Pct, 0, false)}</strong></div>
        <div><span>Sales tested</span><strong>${num(v.sampleSize)}</strong></div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Method</th><th>n</th><th>Median err.</th><th>≤10%</th><th>Bias</th></tr></thead><tbody>${methodRows}</tbody></table></div>
      <p class="note">${num(v.unvalued)} test homes (${pct(100 - v.coveragePct, 0, false)}) were left unvalued, mostly new builds whose assessment predates construction. The model reports "insufficient data" instead of guessing.</p>

      <h3>Does the area score predict anything? <small>backtest</small></h3>
      <p class="muted">${esc(a.method || '')}. Positive correlation means higher-scored ZIPs went on to appreciate more.</p>
      <div class="kpi-row">
        <div><span>Mean rank correlation</span><strong>${num(a.meanRankCorrelation, 2)}</strong></div>
        <div><span>Top vs bottom third</span><strong>${pct(a.meanSpreadPct)}</strong></div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Scored as of</th><th>ZIPs</th><th>Rank corr.</th><th>Top ⅓ next 12 mo</th><th>Bottom ⅓</th></tr></thead><tbody>${periods}</tbody></table></div>
      <p class="note">Only the price-based parts of the score can be rebuilt historically. Demand, project and census inputs are current-only and untested. Past relationships can break.</p>

      <h3>Record completeness</h3>
      <div class="bars">${Object.entries(q.completeness).map(([field, value]) => `<div><span>${esc(field)}</span><div class="bar"><i style="width:${value}%"></i></div><b>${num(value)}%</b></div>`).join('')}</div>
      <p class="note">Planned-project catalysts last reviewed ${esc(date(q.catalystsReviewedAt))}. Project lifts are transparent scenario weights (category × stage probability × timing × distance), not appraisals.</p>`;
  }
}
