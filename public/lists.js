// 그룹: 카페를 모아 두는 폴더. 기본으로 카공·느좋이 있고, 링크로 공유할 수 있음
window.Lists = (() => {
  const LIVE = Reviews.live;
  const LS = 'caffeine-demo-lists';
  const MAX_NAME = 20;

  // 그룹 색: 기본 4색 + 사용자가 직접 추가한 색(이 기기에 저장) + 이미 그룹에 쓰고 있는 색
  const BASE_COLORS = ['#56622b', '#c2452d', '#d9a21b', '#2e6f66'];
  const COLOR_KEY = 'caffeine-colors';
  const HEX = /^#[0-9a-f]{6}$/;
  const customColors = () => { try { return (JSON.parse(localStorage.getItem(COLOR_KEY)) || []).filter(c => HEX.test(c)); } catch { return []; } };
  function addColor(c) {
    c = String(c).toLowerCase();
    if (!HEX.test(c)) return;
    const a = customColors().filter(x => x !== c);
    a.push(c);
    try { localStorage.setItem(COLOR_KEY, JSON.stringify(a.slice(-12))); } catch {}
  }
  function palette(lists = []) {
    return [...new Set([...BASE_COLORS, ...customColors(), ...lists.map(l => l.color).filter(Boolean)])];
  }
  // 색을 안 고른 그룹: 카공은 올리브, 느좋은 다홍, 나머지는 만든 순서대로 기본색 돌려 쓰기
  function colorOf(l, i = 0) {
    if (l?.color) return l.color;
    if (l?.kind === 'study') return BASE_COLORS[0];
    if (l?.kind === 'mood') return BASE_COLORS[1];
    return BASE_COLORS[(i + 2) % BASE_COLORS.length];
  }
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  // ---------- 데모 저장소 ----------
  const demo = {
    all() {
      let a;
      try { a = JSON.parse(localStorage.getItem(LS)); } catch {}
      if (!Array.isArray(a)) {
        a = [
          { id: 'd-study', name: '카공', kind: 'study', share_id: null, items: [] },
          { id: 'd-mood', name: '느좋', kind: 'mood', share_id: null, items: [] }
        ];
        demo.save(a);
      }
      return a;
    },
    save(a) { try { localStorage.setItem(LS, JSON.stringify(a)); } catch {} },
    edit(id, f) { const a = demo.all(); const l = a.find(x => x.id === id); if (l) f(l, a); demo.save(a); return l; }
  };

  // ---------- 데이터 ----------
  let ensured = false;

  async function mine() {
    if (!LIVE) return demo.all().map((l, i) => ({ ...l, color: colorOf(l, i) }));
    const db = await Reviews.db();
    if (!ensured) {
      const { error } = await db.rpc('ensure_default_lists');
      if (!error) ensured = true;
    }
    const { data, error } = await db.from('lists')
      .select('id,name,kind,color,share_id,created_at,list_items(cafe_id,added_at)')
      .order('created_at', { ascending: true });
    if (error) throw error;
    // 기본 그룹(카공·느좋)이 맨 앞
    const rank = l => l.kind === 'study' ? 0 : l.kind === 'mood' ? 1 : 2;
    return data
      .map(l => ({
        ...l,
        items: (l.list_items || []).sort((a, b) => b.added_at.localeCompare(a.added_at)).map(i => i.cafe_id)
      }))
      .sort((a, b) => rank(a) - rank(b))
      .map((l, i) => ({ ...l, color: colorOf(l, i) }));
  }

  async function create(name, color) {
    name = name.trim().slice(0, MAX_NAME);
    if (!color || !HEX.test(color)) color = BASE_COLORS[2 + Math.floor(Math.random() * 2)];
    if (!LIVE) {
      const a = demo.all();
      const l = { id: 'd-' + Date.now(), name, kind: null, color, share_id: null, items: [] };
      a.push(l); demo.save(a);
      return l;
    }
    const db = await Reviews.db();
    const { data, error } = await db.from('lists').insert({ name, color }).select('id,name,kind,color,share_id').single();
    if (error) throw error;
    return { ...data, items: [] };
  }

  async function rename(id, name) {
    name = name.trim().slice(0, MAX_NAME);
    if (!LIVE) return demo.edit(id, l => { l.name = name; });
    const db = await Reviews.db();
    const { error } = await db.from('lists').update({ name }).eq('id', id);
    if (error) throw error;
  }

  async function setColor(id, color) {
    color = String(color).toLowerCase();
    if (!HEX.test(color)) return;
    if (!LIVE) return demo.edit(id, l => { l.color = color; });
    const db = await Reviews.db();
    const { error } = await db.from('lists').update({ color }).eq('id', id);
    if (error) throw error;
  }

  async function remove(id) {
    if (!LIVE) { demo.save(demo.all().filter(l => l.id !== id)); return; }
    const db = await Reviews.db();
    const { error } = await db.from('lists').delete().eq('id', id);
    if (error) throw error;
  }

  async function add(listId, cafeId) {
    if (!LIVE) return demo.edit(listId, l => { if (!l.items.includes(cafeId)) l.items.unshift(cafeId); });
    const db = await Reviews.db();
    const { error } = await db.from('list_items').insert({ list_id: listId, cafe_id: cafeId });
    if (error && error.code !== '23505') throw error;
  }

  async function drop(listId, cafeId) {
    if (!LIVE) return demo.edit(listId, l => { l.items = l.items.filter(x => x !== cafeId); });
    const db = await Reviews.db();
    const { error } = await db.from('list_items').delete().eq('list_id', listId).eq('cafe_id', cafeId);
    if (error) throw error;
  }

  async function share(id) {
    if (!LIVE) {
      let sid;
      demo.edit(id, l => { l.share_id = l.share_id || Math.random().toString(36).slice(2, 12); sid = l.share_id; });
      return sid;
    }
    const db = await Reviews.db();
    const { data, error } = await db.rpc('share_list', { p_list: id });
    if (error) throw error;
    return data;
  }

  async function unshare(id) {
    if (!LIVE) return demo.edit(id, l => { l.share_id = null; });
    const db = await Reviews.db();
    const { error } = await db.rpc('unshare_list', { p_list: id });
    if (error) throw error;
  }

  // 링크로 받은 그룹. 데모에서는 같은 브라우저 안에서만 열림
  async function shared(sid) {
    if (!LIVE) {
      const l = demo.all().find(x => x.share_id === sid);
      if (!l) return null;
      const p = Reviews.me().profile;
      return { name: l.name, color: l.color, nickname: p?.nickname || '누군가', mark: p?.mark || 1, cafes: await Cafes.byIds(l.items) };
    }
    const db = await Reviews.db();
    const { data, error } = await db.rpc('get_shared_list', { p_share: sid });
    if (error) throw error;
    return data;
  }

  // 데모에서만: 후기의 카공·느좋 선택을 기본 그룹에 반영 (Supabase는 DB 트리거가 함)
  function syncFromReview(cafeId, before, after) {
    if (LIVE) return;
    const a = demo.all();
    ['study', 'mood'].forEach(k => {
      const had = before.includes(k), has = after.includes(k);
      if (had === has) return;
      const l = a.find(x => x.kind === k);
      if (!l) return;
      l.items = has ? [cafeId, ...l.items.filter(x => x !== cafeId)] : l.items.filter(x => x !== cafeId);
    });
    demo.save(a);
  }

  // ---------- 링크 ----------
  const linkTo = params => {
    const u = new URL(location.origin + location.pathname);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
    return u.toString();
  };

  // 휴대폰이면 공유 창, 아니면 링크 복사
  async function sendLink(url, title) {
    if (navigator.share) {
      try { await navigator.share({ title, url }); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      Reviews.toast('링크 복사했어요');
    } catch {
      prompt('이 링크를 복사해 줘', url);
    }
  }

  // ---------- 담기 창 ----------
  let picking = null;     // { cafe, lists, onChange }

  function pickerHTML() {
    const { cafe, lists } = picking;
    const rows = lists.map(l => {
      const on = l.items.includes(cafe.id);
      return `<li><button type="button" class="pick${on ? ' on' : ''}" data-list-act="toggle" data-id="${esc(l.id)}" aria-pressed="${on}" style="--g:${esc(l.color || '#211a15')}">
        <i class="box"></i><b>${esc(l.name)}</b><small>${l.items.length}곳</small>
      </button></li>`;
    }).join('');
    return `
      <header class="w-head">
        <button type="button" class="w-x" data-act="close" aria-label="닫기">×</button>
        <small>그룹에 담기</small>
        <h2>${esc(cafe.name)}</h2>
      </header>
      <div class="w-body">
        <ul class="picks">${rows}</ul>
        <div class="new-list">
          <input id="new-list" maxlength="${MAX_NAME}" placeholder="새 그룹 이름 (예: 성수 투어)" autocomplete="off">
          <button type="button" data-list-act="create">만들기</button>
        </div>
        <p class="w-err" hidden></p>
      </div>
      <footer class="w-foot">
        <button type="button" class="w-send" data-act="close">다 됐어</button>
      </footer>`;
  }

  async function openPicker(cafe, onChange) {
    const lists = await mine();
    picking = { cafe, lists, onChange };
    Reviews.show(pickerHTML(), 'picker');
  }

  function repaint() {
    const scroll = $('#panel .w-body')?.scrollTop || 0;
    $('#panel').innerHTML = pickerHTML();
    $('#panel .w-body').scrollTop = scroll;
  }

  function fail(msg) {
    const e = $('#panel .w-err');
    if (!e) return Reviews.toast(msg);
    e.textContent = msg;
    e.hidden = false;
  }

  function explain(err) {
    const m = String(err?.message || err);
    if (/too many lists/.test(m)) return '그룹은 30개까지 만들 수 있어요.';
    if (/list is full/.test(m)) return '그룹 하나에 500곳까지 담을 수 있어요.';
    return '저장하지 못했어요. 잠시 뒤 다시 해 줘.';
  }

  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-list-act]');
    if (!b || !picking || !$('#panel').contains(b)) return;
    const { cafe, lists } = picking;

    if (b.dataset.listAct === 'toggle') {
      const l = lists.find(x => x.id === b.dataset.id);
      const on = l.items.includes(cafe.id);
      b.disabled = true;
      try {
        if (on) { await drop(l.id, cafe.id); l.items = l.items.filter(x => x !== cafe.id); }
        else { await add(l.id, cafe.id); l.items.unshift(cafe.id); }
        repaint();
        picking.onChange?.();
      } catch (err) { console.error(err); fail(explain(err)); b.disabled = false; }
    }

    if (b.dataset.listAct === 'create') {
      const name = $('#new-list').value.trim();
      if (!name) return $('#new-list').focus();
      b.disabled = true;
      try {
        const l = await create(name);
        await add(l.id, cafe.id);
        l.items = [cafe.id];
        lists.push({ ...l, color: colorOf(l, lists.length) });
        repaint();
        picking.onChange?.();
      } catch (err) { console.error(err); fail(explain(err)); b.disabled = false; }
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'new-list') {
      e.preventDefault();
      $('#panel [data-list-act="create"]')?.click();
    }
  });

  return { live: LIVE, BASE_COLORS, palette, addColor, colorOf, setColor, syncFromReview, mine, create, rename, remove, add, drop, share, unshare, shared, linkTo, sendLink, openPicker };
})();
