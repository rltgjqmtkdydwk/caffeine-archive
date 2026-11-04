// ---------- 목록 ----------

function listCafes() {
  const g = groupView();
  if (g) return { title: g.title, rows: g.cafes, keepOrder: true };
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
    : '아직 후기가 없어요';
  return `<li><button type="button" class="item${c.types?.length ? '' : ' plain'}" data-id="${esc(c.id)}">
    ${(c.types || []).map(t => `<i class="tag tag-${TYPES[t]?.key}">${esc(t)}</i>`).join('')}${state.reviewed.has(c.id) ? '<i class="tag tag-mine">내 후기</i>' : ''}
    <strong>${esc(c.name)}</strong>
    <small>${where}${where ? ' · ' : ''}${score}</small>
    ${c.note ? `<p>${esc(c.note)}</p>` : ''}
  </button></li>`;
}

function renderList() {
  const { title, rows, keepOrder } = listCafes();
  const sorted = keepOrder ? rows : sortRows(rows);
  $('#count').textContent = `${title} ${rows.length}${rows.length >= 500 ? '+' : ''}곳`;

  let html = sorted.slice(0, LIST_MAX).map(itemHTML).join('');
  if (rows.length > LIST_MAX) html += `<li class="more">나머지 ${rows.length - LIST_MAX}곳은 지도에서 콕 눌러 보세요</li>`;
  if (!rows.length && groupView()) {
    html = '<li class="empty">아직 비어 있어요. 카페를 열고 ♥︎를 눌러 담아 보세요.</li>';
  } else if (!rows.length) {
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
  const g = groupView();
  input.hidden = !!g;
  if (g) {
    if (g.kind === 'shared') {
      const sh = state.shared;
      box.innerHTML = `<button type="button" class="chip chip-back" data-g="close-shared"${sh.color ? ` style="--g:${esc(sh.color)}"` : ''}>‹ ${Reviews.markHTML(sh.mark)}${esc(sh.nickname || '누군가')}의 ${esc(Lists.label(sh))}</button>
        <button type="button" class="chip chip-act" data-g="copy">내 그룹으로 담기</button>`;
      return;
    }
    const l = g.list;
    box.innerHTML = `<button type="button" class="chip chip-back" data-g="close-group"${l?.color ? ` style="--g:${esc(l.color)}"` : ''}>‹ ${esc(g.title)}</button>` + (l ? `
      <button type="button" class="chip chip-act" data-g="share">${l.share_id ? '링크 다시 보내기' : '링크 공유'}</button>
      ${l.share_id ? '<button type="button" class="chip chip-ghost" data-g="unshare">공유 끄기</button>' : ''}
      ${l.kind ? '' : '<button type="button" class="chip chip-ghost" data-g="rename">이름 바꾸기</button><button type="button" class="chip chip-ghost danger" data-g="delete">지우기</button>'}` : '');
    return;
  }
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
  state.shared = null;
  state.group = null;
  document.querySelectorAll('.mode button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  render();
}

