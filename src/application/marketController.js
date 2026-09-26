import { APP_CONFIG } from '../config.js';
import { DEFAULT_FILTERS } from '../analytics/marketService.js';
import { distanceToGeometry, kernel } from '../analytics/projectImpact.js';
import { areaDetail, projectDetail, propertyDetail } from '../ui/details.js';
import { esc, formatMetric, money } from '../ui/format.js';
import { AREA_METRICS } from '../config.js';

const bboxOf = (geometry) => geometry.coordinates.flat(geometry.type === 'Polygon' ? 1 : 2)
  .reduce(([a, b, c, d], [x, y]) => [Math.min(a, x), Math.min(b, y), Math.max(c, x), Math.max(d, y)], [Infinity, Infinity, -Infinity, -Infinity]);
const overlaps = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

// One-way flow: dashboard intents → controller updates state → map + dashboard re-render.
export class MarketController {
  constructor({ market, repository, map, dashboard, data, preferences }) {
    Object.assign(this, { market, repository, map, dashboard, data, preferences });
    this.filters = { ...DEFAULT_FILTERS, statuses: [...DEFAULT_FILTERS.statuses] };
    this.areaMetric = preferences.get('areaMetric', 'score');
    this.colorMode = preferences.get('colorMode', 'change');
    this.layers = { areas: true, properties: true, infrastructure: true, housing: true, business: true };
    this.projectFilter = 'major';
    this.history = [];
    this.areaBoxes = data.areas.map((area) => ({ zip: area.zip, box: bboxOf(area.geometry) }));
    this.viewport = { zoom: APP_CONFIG.zoom, bounds: null };
  }

  initialize() {
    const { map, dashboard } = this;
    map.setAreas(this.data.areas);
    map.setProjects(this.data.projects);
    map.setAreaMetric(this.areaMetric);
    map.setColorMode(this.colorMode);
    map.on('selectArea', (zip) => this.selectArea(zip, { fly: false }));
    map.on('selectProperty', (id) => this.selectProperty(id, { fly: false }));
    map.on('selectProject', (id) => this.selectProject(id, { fly: false }));
    map.on('viewport', (viewport) => { this.viewport = viewport; this.loadOffMarket(); });
    map.on('areaTooltip', (zip) => this.areaTooltip(zip));
    map.on('ready', () => dashboard.setReady());
    dashboard.onIntent((intent) => this.handle(intent));
    dashboard.renderRegion(this.market.regionSummary());
    this.refresh();
    this.renderAreas();
    this.renderProjects();
    this.renderLegend();
  }

  handle(intent) {
    switch (intent.type) {
      case 'statuses': this.filters.statuses = intent.statuses; this.refresh(); this.loadOffMarket(); break;
      case 'filter': this.filters = { ...this.filters, ...intent.filters }; this.refresh(); break;
      case 'search': this.search(intent.query); break;
      case 'colorMode': this.colorMode = intent.mode; this.preferences.set('colorMode', intent.mode); this.map.setColorMode(intent.mode); this.renderLegend(); break;
      case 'areaMetric': this.areaMetric = intent.metric; this.preferences.set('areaMetric', intent.metric); this.map.setAreaMetric(intent.metric); this.renderAreas(); this.renderLegend(); break;
      case 'layer': this.layers[intent.layer] = intent.visible; this.map.setLayerVisible(intent.layer, intent.visible); this.renderLegend(); break;
      case '3d': this.map.set3D(intent.enabled); break;
      case 'projectFilter': this.projectFilter = intent.filter; this.renderProjects(); break;
      case 'theme': this.toggleTheme(); break;
      case 'reset': this.closeDetail(); this.map.resetView(); break;
      case 'selectArea': this.selectArea(intent.id); break;
      case 'selectProject': this.selectProject(intent.id); break;
      case 'selectProperty': this.selectProperty(intent.id); break;
      case 'closeDetail': this.closeDetail(); break;
      case 'back': this.back(); break;
      default: break;
    }
  }

  refresh() {
    const view = this.market.query(this.filters);
    this.view = view;
    this.map.setRecords(view.records);
    const wantsOffMarket = this.filters.statuses.includes('off-market');
    this.dashboard.renderView(view, { offMarketHint: wantsOffMarket && this.viewport.zoom < APP_CONFIG.offMarketMinZoom });
  }

  // Off-market parcels are published per ZIP; only fetch the ZIPs currently on screen.
  async loadOffMarket() {
    if (!this.filters.statuses.includes('off-market') || !this.viewport.bounds || this.viewport.zoom < APP_CONFIG.offMarketMinZoom) { this.refresh(); return; }
    const zips = this.areaBoxes.filter(({ box }) => overlaps(box, this.viewport.bounds)).map(({ zip }) => zip).filter((zip) => !this.market.offMarket.has(zip));
    if (!zips.length) { this.refresh(); return; }
    const loaded = await Promise.all(zips.map(async (zip) => [zip, await this.repository.loadOffMarket(zip, this.market.areaByZip.get(zip)?.score?.total ?? null)]));
    for (const [zip, records] of loaded) this.market.setOffMarket(zip, records);
    this.refresh();
  }

  renderAreas() { this.dashboard.renderAreas(this.market.rankedAreas(this.areaMetric), this.areaMetric); }
  renderLegend() { this.dashboard.renderLegend({ colorMode: this.colorMode, areaMetric: this.areaMetric, layers: this.layers }); }

  renderProjects() {
    const all = [...this.data.projects];
    const byImpact = (a, b) => Math.abs(b.weightedPeak) - Math.abs(a.weightedPeak);
    const byDate = (a, b) => String(b.permittedAt || b.recordedAt || '').localeCompare(String(a.permittedAt || a.recordedAt || ''));
    const views = {
      major: () => all.filter((project) => project.group === 'infrastructure' && (Math.abs(project.weightedPeak) >= 1 || project.origin === 'curated')).sort(byImpact),
      housing: () => all.filter((project) => project.group === 'housing').sort((a, b) => (b.units || 0) - (a.units || 0) || byDate(a, b)),
      business: () => all.filter((project) => project.group === 'business').sort(byDate),
      active: () => all.filter((project) => ['construction', 'funded', 'design'].includes(project.stage)).sort(byImpact),
      all: () => all.sort(byImpact),
    };
    this.dashboard.renderProjects((views[this.projectFilter] || views.all)());
  }

  areaTooltip(zip) {
    const area = this.market.areaByZip.get(zip);
    if (!area) return '';
    const definition = AREA_METRICS[this.areaMetric];
    const value = this.areaMetric === 'score' ? area.score?.total : area.metrics[this.areaMetric];
    return `<strong>${esc(zip)} · ${esc(area.city || '')}</strong><span>${esc(definition.label)}: ${esc(formatMetric(value, definition.format))}</span><span>${esc(area.score?.verdict?.label || '')} · ${esc(money(area.metrics.value, true))} typical</span>`;
  }

  search(query) {
    this.filters.query = query.trim();
    this.refresh();
    const text = query.trim().toLowerCase();
    if (text.length < 2) { this.dashboard.showSearchResults([]); return; }
    const areas = this.data.areas.filter((area) => area.zip.startsWith(text) || (area.city || '').toLowerCase().includes(text)).slice(0, 3)
      .map((area) => ({ kind: 'selectArea', id: area.zip, label: 'ZIP', title: `${area.zip} ${area.city || ''}`, subtitle: area.score?.verdict?.label }));
    const projects = this.data.projects.filter((project) => project.name.toLowerCase().includes(text)).slice(0, 3)
      .map((project) => ({ kind: 'selectProject', id: project.id, label: 'Project', title: project.name, subtitle: project.stageLabel }));
    const homes = this.view.records.slice(0, 5).map((property) => ({ kind: 'selectProperty', id: property.id, label: property.status === 'for-sale' ? 'For sale' : property.status === 'off-market' ? 'Home' : 'Sold', title: property.address, subtitle: `${property.zip} · ${money(property.displayPrice, true)}` }));
    this.dashboard.showSearchResults([...areas, ...projects, ...homes].slice(0, 8));
  }

  // ------------------------------------------------------------ selection
  openDrawer(title, html) {
    this.dashboard.openDrawer(title, html, { canGoBack: this.history.length > 0 });
    this.map.syncPadding();
  }

  pushHistory() { if (this.current) this.history.push(this.current); this.history = this.history.slice(-10); }

  selectArea(zip, { fly = true, fromHistory = false } = {}) {
    const area = this.market.areaByZip.get(zip);
    if (!area) return;
    if (!fromHistory) this.pushHistory();
    this.current = { type: 'area', id: zip };
    this.map.select({ type: 'area', id: zip });
    const inZip = this.data.projects.filter((project) => project.zip === zip);
    const openings = inZip.filter((project) => project.category === 'business').sort((a, b) => String(b.permittedAt).localeCompare(String(a.permittedAt))).slice(0, 6);
    const housing = inZip.filter((project) => project.group === 'housing').sort((a, b) => (b.units || 0) - (a.units || 0) || (b.acres || 0) - (a.acres || 0)).slice(0, 5);
    this.openDrawer(`ZIP ${zip}`, areaDetail(area, { regionSeries: this.data.regionSeries, projects: this.market.projectsFor(area), asOf: this.data.asOf, openings, housing }));
    if (fly) this.map.focusArea(area);
  }

  findProperty(id) { return this.market.properties.find((item) => item.id === id) || this.market.offMarketRecords().find((item) => item.id === id); }

  selectProperty(id, { fly = true, fromHistory = false } = {}) {
    const property = this.findProperty(id);
    if (!property) return;
    if (!fromHistory) this.pushHistory();
    this.current = { type: 'property', id };
    this.map.select({ type: 'property', id });
    this.openDrawer('Property', propertyDetail(property, { area: this.market.areaByZip.get(property.zip) }));
    if (fly) this.map.focusPoint(property.coordinates);
  }

  selectProject(id, { fly = true, fromHistory = false } = {}) {
    const project = this.data.projects.find((item) => item.id === id);
    if (!project) return;
    if (!fromHistory) this.pushHistory();
    this.current = { type: 'project', id };
    this.map.select({ type: 'project', id, project });
    const affectedAreas = this.data.areas.map((area) => {
      const distance = distanceToGeometry(area.centroid, project.geometry);
      const contribution = project.effects.reduce((sum, effect) => sum + effect.lift * kernel(distance, effect.radiusMiles), 0) * project.probability * project.timing;
      return { area, contribution };
    }).filter((item) => Math.abs(item.contribution) >= 0.05).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 6);
    this.openDrawer('Project', projectDetail(project, { affectedAreas }));
    if (fly) this.map.focusProject(project);
  }

  back() {
    const previous = this.history.pop();
    if (!previous) return;
    const select = { area: 'selectArea', property: 'selectProperty', project: 'selectProject' }[previous.type];
    this[select](previous.id, { fromHistory: true });
  }

  closeDetail() { this.current = null; this.history = []; this.map.select(null); this.dashboard.closeDrawer(); this.map.syncPadding(); }

  toggleTheme() {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    this.preferences.set('theme', theme);
    this.dashboard.setThemeIcon(theme);
    this.map.setTheme(theme);
  }
}
