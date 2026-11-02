// 내 프로필: 닉네임, 내 그룹 목록, 계정
window.Me = (() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  let lists = [];
  let painting = null;   // 색 고르는 중인 그룹 id

  // 색 점을 누르면 그 줄 아래에 팔레트. 맨 끝 +는 직접 색 고르기
  function paletteHTML(l) {
    const swatches = Lists.palette(lists).map(c =>
      `<button type="button" class="sw${c === l.color ? ' on' : ''}" style="--c:${esc(c)}" data-me="pick" data-id="${esc(l.id)}" data-color="${esc(c)}" aria-label="색 ${esc(c)}"></button>`).join('');
    return `<div class="pal">${swatches}
      <label class="sw add" aria-label="색 추가">+<input type="color" data-me-input="add" data-id="${esc(l.id)}" value="${esc(l.color)}"></label>
    </div>`;
  }

  function groupRow(l) {
    const open = painting === l.id;
    return `<li${open ? ' class="painting"' : ''}><div class="grow" style="--g:${esc(l.color)}">
      <button type="button" class="gdot" data-me="color" data-id="${esc(l.id)}" aria-label="${esc(l.name)} 색 바꾸기" aria-expanded="${open}"></button>
      <button type="button" class="gopen" data-me="group" data-id="${esc(l.id)}">
        <b class="gname">${esc(l.name)}</b>
        ${l.share_id ? '<em class="live">공유 중</em>' : ''}
        <span>${l.items.length}곳</span><i aria-hidden="true">›</i>
      </button>
    </div>${open ? paletteHTML(l) : ''}</li>`;
  }

  function repaint() {
    const body = $('#panel .w-body');
    const y = body?.scrollTop || 0;
    $('#panel').innerHTML = homeHTML();
    $('#panel .w-body').scrollTop = y;
  }

  async function paint(id, color) {
    const l = lists.find(x => x.id === id);
    if (!l) return;
    const before = l.color;
    l.color = color;
    repaint();
    try {
      await Lists.setColor(id, color);
      App.refreshMyLists();
    } catch (err) {
      console.error(err);
      l.color = before;
      repaint();
      Reviews.toast('색을 못 바꿨어요');
    }
  }

  function homeHTML() {
    const p = Reviews.me().profile;
    return `
      <header class="w-head">
        <button type="button" class="w-x" data-act="close" aria-label="닫기">×</button>
        <small>내 프로필</small>
        <div class="who">${Reviews.markHTML(p.mark)}<h2>${esc(p.nickname)}</h2>
          <button type="button" class="who-edit" data-me="edit">바꾸기</button></div>
      </header>
      <div class="w-body">
        <p class="w-group">내 그룹</p>
        <ul class="groups">${lists.map(groupRow).join('')}
          <li class="new-row">
            <input id="me-new" maxlength="20" placeholder="새 그룹 이름 (예: 성수 투어)" autocomplete="off" enterkeyhint="done">
            <button type="button" data-me="new">+ 만들기</button>
          </li>
        </ul>
        <ul class="menu">
          <li><button type="button" data-me="settings">설정<i aria-hidden="true">›</i></button></li>
        </ul>
      </div>`;
  }

  // ---------- 설정 ----------
  const FS_KEY = 'caffeine-fs';
  const SIZES = [['s', '작게'], ['m', '보통'], ['l', '크게'], ['xl', '아주 크게']];
  const currentFs = () => document.documentElement.dataset.fs || 'm';

  function setFs(v) {
    if (v === 'm') delete document.documentElement.dataset.fs;
    else document.documentElement.dataset.fs = v;
    try {
      if (v === 'm') localStorage.removeItem(FS_KEY);
      else localStorage.setItem(FS_KEY, v);
    } catch {}
  }

  function settingsHTML() {
    const member = !!Reviews.me().profile;
    const fs = currentFs();
    return `
      <header class="w-head has-back">
        ${member ? '<button type="button" class="w-back" data-me="home" aria-label="내 프로필로">‹</button>' : ''}
        <button type="button" class="w-x" data-act="close" aria-label="닫기">×</button>
        <small>${member ? '내 프로필' : '카페인 아카이브'}</small>
        <h2>설정</h2>
      </header>
      <div class="w-body">
        <p class="w-group">글씨 크기</p>
        <div class="seg" role="radiogroup" aria-label="글씨 크기">
          ${SIZES.map(([v, label]) => `<button type="button" role="radio" aria-checked="${fs === v}" class="seg-${v}${fs === v ? ' on' : ''}" data-me="fs" data-v="${v}">${label}</button>`).join('')}
        </div>
        <div class="fs-preview">
          <i class="tag tag-study">카공</i>
          <strong>벽돌커피</strong>
          <small>홍대입구역 도보 2분 · ★ 4.5 후기 2</small>
          <p>창가 바 자리가 제일 조용함. 콘센트는 테이블마다 있어.</p>
        </div>
        <p class="w-hint">이 기기에서만 바뀌어요.</p>
        ${member ? `
        <p class="w-group">계정</p>
        <ul class="menu">
          <li><button type="button" data-me="logout">로그아웃</button></li>
          <li><button type="button" class="danger" data-me="delete">탈퇴하기 (내 후기·그룹 전부 삭제)</button></li>
        </ul>` : ''}
      </div>`;
  }

  function settings() {
    Reviews.show(settingsHTML(), 'settings');
  }

  async function open() {
    if (!Reviews.me().profile) return Reviews.openAccount();
    painting = null;
    try { lists = await Lists.mine(); } catch (e) { console.error(e); lists = []; }
    Reviews.show(homeHTML(), 'me');
  }

  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-me]');
    if (!b || !$('#panel').contains(b)) return;
    const act = b.dataset.me;

    if (act === 'group') {
      Reviews.close();
      return App.openGroup(b.dataset.id);
    }
    if (act === 'edit') return Reviews.editProfile(open);
    if (act === 'settings') return settings();
    if (act === 'home') return open();
    if (act === 'fs') {
      setFs(b.dataset.v);
      $('#panel').innerHTML = settingsHTML();
      return;
    }
    if (act === 'color') {
      painting = painting === b.dataset.id ? null : b.dataset.id;
      return repaint();
    }
    if (act === 'pick') return paint(b.dataset.id, b.dataset.color);
    if (act === 'new') {
      const inp = $('#me-new');
      const name = inp.value.trim();
      if (!name) return inp.focus();
      b.disabled = true;
      try {
        await Lists.create(name);
        await App.refreshMyLists();
        await open();
        return Reviews.toast(`"${name}" 그룹 만들었어`);
      } catch (err) {
        console.error(err);
        b.disabled = false;
        const m = String(err?.message || '');
        return Reviews.toast(/too many lists/.test(m) ? '그룹은 30개까지 만들 수 있어요' : /permission|42501/.test(m + err?.code) ? 'DB 설정이 아직이에요 (lists.sql 다시 실행)' : '못 만들었어요. 잠시 뒤 다시 해 줘');
      }
    }
    if (act === 'logout') {
      await Reviews.logout();
      Reviews.close();
      return Reviews.toast('로그아웃했어요');
    }
    if (act === 'delete') {
      if (!confirm('탈퇴하면 계정과 지금까지 쓴 후기, 그룹이 전부 지워지고 되돌릴 수 없어요. 탈퇴할까요?')) return;
      try {
        await Reviews.deleteAccount();
        Reviews.close();
        Reviews.toast('탈퇴했어요');
      } catch (err) {
        console.error(err);
        alert('탈퇴하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      }
    }
  });

  // 입력칸에서 엔터(한글 조합 중이 아닐 때)도 만들기
  document.addEventListener('keydown', e => {
    if (e.target.id !== 'me-new' || e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    $('#panel [data-me="new"]')?.click();
  });

  document.addEventListener('change', e => {
    const inp = e.target.closest('[data-me-input="add"]');
    if (!inp || !$('#panel').contains(inp)) return;
    Lists.addColor(inp.value);
    paint(inp.dataset.id, inp.value.toLowerCase());
  });

  return { open, settings };
})();
