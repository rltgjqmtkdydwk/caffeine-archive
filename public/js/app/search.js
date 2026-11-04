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
      state.shared = null;
      closeCafe(false);
      render();
      if (rows.length) fitTo(rows, 16);
      setSheet('half');
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
  state.shared = null;
  if (state.mode !== 'station') { state.mode = 'station'; document.querySelectorAll('.mode button').forEach(b => b.classList.toggle('on', b.dataset.mode === 'station')); }
  closeCafe(false);
  setSheet('peek');
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

