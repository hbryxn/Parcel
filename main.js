import './style.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl from 'maplibre-gl';
import { APP_CONFIG } from './src/config.js';
import { ListingRepository } from './src/data/listingRepository.js';
import { ProjectRepository } from './src/data/projectRepository.js';
import { MarketService } from './src/analytics/marketService.js';
import { MapExperience } from './src/map/mapExperience.js';
import { Dashboard } from './src/ui/dashboard.js';
import { MarketController } from './src/application/marketController.js';
import { BuildingFootprintRepository } from './src/data/buildingFootprintRepository.js';

async function boot() {
  const [listings, projects] = await Promise.all([
    new ListingRepository(APP_CONFIG.listingFeeds).load(),
    new ProjectRepository().load(),
  ]);
  const market = new MarketService(listings, projects);
  const footprints = new BuildingFootprintRepository();
  const dashboard = new Dashboard(document.querySelector('#app'));

  dashboard.render(market.query());

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

  const mapExperience = new MapExperience(map, projects);
  const controller = new MarketController(market, footprints, mapExperience, dashboard);
  map.once('load', () => controller.initialize());
}

boot().catch((error) => {
  console.error(error);
  document.querySelector('#app').innerHTML = `
    <div class="fatal-state"><span>DATA CONNECTION</span><h1>We couldn't assemble the map.</h1>
    <p>${error.message}</p><button onclick="location.reload()">Try again</button></div>`;
});
