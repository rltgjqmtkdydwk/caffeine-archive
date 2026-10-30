const TYPES = {
  '카공': { key: 'study', short: '공', desc: '공부·작업' },
  '느좋': { key: 'mood', short: '느', desc: '분위기·데이트' }
};

const LINE_COLORS = {
  '1': '#0d3692', '2': '#33a23d', '3': '#fe5b10', '4': '#32a1c8', '5': '#8b50a4',
  '6': '#c55c1d', '7': '#54640d', '8': '#f14c82', '9': '#aa9872',
  '신분당': '#d31145', '경의중앙': '#77c4a3', '공항': '#0090d2', '수인분당': '#fabe00',
  '우이신설': '#b0ce18', '신림': '#6789ca', '경춘': '#0c8e72', '서해': '#81a914',
  '김포골드': '#a17800', 'GTX-A': '#9a6292'
};

const DOT_ZOOM = 15;      // 이만큼 당겨야 분류 안 된 카페까지 다 보임
const LABEL_ZOOM = 14;    // 역 이름표가 보이기 시작하는 줌
const LIST_MAX = 60;

const state = {
  mode: 'type', type: 'all', station: 'all',
  stations: [], classified: [], nearby: [], stationCafes: [], results: null,
  cache: new Map(), open: null, query: { type: '', station: '' }
};

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const wide = () => window.innerWidth >= 860;
const remember = list => { list.forEach(c => state.cache.set(c.id, c)); return list; };
const stationById = id => state.stations.find(s => s.id === id);
const matchesType = c => state.type === 'all' || (c.types || []).includes(state.type);

// 지도
const map = L.map('map', { zoomControl: false, attributionControl: false, preferCanvas: true }).setView([37.556, 126.99], 13);
L.control.attribution({ position: 'topright', prefix: '<a href="https://leafletjs.com">Leaflet</a>' }).addTo(map);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  maxZoom: 19,
  subdomains: 'abcd',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
}).addTo(map);

const stationLayer = L.layerGroup();
const dotLayer = L.layerGroup().addTo(map);
const pinLayer = L.layerGroup().addTo(map);
const dotRenderer = L.canvas({ padding: 0.3 });
let me = null;

// 시작: 역과 분류된 카페부터 불러옴
(async () => {
  try {
    const [stations, classified] = await Promise.all([Cafes.stations(), Cafes.classified()]);
    state.stations = stations;
    state.classified = remember(classified);
    drawStations();
    if (classified.length) fitTo(classified, 15);
    await refreshView();
    resumeWrite();
  } catch (err) {
    console.error(err);
    $('#count').textContent = '데이터 오류';
    $('#list').innerHTML = '<li class="empty">카페 정보를 못 불러왔어요. 잠시 뒤에 다시 열어 주세요.</li>';
  }
})();

// ---------- 불러오기 ----------

function bounds() {
  const b = map.getBounds().pad(0.15);
  return { s: b.getSouth(), n: b.getNorth(), w: b.getWest(), e: b.getEast() };
}

const showDots = () => state.type === 'all' && map.getZoom() >= DOT_ZOOM;

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
  $('#hint').hidden = !(state.type === 'all' && map.getZoom() < DOT_ZOOM && state.station === 'all' && !state.results);
}

function pinIcon(c, on) {
  const t = c.types || [];
  const k = t.length > 1 ? 'both' : t.length ? (TYPES[t[0]]?.key || 'study') : 'none';
  const label = t.length ? t.map(x => TYPES[x]?.short || '').join('') : '카페';
  return L.divIcon({ className: `pin pin-${k}${on ? ' is-on' : ''}`, iconSize: null, html: `<b>${esc(label)}</b>` });
}

function drawMap() {
  pinLayer.clearLayers();
  dotLayer.clearLayers();

  const pins = new Map();
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
    L.circleMarker([c.lat, c.lng], {
      renderer: dotRenderer, radius: 5, weight: 2,
      color: '#211a15', fillColor: '#fffaf0', fillOpacity: 1
    }).on('click', () => openCafe(c.id)).addTo(dotLayer);
  });
}

// ---------- 목록 ----------

function listCafes() {
  if (state.results) return { title: `"${state.query.type}"`, rows: state.results.filter(matchesType) };
  if (state.station !== 'all') {
    const s = stationById(state.station);
    return { title: `${s ? s.name + '역' : ''}${state.type !== 'all' ? ' · ' + state.type : ''}`, rows: state.stationCafes.filter(matchesType) };
  }
  const b = map.getBounds();
  const inView = c => b.contains([c.lat, c.lng]);
  const seen = new Set();
  const rows = [];
  [...state.classified.filter(matchesType), ...(showDots() ? state.nearby : [])].forEach(c => {
    if (seen.has(c.id) || !inView(c)) return;
    seen.add(c.id);
    rows.push(c);
  });
  return { title: state.type === 'all' ? '이 근처' : `이 근처 ${state.type}`, rows };
}

function sortRows(rows) {
  const ctr = map.getCenter();
  return [...rows].sort((a, b) =>
    ((b.types?.length ? 1 : 0) - (a.types?.length ? 1 : 0)) ||
    ((b.review_count || 0) - (a.review_count || 0)) ||
    (state.station !== 'all' ? (a.walk ?? 99) - (b.walk ?? 99) :
      ctr.distanceTo([a.lat, a.lng]) - ctr.distanceTo([b.lat, b.lng])));
}

function itemHTML(c) {
  const s = stationById(c.station_id);
  const where = [s && esc(s.name) + '역', c.walk && `도보 ${esc(c.walk)}분`].filter(Boolean).join(' ');
  const score = c.review_count
    ? `<b class="n">★ ${Number(c.avg_rating).toFixed(1)}</b> 후기 ${c.review_count}`
    : '아직 후기 없음';
  return `<li><button type="button" class="item${c.types?.length ? '' : ' plain'}" data-id="${esc(c.id)}">
    ${(c.types || []).map(t => `<i class="tag tag-${TYPES[t]?.key}">${esc(t)}</i>`).join('')}
    <strong>${esc(c.name)}</strong>
    <small>${where}${where ? ' · ' : ''}${score}</small>
    ${c.note ? `<p>${esc(c.note)}</p>` : ''}
  </button></li>`;
}

function renderList() {
  const { title, rows } = listCafes();
  const sorted = sortRows(rows);
  $('#count').textContent = `${title} ${rows.length}${rows.length >= 500 ? '+' : ''}곳`;

  let html = sorted.slice(0, LIST_MAX).map(itemHTML).join('');
  if (rows.length > LIST_MAX) html += `<li class="more">나머지 ${rows.length - LIST_MAX}곳은 지도에서 콕 눌러 봐</li>`;
  if (!rows.length) {
    html = state.results
      ? '<li class="empty">그런 이름의 카페는 못 찾았어요.</li>'
      : state.type === 'all' && map.getZoom() < DOT_ZOOM && state.station === 'all'
        ? '<li class="empty">아직 카공·느좋 표시가 붙은 데가 없어요. 지도를 당기면 이 근처 카페가 전부 보여요.</li>'
        : '<li class="empty">이 근처엔 조건에 맞는 카페가 아직 없어요.</li>';
  }
  $('#list').innerHTML = html;
}

function render() {
  renderChips();
  drawMap();
  renderList();
  toggleLabels();
}

// ---------- 필터 칩 ----------

function stationOptions() {
  const t = state.query.station.trim();
  const count = id => state.classified.filter(c => c.station_id === id && matchesType(c)).length;
  let list = state.stations;
  if (t) list = list.filter(s => s.name.includes(t));
  return list
    .map(s => ({ s, n: count(s.id) }))
    .sort((a, b) => (t ? a.s.name.length - b.s.name.length : 0) || b.n - a.n || a.s.name.localeCompare(b.s.name, 'ko'))
    .slice(0, 40);
}

function renderChips() {
  const box = $('#chip-list');
  const input = $('#q');
  input.placeholder = state.mode === 'type' ? '카페 이름' : '역 이름';
  if (document.activeElement !== input) input.value = state.query[state.mode];

  if (state.mode === 'type') {
    const opts = [['all', '전체', ''], ...Object.entries(TYPES).map(([k, v]) => [k, k, v.desc])];
    box.innerHTML = opts.map(([v, label, desc]) =>
      `<button type="button" class="chip chip-${TYPES[v]?.key || 'all'}${state.type === v ? ' on' : ''}" data-type="${esc(v)}">${esc(label)}${desc ? `<small>${esc(desc)}</small>` : ''}</button>`
    ).join('');
    return;
  }
  const badge = l => /^\d+$/.test(l) ? l : String(l)[0];
  box.innerHTML =
    `<button type="button" class="chip${state.station === 'all' ? ' on' : ''}" data-station="all">전체</button>` +
    stationOptions().map(({ s, n }) => `<button type="button" class="chip${state.station === s.id ? ' on' : ''}" data-station="${esc(s.id)}">
      <span class="lines">${(s.lines || []).map(l => `<i style="background:${LINE_COLORS[l] || '#777'}" title="${esc(l)}">${esc(badge(l))}</i>`).join('')}</span>
      ${esc(s.name)}${n ? `<em>${n}</em>` : ''}</button>`).join('');
}

function setMode(m) {
  state.mode = m;
  document.querySelectorAll('.mode button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  render();
}

// ---------- 검색 ----------

let searchTimer = null;
let searchSeq = 0;
function onSearchInput(v) {
  state.query[state.mode] = v;
  if (state.mode === 'station') { renderChips(); return; }
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    const t = v.trim();
    if (t.length < 2) {
      if (state.results) { state.results = null; render(); }
      return;
    }
    const seq = ++searchSeq;
    try {
      const rows = await Cafes.search(t);
      if (seq !== searchSeq) return;
      state.results = remember(rows);
      state.station = 'all';
      closeCafe(false);
      render();
      if (rows.length) fitTo(rows, 16);
      $('#sheet').classList.add('full');
    } catch (e) { console.error(e); }
  }, 300);
}

function clearSearch() {
  state.query.type = '';
  $('#q').value = '';
  if (state.results) { state.results = null; render(); }
}

// ---------- 이동 ----------

// 목록이 지도를 가리는 만큼 보정해서 이동
function panAbove(latlng, zoom) {
  const cover = wide() ? 0 : ($('#detail').hidden ? $('#sheet') : $('#detail')).offsetHeight;
  const p = map.project(latlng, zoom).add([0, cover / 2]);
  map.flyTo(map.unproject(p, zoom), zoom, { duration: .6 });
}

function fitTo(list, maxZoom) {
  const pts = list.map(c => [c.lat, c.lng]);
  if (!pts.length) return;
  map.fitBounds(pts, {
    paddingTopLeft: [40, 40],
    paddingBottomRight: wide() ? [420, 40] : [40, $('#sheet').offsetHeight + 30],
    maxZoom
  });
}

async function pickStation(id) {
  state.station = id;
  state.results = null;
  if (state.mode !== 'station') { state.mode = 'station'; document.querySelectorAll('.mode button').forEach(b => b.classList.toggle('on', b.dataset.mode === 'station')); }
  closeCafe(false);
  $('#sheet').classList.remove('full');
  state.stationCafes = [];
  if (id !== 'all') {
    const s = stationById(id);
    if (s) panAbove([s.lat, s.lng], 16);
    try { state.stationCafes = remember(await Cafes.atStation(id)); } catch (e) { console.error(e); }
  }
  render();
  const chip = document.querySelector(`#chip-list [data-station="${CSS.escape(id)}"]`);
  chip?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
}

// ---------- 카페 상세 ----------

function isAdmin() {
  return Cafes.live && !!Reviews.me().profile?.is_admin;
}

function adminHTML(c) {
  const t = c.admin_types || [];
  return `<div class="admin">
    <small>운영자</small>
    ${Object.keys(TYPES).map(k => `<button type="button" class="${t.includes(k) ? 'on' : ''}" data-admin-type="${esc(k)}">${esc(k)} 표시</button>`).join('')}
    <button type="button" class="hide" data-admin-hide>숨기기</button>
  </div>`;
}

async function openCafe(id) {
  let c = state.cache.get(id);
  if (!c) {
    try { c = await Cafes.byId(id); } catch (e) { console.error(e); }
    if (!c) return;
    remember([c]);
  }
  state.open = id;
  drawMap();

  const s = stationById(c.station_id);
  const q = encodeURIComponent(`${c.name} ${s ? s.name + '역' : ''}`.trim());
  const rows = [
    s && ['역', `${s.name}역${c.walk ? ` 도보 ${c.walk}분` : ''}`],
    c.address && ['주소', c.address],
    c.hours && ['영업', c.hours],
    c.tags?.length && ['특징', c.tags.join(', ')]
  ].filter(Boolean);

  const d = $('#detail');
  d.innerHTML = `
    <button type="button" class="x" aria-label="닫기">×</button>
    ${(c.types || []).map(t => `<i class="tag tag-${TYPES[t]?.key}">${esc(t)}</i>`).join('')}
    <h2>${esc(c.name)}</h2>
    <dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    ${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}
    ${c.sample ? '<p class="sample">예시 데이터예요. 실제 카페로 바꿔 주세요.</p>' : ''}
    ${!c.types?.length ? '<p class="untagged">아직 카공인지 느좋인지 몰라요. 다녀왔으면 후기로 알려 줘.</p>' : ''}
    ${isAdmin() ? adminHTML(c) : ''}
    <section class="rv" id="rv"><p class="rv-none">후기 불러오는 중</p></section>
    <button type="button" class="write-btn" id="write-btn">이 카페 후기 남기기</button>
    <div class="go">
      <a href="https://map.naver.com/p/search/${q}" target="_blank" rel="noopener">네이버 지도</a>
      <a href="https://map.kakao.com/link/search/${q}" target="_blank" rel="noopener">카카오맵</a>
    </div>`;
  Reviews.fillSummary(c.id, $('#rv'), $('#write-btn'));
  d.hidden = false;
  d.scrollTop = 0;
  $('#sheet').classList.remove('full');
  panAbove([c.lat, c.lng], Math.max(map.getZoom(), 16));
}

function closeCafe(redraw = true) {
  if (!state.open) return;
  state.open = null;
  $('#detail').hidden = true;
  if (redraw) drawMap();
}

// 후기를 쓰거나 운영자가 표시를 바꾸면 그 카페 정보와 분류 핀을 다시 받음
async function refreshCafe(id) {
  try {
    await reloadClassified();
    const c = await Cafes.byId(id);
    if (c) remember([c]);
    else state.cache.delete(id);
    [state.nearby, state.stationCafes, state.results].forEach(list => {
      if (!list) return;
      const i = list.findIndex(x => x.id === id);
      if (i < 0) return;
      if (c) list[i] = c; else list.splice(i, 1);
    });
  } catch (e) { console.error(e); }
  render();
  if (state.open === id) {
    if (state.cache.has(id)) openCafe(id);
    else closeCafe();
  }
}

async function startWrite(cafeId) {
  let c = state.cache.get(cafeId) || await Cafes.byId(cafeId).catch(() => null);
  if (!c) return;
  remember([c]);
  if (state.open !== cafeId) await openCafe(cafeId);
  Reviews.startWrite(c, () => refreshCafe(cafeId));
}

// 카카오 로그인에서 돌아오면 주소에 ?write=카페id 가 붙어 있음 → 쓰던 후기 이어서
async function resumeWrite() {
  const url = new URL(location.href);
  const id = url.searchParams.get('write');
  await Reviews.ready;
  if (url.search) history.replaceState(null, '', url.pathname + url.hash);
  if (id) startWrite(id);
  else if (Reviews.me().user && !Reviews.me().profile) Reviews.openAccount();
}

// 상단 내 계정 버튼
function paintMe({ user, profile }) {
  const b = $('#me');
  b.classList.toggle('in', !!user);
  b.innerHTML = profile ? Reviews.markHTML(profile.mark) : user ? '이름?' : '로그인';
  b.setAttribute('aria-label', profile ? `내 프로필: ${profile.nickname}` : '로그인');
}
Reviews.onChange(s => {
  paintMe(s);
  if (state.open) openCafe(state.open);
});
$('#me').addEventListener('click', () => Reviews.openAccount());

// ---------- 이벤트 ----------

document.querySelectorAll('.mode button').forEach(b =>
  b.addEventListener('click', () => setMode(b.dataset.mode)));

$('#q').addEventListener('input', e => onSearchInput(e.target.value));
$('#q').addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.target.blur(); clearSearch(); }
  if (e.key === 'Enter') e.target.blur();
});

$('#chip-list').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.type) {
    state.type = b.dataset.type;
    clearSearch();
    closeCafe(false);
    const list = state.classified.filter(matchesType);
    if (state.type !== 'all' && list.length) fitTo(list, 15);
    refreshView();
  } else if (b.dataset.station) {
    pickStation(b.dataset.station);
  }
});

$('#hint').addEventListener('click', () => map.flyTo(map.getCenter(), DOT_ZOOM, { duration: .5 }));

$('#list').addEventListener('click', e => {
  const b = e.target.closest('.item');
  if (b) openCafe(b.dataset.id);
});

$('#detail').addEventListener('click', async e => {
  if (e.target.closest('.x')) closeCafe();
  if (e.target.closest('#write-btn') && state.open) startWrite(state.open);

  const tb = e.target.closest('[data-admin-type]');
  const hb = e.target.closest('[data-admin-hide]');
  if ((tb || hb) && state.open) {
    const id = state.open;
    const c = state.cache.get(id);
    try {
      if (tb) {
        const k = tb.dataset.adminType;
        const cur = c?.admin_types || [];
        await Cafes.setTypes(id, cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k]);
      } else {
        if (!confirm('지도에서 이 카페를 숨길까요? (폐업했거나 카페가 아닐 때)')) return;
        await Cafes.setHidden(id, true);
      }
      refreshCafe(id);
    } catch (err) {
      console.error(err);
      alert('바꾸지 못했어요. 운영자 계정인지 확인해 주세요.');
    }
  }
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || e.target.id === 'q') return;
  if (Reviews.isOpen()) Reviews.close();
  else closeCafe();
});
map.on('click', () => closeCafe());

// 목록 시트: 탭하면 펼치고 접기, 위아래로 밀어도 됨
const sheet = $('#sheet');
const handle = $('#handle');
let startY = null;
handle.addEventListener('click', () => sheet.classList.toggle('full'));
handle.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, { passive: true });
handle.addEventListener('touchend', e => {
  if (startY === null) return;
  const dy = e.changedTouches[0].clientY - startY;
  startY = null;
  if (Math.abs(dy) < 30) return;
  e.preventDefault();
  sheet.classList.toggle('full', dy < 0);
});

// 내 위치
$('#locate').addEventListener('click', () => map.locate({ enableHighAccuracy: true }));
map.on('locationfound', e => {
  me?.remove();
  me = L.circleMarker(e.latlng, {
    radius: 8, color: '#211a15', weight: 3, fillColor: '#f2c230', fillOpacity: 1
  }).addTo(map);
  panAbove(e.latlng, DOT_ZOOM + 1);
});
map.on('locationerror', () => alert('위치를 가져오지 못했어요. 브라우저 위치 권한을 확인해 주세요.'));
