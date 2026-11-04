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
  cache: new Map(), open: null, query: { type: '', station: '' },
  myLists: [], group: null, groupCafes: [], shared: null,
  reviewed: new Set()
};

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const wide = () => window.innerWidth >= 860;
const sheetState = () => document.body.dataset.sheet || 'peek';
function setSheet(s) {
  document.body.dataset.sheet = s;
  $('#handle').setAttribute('aria-label', s === 'peek' ? '목록 열기' : '목록 접기');
}
const remember = list => { list.forEach(c => state.cache.set(c.id, c)); return list; };
const stationById = id => state.stations.find(s => s.id === id);
const matchesType = c => state.type === 'all' || (c.types || []).includes(state.type);
const ICON = {
  share: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7h14v-7"/></svg>'
};
// 내 그룹 어딘가에 담긴 카페면 하트를 채움
// ♥ 그룹이나 직접 만든 그룹 어디든 담겨 있으면 하트를 채움 (카공·느좋은 후기로 자동이라 제외)
const isSaved = id => state.myLists.some(l => (l.kind === 'heart' || !l.kind) && l.items.includes(id));
// 내가 후기 쓴 카페: 지도 점은 노랗게, 핀엔 별 딱지, 목록엔 "내 후기"
async function refreshReviewed() {
  try { state.reviewed = new Set(await Reviews.reviewedIds()); } catch (e) { console.error(e); }
}
async function refreshMyLists() {
  if (!Reviews.me().profile) { state.myLists = []; return; }
  try { state.myLists = await Lists.mine(); } catch (e) { console.error(e); }
}
function paintHeart() {
  const b = document.querySelector('#detail .heart');
  if (!b || !state.open) return;
  const on = isSaved(state.open);
  b.classList.toggle('on', on);
  b.setAttribute('aria-pressed', on);
  b.setAttribute('aria-label', on ? '♥︎에 담겨 있어요' : '♥︎에 담기');
  b.textContent = on ? '♥\uFE0E' : '♡\uFE0E';
}
const currentList = () => state.myLists.find(l => l.id === state.group);

// 그룹을 보고 있을 때(내 그룹이거나 링크로 받은 그룹)는 그 카페들만 지도와 목록에
function groupView() {
  if (state.shared) return { kind: 'shared', title: Lists.label(state.shared), cafes: state.shared.cafes };
  if (state.group) {
    const l = currentList();
    return { kind: 'mine', title: l ? Lists.label(l) : '그룹', cafes: l ? state.groupCafes : [], list: l };
  }
  return null;
}

