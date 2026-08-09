import './style.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl from 'maplibre-gl';
import { APP_CONFIG } from './src/config.js';
import { PropertyRepository } from './src/data/propertyRepository.js';
import { ProjectRepository } from './src/data/projectRepository.js';
import { MarketModel } from './src/analytics/marketModel.js';
import { MapExperience } from './src/map/mapExperience.js';
import { Dashboard } from './src/ui/dashboard.js';

async function boot() {
  const properties = await new PropertyRepository(APP_CONFIG.propertyFeed).load();
  const projects = await new ProjectRepository().load();
  const market = new MarketModel(properties, projects);
  const dashboard = new Dashboard(document.querySelector('#app'), market);

  dashboard.render();

  const map = new maplibregl.Map({
    container: 'map',
    style: APP_CONFIG.mapStyle,
    center: APP_CONFIG.center,
    zoom: APP_CONFIG.zoom,
    pitch: APP_CONFIG.pitch,
    bearing: APP_CONFIG.bearing,
    antialias: true,
    attributionControl: false,
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-left');
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

  const mapExperience = new MapExperience(map, market, dashboard);
  dashboard.connect(mapExperience);
  map.once('load', () => mapExperience.initialize());
}

boot().catch((error) => {
  console.error(error);
  document.querySelector('#app').innerHTML = `
    <div class="fatal-state"><span>DATA CONNECTION</span><h1>We couldn't assemble the map.</h1>
    <p>${error.message}</p><button onclick="location.reload()">Try again</button></div>`;
});
