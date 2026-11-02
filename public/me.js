// 내 프로필: 닉네임, 내 그룹 목록, 계정
window.Me = (() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  let lists = [];

  function groupRow(l) {
    return `<li><button type="button" class="grow" data-me="group" data-id="${esc(l.id)}">
      <b class="gname${l.kind ? ' g-' + l.kind : ''}">${esc(l.name)}</b>
      ${l.share_id ? '<em class="live">공유 중</em>' : ''}
      <span>${l.items.length}곳</span><i aria-hidden="true">›</i>
    </button></li>`;
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
          <li><button type="button" class="grow new" data-me="new">+ 새 그룹</button></li>
        </ul>
        <p class="w-group">계정</p>
        <ul class="menu">
          <li><button type="button" data-me="logout">로그아웃</button></li>
          <li><button type="button" class="danger" data-me="delete">탈퇴하기 (내 후기·그룹 전부 삭제)</button></li>
        </ul>
      </div>`;
  }

  async function open() {
    if (!Reviews.me().profile) return Reviews.openAccount();
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
    if (act === 'new') {
      const name = prompt('새 그룹 이름 (20자까지)');
      if (!name?.trim()) return;
      try {
        await Lists.create(name);
        await App.refreshMyLists();
        return open();
      } catch (err) {
        console.error(err);
        return alert(/too many lists/.test(String(err?.message)) ? '그룹은 30개까지 만들 수 있어요.' : '못 만들었어요. 잠시 뒤 다시 해 줘.');
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

  return { open };
})();
