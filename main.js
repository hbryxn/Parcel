import './style.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl from 'maplibre-gl';
import { APP_CONFIG } from './src/config.js';
import { DatasetRepository } from './src/data/datasetRepository.js';
import { MarketService } from './src/analytics/marketService.js';
import { MapExperience } from './src/map/mapExperience.js';
import { Dashboard } from './src/ui/dashboard.js';
import { MarketController } from './src/application/marketController.js';
import { esc } from './src/ui/format.js';

// Per-viewer UI preferences only; nothing here is required for the app to work.
const preferences = {
  get(key, fallback) { try { return localStorage.getItem(`parcel.${key}`) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(`parcel.${key}`, value); } catch { /* storage unavailable */ } },
};

const initialTheme = () => preferences.get('theme', null) || (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

async function boot() {
  const theme = initialTheme();
  document.documentElement.dataset.theme = theme;
  const repository = new DatasetRepository(APP_CONFIG);
  const data = await repository.load();
  const market = new MarketService(data);
  const dashboard = new Dashboard(document.querySelector('#app'));
  dashboard.render({ manifest: data.manifest, live: data.live, theme, filters: { statuses: ['for-sale', 'pending', 'sold'] }, areaMetric: preferences.get('areaMetric', 'score'), colorMode: preferences.get('colorMode', 'change') });
  const map = new MapExperience(maplibregl, 'map', theme);
  new MarketController({ market, repository, map, dashboard, data, preferences }).initialize();
  if (import.meta.env?.DEV) window.parcel = { map: map.map, market };
}

boot().catch((error) => {
  console.error(error);
  document.querySelector('#app').innerHTML = `
    <div class="fatal-state"><span>DATA CONNECTION</span><h1>We couldn't assemble the map.</h1>
    <p>${esc(error.message)}</p><button onclick="location.reload()">Try again</button></div>`;
});
