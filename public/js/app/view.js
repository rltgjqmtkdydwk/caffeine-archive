// ---------- 처음 화면 ----------
// 카공·느좋 표시가 붙은 카페가 넉넉하면 그걸 다 보이게, 아직 적으면 카페가 몰린 동네를
// 점이 다 보이는 크기로 열어서 빈 지도처럼 안 보이게
const START_SPOT = [37.5572, 126.9245];   // 홍대입구역
const ENOUGH_PINS = 8;
function startView() {
  if (state.classified.length >= ENOUGH_PINS) return fitTo(state.classified, 15);
  map.setView(START_SPOT, DOT_ZOOM);
}

// ---------- 불러오기 ----------

function bounds() {
  const b = map.getBounds().pad(0.15);
  return { s: b.getSouth(), n: b.getNorth(), w: b.getWest(), e: b.getEast() };
}

const showDots = () => !groupView() && state.type === 'all' && map.getZoom() >= DOT_ZOOM;

let viewSeq = 0;
async function refreshView() {
  const seq = ++viewSeq;
  if (showDots() && state.station === 'all' && !state.results) {
    try {
      const rows = await Cafes.inBox(bounds());
      if (seq !== viewSeq) return;
      state.nearby = remember(rows);
    } catch (e) { console.error(e); }
  } else {
    state.nearby = [];
  }
  render();
}

let moveTimer = null;
map.on('moveend', () => {
  clearTimeout(moveTimer);
  moveTimer = setTimeout(refreshView, 250);
});
map.on('zoomend', toggleLabels);

async function reloadClassified() {
  await Cafes.reload();
  state.classified = remember(await Cafes.classified());
}

// ---------- 지도 그리기 ----------

function drawStations() {
  stationLayer.clearLayers();
  state.stations.forEach(s => {
    L.marker([s.lat, s.lng], {
      icon: L.divIcon({ className: 'stn', iconSize: null, html: `<span>${esc(s.name)}</span>` }),
      zIndexOffset: -500
    }).on('click', () => pickStation(s.id)).addTo(stationLayer);
  });
  toggleLabels();
}

// 역 이름표는 멀리서 보면 너무 빽빽해서 어느 정도 당겼을 때만
function toggleLabels() {
  const on = map.getZoom() >= LABEL_ZOOM || state.mode === 'station';
  if (on && !map.hasLayer(stationLayer)) stationLayer.addTo(map);
  if (!on && map.hasLayer(stationLayer)) map.removeLayer(stationLayer);
  $('#hint').hidden = !(!groupView() && state.type === 'all' && map.getZoom() < DOT_ZOOM && state.station === 'all' && !state.results);
}

function pinIcon(c, on, color) {
  const t = c.types || [];
  const k = color ? 'g' : t.length > 1 ? 'both' : t.length ? (TYPES[t[0]]?.key || 'study') : 'none';
  const label = t.length ? t.map(x => TYPES[x]?.short || '').join('') : '카페';
  const style = color ? ` style="--g:${esc(color)}"` : '';
  const mine = state.reviewed.has(c.id) ? ' mine' : '';
  return L.divIcon({ className: `pin pin-${k}${on ? ' is-on' : ''}${mine}`, iconSize: null, html: `<b${style}>${esc(label)}</b>` });
}

function drawMap() {
  pinLayer.clearLayers();
  dotLayer.clearLayers();

  const pins = new Map();
  const g = groupView();
  if (g) {
    g.cafes.forEach(c => pins.set(c.id, c));
    const open = state.open && state.cache.get(state.open);
    if (open) pins.set(open.id, open);
    const gc = g.kind === 'shared' ? state.shared.color : g.list?.color;
    pins.forEach(c => {
      const on = state.open === c.id;
      L.marker([c.lat, c.lng], { icon: pinIcon(c, on, gc), zIndexOffset: on ? 1000 : 0 })
        .on('click', () => openCafe(c.id))
        .addTo(pinLayer);
    });
    return;
  }
  state.classified.filter(matchesType).forEach(c => pins.set(c.id, c));
  if (state.station !== 'all') state.stationCafes.filter(c => c.types?.length && matchesType(c)).forEach(c => pins.set(c.id, c));
  if (state.results) state.results.filter(c => c.types?.length).forEach(c => pins.set(c.id, c));
  const open = state.open && state.cache.get(state.open);
  if (open) pins.set(open.id, open);

  pins.forEach(c => {
    const on = state.open === c.id;
    L.marker([c.lat, c.lng], { icon: pinIcon(c, on), zIndexOffset: on ? 1000 : 0 })
      .on('click', () => openCafe(c.id))
      .addTo(pinLayer);
  });

  // 분류 안 된 카페는 작은 점으로 (캔버스라 수백 개여도 가벼움)
  const dots = state.type !== 'all' ? [] :
    state.station !== 'all' ? state.stationCafes :
    state.results ? state.results : state.nearby;
  dots.forEach(c => {
    if (pins.has(c.id)) return;
    // 점은 지도 위 그림이라 클릭이 지도까지 올라가면 바로 닫혀 버림 → bubblingMouseEvents 끔
    // 다시 그리는 건 클릭 처리가 끝난 다음에
    const mine = state.reviewed.has(c.id);
    L.circleMarker([c.lat, c.lng], {
      renderer: dotRenderer, radius: mine ? 8 : 6, weight: mine ? 3 : 2, bubblingMouseEvents: false,
      color: '#211a15', fillColor: mine ? '#f2c230' : '#fffaf0', fillOpacity: 1
    }).on('click', () => setTimeout(() => openCafe(c.id))).addTo(dotLayer);
  });
}

