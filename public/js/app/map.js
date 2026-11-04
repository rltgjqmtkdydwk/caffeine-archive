// 지도
const map = L.map('map', { zoomControl: false, attributionControl: false, preferCanvas: true }).setView([37.556, 126.99], 13);
L.control.attribution({ position: 'topright', prefix: '<a href="https://leafletjs.com">Leaflet</a>' }).addTo(map);
// 배경 지도. CARTO는 2026년부터 키가 있어야 함 (없으면 "API key required" 워터마크)
// config.js에 cartoKey가 있으면 CARTO, 없거나 안 불러와지면 OSM 기본 타일
const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>';
const CARTO_KEY = (window.CAFE_CONFIG || {}).cartoKey;
const TILES = [
  CARTO_KEY && [`https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(CARTO_KEY)}`,
    { maxZoom: 19, subdomains: 'abcd', attribution: `${OSM} &copy; <a href="https://carto.com/attributions">CARTO</a>` }],
  ['https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: OSM }]
].filter(Boolean);
function useTiles(i) {
  const [url, opt] = TILES[i];
  const layer = L.tileLayer(url, opt).addTo(map);
  let ok = false, bad = 0;
  layer.on('tileload', () => { ok = true; });
  layer.on('tileerror', () => {
    if (ok || ++bad < 4 || !TILES[i + 1]) return;
    map.removeLayer(layer);
    useTiles(i + 1);
  });
}
useTiles(0);

const stationLayer = L.layerGroup();
const dotLayer = L.layerGroup().addTo(map);
const pinLayer = L.layerGroup().addTo(map);
const dotRenderer = L.canvas({ padding: 0.3 });
let me = null;

