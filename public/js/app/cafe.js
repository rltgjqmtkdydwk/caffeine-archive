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
  const kakao = `https://map.kakao.com/link/search/${q}`;
  const naver = `https://map.naver.com/p/search/${q}`;
  // 영업시간은 데이터에 없으면 카카오맵으로 넘김
  const hours = c.hours
    ? esc(c.hours)
    : `<a class="ext" href="${kakao}" target="_blank" rel="noopener">카카오맵에서 보기</a>`;
  const saved = isSaved(c.id);
  const rows = [
    s && ['역', esc(`${s.name}역${c.walk ? ` 도보 ${c.walk}분` : ''}`)],
    c.address && ['주소', esc(c.address)],
    ['영업', hours],
    c.tags?.length && ['특징', esc(c.tags.join(', '))]
  ].filter(Boolean);

  const d = $('#detail');
  d.innerHTML = `
    <button type="button" class="x" aria-label="닫기">×</button>
    <div class="dhead">
      <div class="dname">
        ${(c.types || []).map(t => `<i class="tag tag-${TYPES[t]?.key}">${esc(t)}</i>`).join('')}
        <h2>${esc(c.name)}</h2>
      </div>
      <div class="dicons">
        <button type="button" class="ic heart${saved ? ' on' : ''}" data-cafe-act="save" aria-pressed="${saved}" aria-label="${saved ? '♥︎에 담겨 있어요' : '♥︎에 담기'}">${saved ? '♥\uFE0E' : '♡\uFE0E'}</button>
        <button type="button" class="ic" data-cafe-act="share" aria-label="링크 공유">${ICON.share}</button>
      </div>
    </div>
    <dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>
    ${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}
    ${c.sample ? '<p class="sample">예시 데이터예요. 실제 카페로 바꿔 주세요.</p>' : ''}
    ${!c.types?.length ? '<p class="untagged">아직 카공인지 느좋인지 몰라요. 다녀왔다면 후기로 알려 주세요.</p>' : ''}
    ${isAdmin() ? adminHTML(c) : ''}
    <section class="rv" id="rv"><p class="rv-none">후기 불러오는 중</p></section>
    <button type="button" class="write-btn" id="write-btn">이 카페 후기 남기기</button>
    <div class="go">
      <a href="${kakao}" target="_blank" rel="noopener">카카오맵</a>
      <a href="${naver}" target="_blank" rel="noopener">네이버 지도</a>
    </div>`;
  Reviews.fillSummary(c.id, $('#rv'), $('#write-btn'));
  d.hidden = false;
  d.scrollTop = 0;
  setSheet('peek');
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
  refreshMyLists().then(paintHeart);
  await refreshReviewed();
  if (state.group) openGroup(state.group, { fit: false, sheet: false });
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

