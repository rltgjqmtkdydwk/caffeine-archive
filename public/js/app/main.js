// 로고: 검색·필터·역·그룹·열린 카페를 다 풀고 처음 지도로

function goHome() {
  if (Reviews.isOpen()) Reviews.close();
  closeCafe(false);
  state.type = 'all';
  state.station = 'all';
  state.results = null;
  state.shared = null;
  state.group = null;
  state.groupCafes = [];
  state.stationCafes = [];
  state.query = { type: '', station: '' };
  state.mode = 'type';
  document.querySelectorAll('.mode button').forEach(b => b.classList.toggle('on', b.dataset.mode === 'type'));
  $('#q').value = '';
  $('#q').blur();
  setSheet('peek');
  if (location.search) history.replaceState(null, '', location.pathname);
  startView();
  refreshView();
}

// ---------- 이벤트 ----------

$('#home').addEventListener('click', e => {
  e.preventDefault();
  goHome();
});

document.querySelectorAll('.mode button').forEach(b =>
  b.addEventListener('click', () => setMode(b.dataset.mode)));

$('#q').addEventListener('input', e => onSearchInput(e.target.value));
// 한글은 조합 중에 Enter를 누르면 마지막 글자가 한 번 더 들어가서, 조합 중일 땐 Enter를 무시
$('#q').addEventListener('keydown', e => {
  if (e.isComposing || e.keyCode === 229) return;
  if (e.key === 'Escape') { e.target.blur(); clearSearch(); }
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const v = e.target.value;
  if (state.mode === 'station') {
    state.query.station = v;
    const top = stationOptions()[0];
    if (top && v.trim()) pickStation(top.s.id);
  } else {
    clearTimeout(searchTimer);
    onSearchInput(v);
  }
  e.target.blur();
});

$('#chip-list').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.g) return onGroupAction(b.dataset.g);
  if (b.dataset.type) {
    state.type = b.dataset.type;
    state.shared = null;
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
  const g = e.target.closest('[data-g]');
  if (g) return onGroupAction(g.dataset.g);
  const b = e.target.closest('.item');
  if (b) openCafe(b.dataset.id);
});

$('#detail').addEventListener('click', async e => {
  if (e.target.closest('.x')) closeCafe();
  if (e.target.closest('#write-btn') && state.open) startWrite(state.open);
  const ca = e.target.closest('[data-cafe-act]');
  if (ca && state.open) {
    const act = ca.dataset.cafeAct;
    return act === 'save' ? saveCafe(state.open) : shareCafe(state.open);
  }

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

// 목록 시트: 처음엔 손잡이만. 누르면 절반 ↔ 접기, 위로 밀면 화면 가득, 아래로 밀면 손잡이만
const handle = $('#handle');
let startY = null;
handle.addEventListener('pointerdown', e => {
  startY = e.clientY;
  handle.setPointerCapture?.(e.pointerId);
});
handle.addEventListener('pointerup', e => {
  if (startY === null) return;
  const dy = e.clientY - startY;
  startY = null;
  if (dy < -30) return setSheet('full');
  if (dy > 30) return setSheet('peek');
  const now = sheetState();
  setSheet(now === 'peek' ? 'half' : now === 'full' ? 'half' : 'peek');
});
handle.addEventListener('pointercancel', () => { startY = null; });
handle.addEventListener('click', e => { if (e.detail === 0) setSheet(sheetState() === 'peek' ? 'half' : 'peek'); });
handle.addEventListener('keydown', e => {
  if (e.key === 'ArrowUp') { e.preventDefault(); setSheet(sheetState() === 'peek' ? 'half' : 'full'); }
  if (e.key === 'ArrowDown') { e.preventDefault(); setSheet(sheetState() === 'full' ? 'half' : 'peek'); }
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

// 시작: 역과 분류된 카페부터 불러옴
(async () => {
  try {
    const [stations, classified] = await Promise.all([Cafes.stations(), Cafes.classified()]);
    state.stations = stations;
    state.classified = remember(classified);
    drawStations();
    startView();
    await refreshView();
    resumeWrite();
  } catch (err) {
    console.error(err);
    $('#count').textContent = '데이터 오류';
    $('#list').innerHTML = '<li class="empty">카페 정보를 못 불러왔어요. 잠시 뒤에 다시 열어 주세요.</li>';
  }
})();

