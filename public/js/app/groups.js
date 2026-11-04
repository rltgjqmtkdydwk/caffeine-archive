// ---------- 그룹 ----------

// 내 프로필에서 그룹을 고르면 지도에 그 그룹 카페만
async function openGroup(id, { fit = true, sheet = true } = {}) {
  await refreshMyLists();
  state.group = id;
  state.shared = null;
  state.results = null;
  state.station = 'all';
  if (fit) closeCafe(false);
  const l = currentList();
  try { state.groupCafes = l ? remember(await Cafes.byIds(l.items)) : []; } catch (e) { console.error(e); state.groupCafes = []; }
  if (sheet) setSheet('half');
  render();
  // 목록이 절반 올라온 뒤에 맞춰야 핀이 목록 뒤에 안 숨음
  if (fit && state.groupCafes.length) setTimeout(() => fitTo(state.groupCafes, 16), 300);
}

function closeGroup() {
  state.group = null;
  state.groupCafes = [];
  render();
}

async function openShared(sid) {
  try {
    const data = await Lists.shared(sid);
    if (!data) { Reviews.toast('공유가 꺼졌거나 없는 그룹이에요'); return; }
    state.shared = { ...data, cafes: remember(data.cafes || []) };
    closeCafe(false);
    render();
    if (state.shared.cafes.length) fitTo(state.shared.cafes, 16);
  } catch (e) { console.error(e); Reviews.toast('그룹을 못 열었어요'); }
}

function closeShared() {
  state.shared = null;
  render();
}

async function onGroupAction(act) {
  const l = currentList();
  try {
    if (act === 'share' && l) {
      const sid = await Lists.share(l.id);
      l.share_id = sid;
      render();
      return Lists.sendLink(Lists.linkTo({ list: sid }), `카페인 아카이브 · ${Lists.label(l)}`,
        `제가 모은 카페 그룹 "${Lists.label(l)}"이에요. ${l.items.length}곳 담겨 있어요.`);
    }
    if (act === 'unshare' && l) {
      if (!confirm('공유를 끌까요? 보냈던 링크는 더 이상 안 열려요.')) return;
      await Lists.unshare(l.id);
      l.share_id = null;
      return render();
    }
    if (act === 'rename' && l) {
      const name = prompt('그룹 이름', l.name);
      if (!name?.trim() || name.trim() === l.name) return;
      await Lists.rename(l.id, name);
      return openGroup(l.id, { fit: false, sheet: false });
    }
    if (act === 'delete' && l) {
      if (!confirm(`"${l.name}" 그룹을 지울까요? 담긴 카페 목록도 같이 없어져요.`)) return;
      await Lists.remove(l.id);
      await refreshMyLists();
      return closeGroup();
    }
    if (act === 'copy' && state.shared) {
      const sh = state.shared;
      return Reviews.member({ list: new URL(location.href).searchParams.get('list') || '' }, async () => {
        const made = await Lists.create(Lists.label(sh));
        for (const c of sh.cafes) await Lists.add(made.id, c.id);
        state.shared = null;
        Reviews.toast('내 그룹에 담았어요');
        await openGroup(made.id);
      });
    }
    if (act === 'close-shared') return closeShared();
    if (act === 'close-group') return closeGroup();
  } catch (e) {
    console.error(e);
    const m = String(e?.message || e);
    alert(/too many lists/.test(m) ? '그룹은 30개까지 만들 수 있어요.' : '처리하지 못했어요. 잠시 뒤 다시 해 주세요.');
  }
}

// ♥︎: 아직 아무 데도 안 담긴 카페면 ♥ 그룹에 바로 담고, 담기 창에서 다른 그룹도 고르게
function saveCafe(id) {
  const c = state.cache.get(id);
  if (!c) return;
  Reviews.member({ save: id }, () => Lists.openPicker(c, async () => {
    await refreshMyLists();
    paintHeart();
    if (state.group) openGroup(state.group, { fit: false, sheet: false });
  }, { heartFirst: true }));
}

function shareCafe(id) {
  const c = state.cache.get(id);
  if (!c) return;
  const s = stationById(c.station_id);
  const where = s ? ` (${s.name}역${c.walk ? ` 도보 ${c.walk}분` : ''})` : '';
  const kind = c.types?.length ? ` ${c.types.join('·')} 카페예요.` : '';
  Lists.sendLink(Lists.linkTo({ cafe: id }), `${c.name} · 카페인 아카이브`, `${c.name}${where}.${kind} 카페인 아카이브에서 봐요.`);
}

