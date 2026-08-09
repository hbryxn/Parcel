import { MARKET_MODES, money, number, PRICE_BANDS } from '../config.js';

const ARCHITECTURE = {
  feeds: { eyebrow: '01 · ADAPT', title: 'Independent feed adapters', body: 'Sold and active sources have separate adapters. Both normalize into one Listing contract, so adding MLS or permitting data does not change the map.', artifact: 'src/data/adapters/*' },
  domain: { eyebrow: '02 · NORMALIZE', title: 'Shared listing contract', body: 'A listing always has a mode, price kind, event date, trend and coordinates. This is the stable language every other module understands.', artifact: 'src/domain/listing.js' },
  model: { eyebrow: '03 · REASON', title: 'Mode-aware market service', body: 'Queries, medians and ZIP signals operate only on the selected mode. Asking prices never leak into sold-price summaries.', artifact: 'src/analytics/marketService.js' },
  map: { eyebrow: '04 · PROJECT', title: 'Replaceable map layers', body: 'Listing, project and context-building layers are separate classes. Listing points are projected into 3D footprint polygons before MapLibre sees them.', artifact: 'src/map/layers/*' },
  ui: { eyebrow: '05 · ORCHESTRATE', title: 'One-way application flow', body: 'The dashboard emits user intent. The controller updates the market service, then sends a view model to the UI and the map—no circular dependencies.', artifact: 'src/application/marketController.js' },
};

export class Dashboard {
  constructor(root) { this.root = root; this.intentHandler = () => {}; }

  render(view) {
    this.root.innerHTML = `
      <main class="shell">
        <div id="map" aria-label="3D map of Savannah-area real-estate activity"></div>
        <header class="topbar">
          <a class="brand" href="#" aria-label="Parcel home"><span class="brand-mark">P</span><span>PARCEL</span><small>SPATIAL INTELLIGENCE</small></a>
          <div class="search-wrap"><span>⌕</span><input id="search" type="search" placeholder="Search an address, city or ZIP" aria-label="Search listings" /><kbd>⌘ K</kbd></div>
          <button class="learn-button" id="learn-button"><span>◎</span> Learn the system</button>
        </header>

        <aside class="control-card glass" aria-label="Map controls">
          <div class="card-heading"><div><span class="eyebrow">MARKET LENS</span><h1>Savannah region</h1></div><button class="icon-button" id="reset-view" title="Reset map view">↗</button></div>
          <div class="mode-toggle" role="group" aria-label="Listing mode"><button class="active" data-mode="sold">Sold</button><button data-mode="for-sale">For sale</button></div>
          <p class="as-of" id="as-of-copy"></p>
          <div class="segmented" role="group" aria-label="Price filter">
            <button class="active" data-band="all">All</button>${PRICE_BANDS.map((band, index) => `<button data-band="${index}">${['Entry','Mid','High','Prime'][index]}</button>`).join('')}
          </div>
          <label class="select-label">PROPERTY TYPE<select id="type-filter"><option value="all">All residential</option><option value="single family">Single family</option><option value="condo">Condo</option><option value="townhouse">Townhouse</option></select></label>
          <div class="divider"></div>
          <label class="switch-row"><span><i class="legend-building up"></i>Property buildings</span><input type="checkbox" data-layer="listings" checked /><b></b></label>
          <label class="switch-row"><span><i class="legend-dot project"></i>Planned projects</span><input type="checkbox" data-layer="projects" checked /><b></b></label>
          <div class="trend-key"><span><i class="trend-up"></i>Increasing</span><span><i class="trend-down"></i>Decreasing</span></div>
          <label class="switch-row impact"><span><em>AI</em>Project impact scenario<small>Distance-weighted uplift</small></span><input id="impact-toggle" type="checkbox" checked /><b></b></label>
        </aside>

        <aside class="signal-card glass" aria-label="Market signal summary">
          <div class="signal-head"><div><span class="eyebrow">AI MARKET SIGNAL</span><span class="live-dot">MODE-AWARE</span></div><strong id="signal-score"></strong></div>
          <div class="meter"><i id="signal-meter"></i></div><p id="signal-copy"></p>
          <div class="summary-grid"><div><span id="price-label"></span><strong id="median-price"></strong></div><div><span>MEDIAN $ / FT²</span><strong id="median-ppsf"></strong></div><div><span id="count-label"></span><strong id="visible-count"></strong></div></div>
          <div class="zip-heading"><span>ZIP COVERAGE</span><small>select to focus</small></div><div class="zip-list" id="zip-list"></div>
          <p class="disclaimer">Green/red footprints show modeled increase/decrease. Active data is a dated market snapshot; verify availability with the source.</p>
        </aside>

        <div class="building-legend glass"><span>3D BUILDING SIGNAL</span><i class="up"></i><small>increase</small><i class="down"></i><small>decrease</small><small class="zoom-note">zoom in to inspect</small></div>
        <section class="detail-drawer" id="detail-drawer" aria-live="polite"><button class="drawer-close" aria-label="Close details">×</button><div id="detail-content"></div></section>

        <section class="architecture-panel" id="architecture-panel" aria-label="Interactive architecture guide">
          <div class="architecture-top"><div><span class="eyebrow">INTERACTIVE BLUEPRINT</span><h2>How the expansion stays modular</h2><p>Pick a module to trace sold and for-sale data from source to building.</p></div><button class="architecture-close" aria-label="Close architecture guide">×</button></div>
          <div class="architecture-flow five" role="tablist">
            ${Object.entries(ARCHITECTURE).map(([key, lesson], index) => `${index ? '<i>→</i>' : ''}<button class="${index ? '' : 'active'}" data-module="${key}"><span>0${index + 1}</span><b>${lesson.title.toUpperCase()}</b><small>${lesson.eyebrow.split(' · ')[1]}</small></button>`).join('')}
          </div>
          <div class="architecture-lesson"><span id="lesson-eyebrow">${ARCHITECTURE.feeds.eyebrow}</span><div><h3 id="lesson-title">${ARCHITECTURE.feeds.title}</h3><p id="lesson-body">${ARCHITECTURE.feeds.body}</p></div><code id="lesson-artifact">${ARCHITECTURE.feeds.artifact}</code></div>
          <div class="architecture-note"><strong>WHY THIS MATTERS</strong><span>A future MLS adapter can replace the dated active snapshot while keeping every market, map, and UI module unchanged.</span></div>
        </section><div class="scrim" id="scrim"></div>
      </main>`;
    this.bindUI(); this.renderView(view);
  }

  onIntent(handler) { this.intentHandler = handler; }
  emit(intent) { this.intentHandler(intent); }

  bindUI() {
    const search = this.root.querySelector('#search'); let searchTimer;
    search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => this.emit({ type: 'filter', filters: { query: search.value } }), 160); });
    document.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); search.focus(); } if (event.key === 'Escape') this.closePanels(); });
    this.root.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => {
      this.root.querySelectorAll('[data-mode]').forEach((item) => item.classList.toggle('active', item === button)); search.value = ''; this.emit({ type: 'mode', mode: button.dataset.mode });
    }));
    this.root.querySelectorAll('[data-band]').forEach((button) => button.addEventListener('click', () => {
      this.root.querySelectorAll('[data-band]').forEach((item) => item.classList.toggle('active', item === button)); this.emit({ type: 'filter', filters: { band: button.dataset.band } });
    }));
    this.root.querySelector('#type-filter').addEventListener('change', (event) => this.emit({ type: 'filter', filters: { type: event.target.value } }));
    this.root.querySelectorAll('[data-layer]').forEach((input) => input.addEventListener('change', () => this.emit({ type: 'visibility', layer: input.dataset.layer, visible: input.checked })));
    this.root.querySelector('#impact-toggle').addEventListener('change', (event) => this.emit({ type: 'impact', enabled: event.target.checked }));
    this.root.querySelector('#reset-view').addEventListener('click', () => this.emit({ type: 'reset' }));
    this.root.querySelector('#zip-list').addEventListener('click', (event) => { const button = event.target.closest('[data-zip]'); if (button) { search.value = button.dataset.zip; this.emit({ type: 'filter', filters: { query: button.dataset.zip } }); } });
    this.root.querySelector('#learn-button').addEventListener('click', () => this.openArchitecture());
    this.root.querySelector('.architecture-close').addEventListener('click', () => this.closePanels());
    this.root.querySelector('.drawer-close').addEventListener('click', () => this.root.querySelector('#detail-drawer').classList.remove('open'));
    this.root.querySelector('#scrim').addEventListener('click', () => this.closePanels());
    this.root.querySelectorAll('[data-module]').forEach((button) => button.addEventListener('click', () => this.showLesson(button.dataset.module)));
  }

  setReady() { this.root.querySelector('.shell').classList.add('ready'); }

  renderView(view) {
    const labels = MARKET_MODES[view.mode]; const { summary } = view;
    this.root.querySelector('#as-of-copy').textContent = `${number(summary.count)} ${labels.countLabel.toLowerCase()} · ${view.totalZipCount} ZIPs visible`;
    this.root.querySelector('#signal-score').innerHTML = `${summary.signal}<small>/100</small>`;
    this.root.querySelector('#signal-meter').style.width = `${summary.signal}%`;
    this.root.querySelector('#signal-copy').innerHTML = `${labels.label} momentum is <strong>${summary.signal >= 65 ? 'constructive' : summary.signal < 50 ? 'softening' : 'balanced'}</strong> across the current selection.`;
    this.root.querySelector('#price-label').textContent = labels.priceLabel.toUpperCase(); this.root.querySelector('#count-label').textContent = labels.countLabel.toUpperCase();
    this.root.querySelector('#median-price').textContent = money(summary.medianPrice, true); this.root.querySelector('#median-ppsf').textContent = money(summary.medianPpsf); this.root.querySelector('#visible-count').textContent = number(summary.count);
    this.root.querySelector('#zip-list').innerHTML = view.zipSignals.map((item) => `<button data-zip="${item.zip}"><span>ZIP ${item.zip}<small>${item.count} ${view.mode === 'sold' ? 'sales' : 'active'} · ${money(item.median, true)} median</small></span><strong class="${item.trend < 0 ? 'negative' : ''}">${item.trend >= 0 ? '+' : ''}${item.trend.toFixed(1)}%</strong></button>`).join('');
  }

  showListing(props, mode) {
    const currentMode = props.mode || mode; const labels = MARKET_MODES[currentMode]; const score = Number(props.score || 0); const impact = Number(props.projectImpact || 0);
    this.openDrawer(`<div class="detail-badge">${currentMode === 'sold' ? 'RECORDED SALE' : 'ACTIVE LISTING'} · ZIP ${props.zip}</div><h2>${props.address}</h2><p class="detail-sub">${props.type} · ${labels.dateLabel} ${props.eventDate || 'date unavailable'}</p>
      <div class="detail-metrics"><div><span>${currentMode === 'sold' ? 'SALE PRICE' : 'ASKING PRICE'}</span><strong>${money(Number(props.price))}</strong></div><div><span>PRICE / FT²</span><strong>${money(Number(props.pricePerSqft))}</strong></div><div><span>MODELED SIGNAL</span><strong class="${score < 0 ? 'negative' : 'positive'}">${score >= 0 ? '+' : ''}${score.toFixed(1)}%</strong></div></div>
      <p class="intel"><span>AI BRIEF · ${String(props.footprintPrecision || 'modeled footprint').toUpperCase()}</span>This building is highlighted <b>${score >= 0 ? 'green for increasing' : 'red for decreasing'}</b> modeled momentum.${impact > .1 ? ` Planned projects add ${impact.toFixed(1)} points based on proximity.` : ''}</p>
      <div class="property-facts"><span>${props.beds || '—'} beds</span><span>${props.baths || '—'} baths</span><span>${number(Number(props.sqft))} ft²</span></div>${props.sourceUrl ? `<a class="source-link" href="${props.sourceUrl}" target="_blank" rel="noreferrer">Verify source ↗</a>` : ''}`);
  }

  showProject(props) { this.openDrawer(`<div class="detail-badge project-badge">PLANNED PROJECT · ${props.status}</div><h2>${props.name}</h2><p class="detail-sub">${props.type} · ${props.phase}</p><div class="detail-metrics"><div><span>SCENARIO RADIUS</span><strong>${Number(props.radiusMiles).toFixed(1)} mi</strong></div><div><span>MAX MODELED LIFT</span><strong class="positive">+${Number(props.modeledLift).toFixed(1)} pts</strong></div><div><span>SOURCE</span><strong>${props.source}</strong></div></div><p class="intel"><span>PROJECT BRIEF</span>${props.summary}</p><a class="source-link" href="${props.sourceUrl}" target="_blank" rel="noreferrer">View public source ↗</a>`); }
  openDrawer(content) { this.root.querySelector('#detail-content').innerHTML = content; this.root.querySelector('#detail-drawer').classList.add('open'); }
  openArchitecture() { this.root.querySelector('#architecture-panel').classList.add('open'); this.root.querySelector('#scrim').classList.add('open'); }
  closePanels() { this.root.querySelector('#architecture-panel').classList.remove('open'); this.root.querySelector('#detail-drawer').classList.remove('open'); this.root.querySelector('#scrim').classList.remove('open'); }
  showLesson(key) { const lesson = ARCHITECTURE[key]; this.root.querySelectorAll('[data-module]').forEach((button) => button.classList.toggle('active', button.dataset.module === key)); this.root.querySelector('#lesson-eyebrow').textContent = lesson.eyebrow; this.root.querySelector('#lesson-title').textContent = lesson.title; this.root.querySelector('#lesson-body').textContent = lesson.body; this.root.querySelector('#lesson-artifact').textContent = lesson.artifact; }
}
