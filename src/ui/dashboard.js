import { money, number, PRICE_BANDS } from '../config.js';

const ARCHITECTURE = {
  feeds: { eyebrow: '01 · INPUT', title: 'Data adapters', body: 'Every source is translated into one stable property or project shape. Swap the bundled JSON for MLS, parcel, permitting, or planning feeds without touching the map.', artifact: 'src/data/*Repository.js' },
  model: { eyebrow: '02 · REASON', title: 'Market model', body: 'The analysis layer calculates medians, ZIP signals and a transparent proximity-weighted project scenario. A production AI model can replace this class behind the same interface.', artifact: 'src/analytics/marketModel.js' },
  map: { eyebrow: '03 · SEE', title: 'Spatial experience', body: 'MapLibre owns camera, clustering and 3D layers. It only receives GeoJSON, so it never needs to know where the data came from or how the score was made.', artifact: 'src/map/mapExperience.js' },
  ui: { eyebrow: '04 · DECIDE', title: 'Decision interface', body: 'Filters, property briefs and this learning mode are presentation-only. They call the model and map through small public methods instead of reaching into their internals.', artifact: 'src/ui/dashboard.js' },
};

export class Dashboard {
  constructor(root, market) { this.root = root; this.market = market; this.mapExperience = null; }

  render() {
    const summary = this.market.summary();
    this.root.innerHTML = `
      <main class="shell">
        <div id="map" aria-label="3D map of Savannah real-estate activity"></div>
        <header class="topbar">
          <a class="brand" href="#" aria-label="Parcel home"><span class="brand-mark">P</span><span>PARCEL</span><small>SPATIAL INTELLIGENCE</small></a>
          <div class="search-wrap"><span>⌕</span><input id="search" type="search" placeholder="Search an address or ZIP" aria-label="Search properties" /><kbd>⌘ K</kbd></div>
          <button class="learn-button" id="learn-button"><span>◎</span> Learn the system</button>
        </header>

        <aside class="control-card glass" aria-label="Map controls">
          <div class="card-heading"><div><span class="eyebrow">MARKET LENS</span><h1>Savannah, GA</h1></div><button class="icon-button" id="reset-view" title="Reset map view">↗</button></div>
          <p class="as-of">${number(summary.count)} verified sales · scenario model</p>
          <div class="segmented" role="group" aria-label="Price filter">
            <button class="active" data-band="all">All</button>${PRICE_BANDS.map((band, index) => `<button data-band="${index}">${band.label.replace('$250–500k', 'Mid').replace('$500–800k', 'High').replace('< $250k', 'Entry').replace('$800k+', 'Prime')}</button>`).join('')}
          </div>
          <label class="select-label">PROPERTY TYPE<select id="type-filter"><option value="all">All residential</option><option value="single family">Single family</option><option value="condo">Condo</option><option value="townhouse">Townhouse</option></select></label>
          <div class="divider"></div>
          <label class="switch-row"><span><i class="legend-dot property"></i>Property sales</span><input type="checkbox" data-layer="properties" checked /><b></b></label>
          <label class="switch-row"><span><i class="legend-dot project"></i>Planned projects</span><input type="checkbox" data-layer="projects" checked /><b></b></label>
          <label class="switch-row impact"><span><em>AI</em>Project impact scenario<small>Distance-weighted uplift</small></span><input id="impact-toggle" type="checkbox" checked /><b></b></label>
        </aside>

        <aside class="signal-card glass" aria-label="Market signal summary">
          <div class="signal-head"><div><span class="eyebrow">AI MARKET SIGNAL</span><span class="live-dot">LIVE MODEL</span></div><strong id="signal-score">${summary.signal}<small>/100</small></strong></div>
          <div class="meter"><i id="signal-meter" style="width:${summary.signal}%"></i></div>
          <p id="signal-copy">Momentum is <strong>${summary.signal >= 65 ? 'constructive' : 'balanced'}</strong> across the current selection.</p>
          <div class="summary-grid"><div><span>MEDIAN SALE</span><strong id="median-price">${money(summary.medianPrice, true)}</strong></div><div><span>MEDIAN $ / FT²</span><strong id="median-ppsf">${money(summary.medianPpsf)}</strong></div><div><span>VISIBLE SALES</span><strong id="visible-count">${number(summary.count)}</strong></div></div>
          <div class="zip-heading"><span>LEADING ZIP SIGNALS</span><small>modeled trend</small></div>
          <div class="zip-list">${this.market.zipSignals().map((item) => `<button data-zip="${item.zip}"><span>ZIP ${item.zip}<small>${item.count} sales · ${money(item.median, true)} median</small></span><strong>+${item.trend.toFixed(1)}%</strong></button>`).join('')}</div>
          <p class="disclaimer">Scenario output is directional, not an appraisal or investment advice.</p>
        </aside>

        <div class="price-legend glass"><span>SALE PRICE</span>${PRICE_BANDS.map((band) => `<i style="--color:${band.color}"></i><small>${band.label}</small>`).join('')}</div>

        <section class="detail-drawer" id="detail-drawer" aria-live="polite">
          <button class="drawer-close" aria-label="Close details">×</button><div id="detail-content"></div>
        </section>

        <section class="architecture-panel" id="architecture-panel" aria-label="Interactive architecture guide">
          <div class="architecture-top"><div><span class="eyebrow">INTERACTIVE BLUEPRINT</span><h2>How Parcel thinks</h2><p>Pick a module to trace one decision from source to screen.</p></div><button class="architecture-close" aria-label="Close architecture guide">×</button></div>
          <div class="architecture-flow" role="tablist">
            <button class="active" data-module="feeds"><span>01</span><b>DATA FEEDS</b><small>Properties + projects</small></button><i>→</i>
            <button data-module="model"><span>02</span><b>MARKET MODEL</b><small>Signals + scenarios</small></button><i>→</i>
            <button data-module="map"><span>03</span><b>3D MAP</b><small>Layers + interactions</small></button><i>→</i>
            <button data-module="ui"><span>04</span><b>DECISION UI</b><small>Filters + briefs</small></button>
          </div>
          <div class="architecture-lesson"><span id="lesson-eyebrow">${ARCHITECTURE.feeds.eyebrow}</span><div><h3 id="lesson-title">${ARCHITECTURE.feeds.title}</h3><p id="lesson-body">${ARCHITECTURE.feeds.body}</p></div><code id="lesson-artifact">${ARCHITECTURE.feeds.artifact}</code></div>
          <div class="architecture-note"><strong>YOUR NEXT MODULE</strong><span>Add a permitting feed by implementing <code>load()</code> and returning the shared project shape. The rest of the app keeps working.</span></div>
        </section>
        <div class="scrim" id="scrim"></div>
      </main>`;
    this.bindUI();
  }

  connect(mapExperience) { this.mapExperience = mapExperience; }

  bindUI() {
    const search = this.root.querySelector('#search');
    let searchTimer;
    search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => this.mapExperience?.updateFilters({ query: search.value }), 160); });
    document.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); search.focus(); }
      if (event.key === 'Escape') this.closePanels();
    });
    this.root.querySelectorAll('[data-band]').forEach((button) => button.addEventListener('click', () => {
      this.root.querySelectorAll('[data-band]').forEach((item) => item.classList.remove('active'));
      button.classList.add('active'); this.mapExperience?.updateFilters({ band: button.dataset.band });
    }));
    this.root.querySelector('#type-filter').addEventListener('change', (event) => this.mapExperience?.updateFilters({ type: event.target.value }));
    this.root.querySelectorAll('[data-layer]').forEach((input) => input.addEventListener('change', () => this.mapExperience?.setLayerVisible(input.dataset.layer, input.checked)));
    this.root.querySelector('#impact-toggle').addEventListener('change', (event) => this.mapExperience?.setImpact(event.target.checked));
    this.root.querySelector('#reset-view').addEventListener('click', () => this.mapExperience?.resetView());
    this.root.querySelectorAll('[data-zip]').forEach((button) => button.addEventListener('click', () => { search.value = button.dataset.zip; this.mapExperience?.updateFilters({ query: button.dataset.zip }); }));
    this.root.querySelector('#learn-button').addEventListener('click', () => this.openArchitecture());
    this.root.querySelector('.architecture-close').addEventListener('click', () => this.closePanels());
    this.root.querySelector('.drawer-close').addEventListener('click', () => this.root.querySelector('#detail-drawer').classList.remove('open'));
    this.root.querySelector('#scrim').addEventListener('click', () => this.closePanels());
    this.root.querySelectorAll('[data-module]').forEach((button) => button.addEventListener('click', () => this.showLesson(button.dataset.module)));
  }

  setReady() { this.root.querySelector('.shell').classList.add('ready'); }

  updateSummary(records) {
    const summary = this.market.summary(records);
    this.root.querySelector('#signal-score').innerHTML = `${summary.signal}<small>/100</small>`;
    this.root.querySelector('#signal-meter').style.width = `${summary.signal}%`;
    this.root.querySelector('#median-price').textContent = money(summary.medianPrice, true);
    this.root.querySelector('#median-ppsf').textContent = money(summary.medianPpsf);
    this.root.querySelector('#visible-count').textContent = number(summary.count);
  }

  showProperty(props) {
    const impact = Number(props.projectImpact || 0);
    const score = Number(props.score || 0);
    this.openDrawer(`
      <div class="detail-badge">RECORDED SALE · ZIP ${props.zip}</div><h2>${props.address}</h2><p class="detail-sub">${props.type} · Sold ${props.soldDate || 'date unavailable'}</p>
      <div class="detail-metrics"><div><span>SALE PRICE</span><strong>${money(Number(props.price))}</strong></div><div><span>PRICE / FT²</span><strong>${money(Number(props.pricePerSqft))}</strong></div><div><span>MODELED SIGNAL</span><strong class="positive">${score >= 0 ? '+' : ''}${score.toFixed(1)}%</strong></div></div>
      <p class="intel"><span>AI BRIEF</span>${props.insight}${impact > 0.1 ? ` The active-project scenario contributes a modeled <b>+${impact.toFixed(1)} pts</b> based on proximity.` : ''}</p>
      <div class="property-facts"><span>${props.beds || '—'} beds</span><span>${props.baths || '—'} baths</span><span>${number(Number(props.sqft))} ft²</span><span>${number(Number(props.lotSize))} ft² lot</span></div>`);
  }

  showProject(props) {
    this.openDrawer(`
      <div class="detail-badge project-badge">PLANNED PROJECT · ${props.status}</div><h2>${props.name}</h2><p class="detail-sub">${props.type} · ${props.phase}</p>
      <div class="detail-metrics"><div><span>SCENARIO RADIUS</span><strong>${Number(props.radiusMiles).toFixed(1)} mi</strong></div><div><span>MAX MODELED LIFT</span><strong class="positive">+${Number(props.modeledLift).toFixed(1)} pts</strong></div><div><span>SOURCE</span><strong>${props.source}</strong></div></div>
      <p class="intel"><span>PROJECT BRIEF</span>${props.summary}</p><a class="source-link" href="${props.sourceUrl}" target="_blank" rel="noreferrer">View public source ↗</a>`);
  }

  openDrawer(content) { this.root.querySelector('#detail-content').innerHTML = content; this.root.querySelector('#detail-drawer').classList.add('open'); }
  openArchitecture() { this.root.querySelector('#architecture-panel').classList.add('open'); this.root.querySelector('#scrim').classList.add('open'); }
  closePanels() { this.root.querySelector('#architecture-panel').classList.remove('open'); this.root.querySelector('#detail-drawer').classList.remove('open'); this.root.querySelector('#scrim').classList.remove('open'); }
  showLesson(key) {
    const lesson = ARCHITECTURE[key];
    this.root.querySelectorAll('[data-module]').forEach((button) => button.classList.toggle('active', button.dataset.module === key));
    this.root.querySelector('#lesson-eyebrow').textContent = lesson.eyebrow;
    this.root.querySelector('#lesson-title').textContent = lesson.title;
    this.root.querySelector('#lesson-body').textContent = lesson.body;
    this.root.querySelector('#lesson-artifact').textContent = lesson.artifact;
  }
}
