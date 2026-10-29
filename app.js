const TYPES = {
  '카공': { key: 'study', short: '공', desc: '공부·작업' },
  '느좋': { key: 'mood', short: '느', desc: '분위기·데이트' }
};

const LINE_COLORS = {
  '1': '#0d3692', '2': '#33a23d', '3': '#fe5b10', '4': '#32a1c8', '5': '#8b50a4',
  '6': '#c55c1d', '7': '#54640d', '8': '#f14c82', '9': '#aa9872',
  '신분당': '#d31145', '경의중앙': '#77c4a3', '공항': '#0090d2', '수인분당': '#fabe00'
};

const state = { mode: 'type', type: 'all', station: 'all', cafes: [], stations: [], open: null };

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const wide = () => window.innerWidth >= 860;

// 지도
const map = L.map('map', { zoomControl: false, attributionControl: false }).setView([37.556, 126.99], 12);
L.control.attribution({ position: 'topright', prefix: '<a href="https://leafletjs.com">Leaflet</a>' }).addTo(map);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  maxZoom: 19,
  subdomains: 'abcd',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
}).addTo(map);

const stationLayer = L.layerGroup().addTo(map);
const cafeLayer = L.layerGroup().addTo(map);
let me = null;

fetch('data/cafes.json')
  .then(r => r.json())
  .then(data => {
    state.stations = data.stations || [];
    state.cafes = data.cafes || [];
    drawStations();
    render();
    fitVisible();
    loadCounts();
    resumeWrite();
  })
  .catch(err => {
    console.error(err);
    $('#count').textContent = '데이터 오류';
    $('#list').innerHTML = '<li class="empty">data/cafes.json을 읽지 못했어요. 쉼표나 따옴표가 빠지지 않았는지 확인해 주세요.</li>';
  });

const stationById = id => state.stations.find(s => s.id === id);

state.stats = {};
function loadCounts() {
  Reviews.stats()
    .then(m => { state.stats = m; renderList(); })
    .catch(console.error);
}

function refreshOpen() {
  loadCounts();
  if (state.open && $('#rv')) Reviews.fillSummary(state.open, $('#rv'), $('#write-btn'));
}

function startWrite(cafeId) {
  const c = state.cafes.find(x => x.id === cafeId);
  if (!c) return;
  if (state.open !== cafeId) openCafe(cafeId);
  Reviews.startWrite(c, refreshOpen);
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
Reviews.onChange(s => { paintMe(s); refreshOpen(); });
$('#me').addEventListener('click', () => Reviews.openAccount());

function filtered() {
  return state.cafes.filter(c =>
    (state.type === 'all' || c.type.includes(state.type)) &&
    (state.station === 'all' || c.station === state.station));
}

// 목록이 지도를 가리는 만큼 보정해서 이동
function panAbove(latlng, zoom) {
  const cover = wide() ? 0 : ($('#detail').hidden ? $('#sheet') : $('#detail')).offsetHeight;
  const p = map.project(latlng, zoom).add([0, cover / 2]);
  map.flyTo(map.unproject(p, zoom), zoom, { duration: .6 });
}

function fitVisible() {
  const pts = filtered().map(c => [c.lat, c.lng]);
  if (!pts.length) return;
  map.fitBounds(pts, {
    paddingTopLeft: [40, 40],
    paddingBottomRight: wide() ? [420, 40] : [40, $('#sheet').offsetHeight + 30],
    maxZoom: 16
  });
}

function drawStations() {
  state.stations.forEach(s => {
    L.marker([s.lat, s.lng], {
      icon: L.divIcon({ className: 'stn', iconSize: null, html: `<span>${esc(s.name)}</span>` }),
      zIndexOffset: -500
    }).on('click', () => pickStation(s.id)).addTo(stationLayer);
  });
}

function pinIcon(c, on) {
  const k = c.type.length > 1 ? 'both' : (TYPES[c.type[0]]?.key || 'study');
  return L.divIcon({
    className: `pin pin-${k}${on ? ' is-on' : ''}`,
    iconSize: null,
    html: `<b>${c.type.map(t => TYPES[t]?.short || '').join('')}</b>`
  });
}

function renderChips() {
  const box = $('#chips');
  if (state.mode === 'type') {
    const opts = [['all', '전체', ''], ...Object.entries(TYPES).map(([k, v]) => [k, k, v.desc])];
    box.innerHTML = opts.map(([v, label, desc]) =>
      `<button type="button" class="chip chip-${TYPES[v]?.key || 'all'}${state.type === v ? ' on' : ''}" data-type="${esc(v)}">${esc(label)}${desc ? `<small>${esc(desc)}</small>` : ''}</button>`
    ).join('');
    return;
  }
  const count = id => state.cafes.filter(c => c.station === id && (state.type === 'all' || c.type.includes(state.type))).length;
  const badge = l => /^\d+$/.test(l) ? l : String(l)[0];
  const sorted = [...state.stations].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  box.innerHTML =
    `<button type="button" class="chip${state.station === 'all' ? ' on' : ''}" data-station="all">전체</button>` +
    sorted.map(s => `<button type="button" class="chip${state.station === s.id ? ' on' : ''}" data-station="${esc(s.id)}">
      <span class="lines">${(s.lines || []).map(l => `<i style="background:${LINE_COLORS[l] || '#777'}" title="${esc(l)}">${esc(badge(l))}</i>`).join('')}</span>
      ${esc(s.name)}<em>${count(s.id)}</em></button>`).join('');
}

function itemHTML(c) {
  const s = stationById(c.station);
  return `<li><button type="button" class="item" data-id="${esc(c.id)}">
    ${c.type.map(t => `<i class="tag tag-${TYPES[t]?.key}">${esc(t)}</i>`).join('')}
    <strong>${esc(c.name)}</strong>
    <small>${s ? esc(s.name) + '역' : ''}${c.walk ? ` · 도보 ${esc(c.walk)}분` : ''}${state.stats[c.id] ? ` · <b class="n">★ ${state.stats[c.id].avg.toFixed(1)}</b> 후기 ${state.stats[c.id].n}` : ''}</small>
    ${c.note ? `<p>${esc(c.note)}</p>` : ''}
  </button></li>`;
}

function render() {
  renderChips();
  const list = filtered();

  cafeLayer.clearLayers();
  list.forEach(c => {
    const on = state.open === c.id;
    L.marker([c.lat, c.lng], { icon: pinIcon(c, on), zIndexOffset: on ? 1000 : 0 })
      .on('click', () => openCafe(c.id))
      .addTo(cafeLayer);
  });

  renderList(list);
}

function renderList(list = filtered()) {
  const parts = [];
  if (state.station !== 'all') parts.push(stationById(state.station)?.name + '역');
  if (state.type !== 'all') parts.push(state.type);
  $('#count').textContent = `${parts.length ? parts.join(' · ') : '전체'} ${list.length}곳`;
  $('#list').innerHTML = list.length
    ? list.map(itemHTML).join('')
    : '<li class="empty">조건에 맞는 카페가 아직 없어요.</li>';
}

function setMode(m) {
  state.mode = m;
  document.querySelectorAll('.mode button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  renderChips();
}

function pickStation(id) {
  state.station = id;
  if (state.mode !== 'station') setMode('station');
  closeCafe();
  render();
  const s = stationById(id);
  if (s) panAbove([s.lat, s.lng], 16);
  else fitVisible();
  const chip = document.querySelector(`#chips [data-station="${CSS.escape(id)}"]`);
  chip?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
}

function openCafe(id) {
  const c = state.cafes.find(x => x.id === id);
  if (!c) return;
  state.open = id;
  render();

  const s = stationById(c.station);
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
    ${c.type.map(t => `<i class="tag tag-${TYPES[t]?.key}">${esc(t)}</i>`).join('')}
    <h2>${esc(c.name)}</h2>
    <dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    ${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}
    ${c.sample ? '<p class="sample">예시 데이터예요. 실제 카페로 바꿔 주세요.</p>' : ''}
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

function closeCafe() {
  if (!state.open) return;
  state.open = null;
  $('#detail').hidden = true;
  render();
}

// 이벤트
document.querySelectorAll('.mode button').forEach(b =>
  b.addEventListener('click', () => setMode(b.dataset.mode)));

$('#chips').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.type) {
    state.type = b.dataset.type;
    closeCafe();
    render();
    fitVisible();
  } else if (b.dataset.station) {
    pickStation(b.dataset.station);
  }
});

$('#list').addEventListener('click', e => {
  const b = e.target.closest('.item');
  if (b) openCafe(b.dataset.id);
});

$('#detail').addEventListener('click', e => {
  if (e.target.closest('.x')) closeCafe();
  if (e.target.closest('#write-btn')) {
    if (state.open) startWrite(state.open);
  }
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (Reviews.isOpen()) Reviews.close();
  else closeCafe();
});
map.on('click', closeCafe);

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
  panAbove(e.latlng, 15);
});
map.on('locationerror', () => alert('위치를 가져오지 못했어요. 브라우저 위치 권한을 확인해 주세요.'));
