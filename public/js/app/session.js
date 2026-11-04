// 주소에 붙어 오는 것들
//   ?cafe=id   공유받은 카페 열기
//   ?list=sid  공유받은 그룹 열기
//   ?write=id  카카오 로그인에서 돌아옴 → 쓰던 후기 이어서
//   ?save=id   카카오 로그인에서 돌아옴 → ♥︎ 담기 이어서
//   ?group=1   카카오 로그인에서 돌아옴 → 그룹 화면으로
async function resumeWrite() {
  const p = new URL(location.href).searchParams;
  await Reviews.ready;
  if (location.search) history.replaceState(null, '', location.pathname + location.hash);
  const write = p.get('write'), save = p.get('save'), cafe = p.get('cafe'), list = p.get('list');
  if (list) await openShared(list);
  if (write) return startWrite(write);
  if (save) {
    await openCafe(save);
    return saveCafe(save);
  }
  if (p.get('group')) return Me.open();
  if (cafe) return openCafe(cafe);
  if (Reviews.me().user && !Reviews.me().profile) Reviews.openAccount();
}

// 상단 내 계정 버튼
function paintMe({ user, profile }) {
  const b = $('#me');
  b.classList.toggle('in', !!user);
  b.innerHTML = profile ? Reviews.markHTML(profile.mark) : user ? '이름을 정해요' : '로그인';
  b.setAttribute('aria-label', profile ? `내 프로필: ${profile.nickname}` : '로그인');
}
Reviews.onChange(async s => {
  paintMe(s);
  await Promise.all([refreshMyLists(), refreshReviewed()]);
  drawMap();
  renderList();
  if (state.group && !s.profile) closeGroup();
  else if (state.group) openGroup(state.group, { fit: false, sheet: false });
  if (state.open) openCafe(state.open);
});
// 닉네임까지 있으면 내 프로필(그룹·설정), 아니면 로그인이나 닉네임 정하기
$('#me').addEventListener('click', () => Reviews.me().profile ? Me.open() : Reviews.openAccount());

window.App = { openGroup, refreshMyLists, myLists: () => state.myLists };

