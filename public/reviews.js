// 후기와 계정: 카카오 로그인(Supabase), 사이트 전용 프로필, 후기 요약, 작성 폼
window.Reviews = (() => {
  const CFG = window.CAFE_CONFIG || {};
  const LIVE = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);
  const KEY = { reviews: 'caffeine-demo-reviews', user: 'caffeine-demo-user' };

  const STAR_WORDS = ['', '별로', '아쉬움', '괜찮음', '좋음', '또 갈 곳'];
  const MARKS = 8;
  const NICK_RE = /^[가-힣a-zA-Z0-9_.]{2,12}$/;

  const STYLES = [
    ['minimal', '미니멀'], ['wood', '우드·내추럴'], ['vintage', '빈티지'], ['retro', '레트로'],
    ['industrial', '인더스트리얼'], ['plants', '식물 가득'], ['hanok', '한옥·전통'],
    ['gallery', '갤러리·작품'], ['cozy', '아늑한 굴']
  ];

  // 질문 목록. rating만 필수, 나머지는 선택
  const Q = [
    { k: 'good_for', label: '여기 뭐 하기 좋아?', multi: 2, big: true, note: '고르면 내 그룹에도 담겨', opts: [['study', '카공'], ['mood', '느좋']] },
    { group: '공간' },
    { k: 'seats', label: '자리 수', opts: [[1, '10석 안쪽'], [2, '10–30석'], [3, '30–60석'], [4, '60석 넘게']] },
    { k: 'noise', label: '소음', opts: [[1, '도서관'], [2, '잔잔'], [3, '대화 소리'], [4, '시끌벅적']] },
    { k: 'outlets', label: '콘센트', opts: [[1, '거의 없음'], [2, '몇 자리'], [3, '넉넉']] },
    { group: '시간' },
    { k: 'time_limit', label: '이용 시간 제한', opts: [[0, '없음'], [2, '2시간'], [3, '3시간'], [4, '4시간 이상']] },
    { k: 'close_at', label: '마감', opts: [[1, '9시 전'], [2, '10시'], [3, '11시'], [4, '자정'], [5, '새벽·24시']] },
    { group: '메뉴' },
    { k: 'dessert', label: '디저트 종류', opts: [[0, '없음'], [1, '1–3개'], [2, '4–9개'], [3, '10개 이상']] },
    { k: 'roasting', label: '원두 로스팅', opts: [[true, '직접 볶음'], [false, '아님']] },
    { group: '분위기' },
    { k: 'quirk', label: '개성', opts: [[1, '무난함'], [2, '개성 있음'], [3, '여긴 진짜 특이함']] },
    { k: 'styles', label: '추구미', multi: 2, note: '2개까지', opts: STYLES }
  ];
  const QS = Q.filter(q => q.k);
  const MAX_TEXT = 300;

  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const labelOf = (q, v) => (q.opts.find(([x]) => x === v) || [])[1];
  const mark = n => `<i class="mk mk-${Number(n) || 1}" aria-hidden="true"></i>`;
  const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);

  const ls = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} }
  };

  // ---------- 연결 ----------
  let sb = null;
  const ready = !LIVE ? Promise.resolve() : new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    s.onload = () => {
      sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
        auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' }
      });
      res();
    };
    s.onerror = rej;
    document.head.appendChild(s);
  });

  // ---------- 계정 ----------
  let user = null;     // { id }  카카오로 로그인했는지만 앎
  let profile = null;  // { nickname, mark }  이 사이트에서만 쓰는 이름
  const listeners = [];
  const emit = () => listeners.forEach(f => f({ user, profile }));

  async function fetchProfile() {
    const { data } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
    return data;
  }

  const inited = (async () => {
    await ready;
    if (!LIVE) {
      const u = ls.get(KEY.user, null);
      user = u ? { id: 'demo' } : null;
      profile = u?.profile || null;
    } else {
      const { data: { session } } = await sb.auth.getSession();
      user = session?.user ? { id: session.user.id } : null;
      profile = user ? await fetchProfile() : null;
      sb.auth.onAuthStateChange((_ev, s) => {
        const id = s?.user?.id || null;
        if (id === (user?.id || null)) return;
        // 콜백 안에서 바로 쿼리하면 막힐 수 있어서 한 박자 미룸
        setTimeout(async () => {
          user = id ? { id } : null;
          profile = user ? await fetchProfile() : null;
          emit();
        });
      });
    }
    emit();
  })().catch(console.error);

  // 카카오 로그인. 돌아올 때 ?write=카페id 로 와서 바로 쓰던 후기를 이어감
  // 로그인이 필요한 다른 기능(그룹 담기 등)이 돌아올 곳과 이어서 할 일
  let loginReturn = null;
  let afterLogin = null;

  async function login(cafeId) {
    if (!LIVE) {
      ls.set(KEY.user, { profile: null });
      user = { id: 'demo' };
      profile = null;
      emit();
      return true;
    }
    const back = new URL(location.href);
    back.search = '';
    back.hash = '';
    if (loginReturn) Object.entries(loginReturn).forEach(([k, v]) => back.searchParams.set(k, v));
    else if (cafeId) back.searchParams.set('write', cafeId);
    const { error } = await sb.auth.signInWithOAuth({ provider: 'kakao', options: { redirectTo: back.toString() } });
    if (error) throw error;
    return false;
  }

  async function saveProfile(p) {
    if (!LIVE) {
      ls.set(KEY.user, { profile: p });
    } else {
      const { error } = await sb.from('profiles').upsert({ id: user.id, ...p });
      if (error) throw error;
    }
    profile = { ...profile, ...p };
    emit();
  }

  async function logout() {
    if (!LIVE) ls.del(KEY.user);
    else await sb.auth.signOut();
    user = null;
    profile = null;
    emit();
  }

  async function deleteAccount() {
    if (!LIVE) {
      ls.set(KEY.reviews, ls.get(KEY.reviews, []).filter(r => r.user_id !== 'demo'));
      ls.del(KEY.user);
    } else {
      const { error } = await sb.rpc('delete_me');
      if (error) throw error;
      await sb.auth.signOut();
    }
    user = null;
    profile = null;
    emit();
  }

  // ---------- 후기 ----------
  const demoRows = () => ls.get(KEY.reviews, []).map(r =>
    r.user_id === 'demo' ? { ...r, nickname: profile?.nickname, mark: profile?.mark } : r);

  async function listFor(cafeId) {
    await ready;
    if (!LIVE) {
      return demoRows().filter(r => r.cafe_id === cafeId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    const { data, error } = await sb.from('reviews_public').select('*')
      .eq('cafe_id', cafeId).order('created_at', { ascending: false }).limit(300);
    if (error) throw error;
    return data;
  }

  // 카페별 후기 수와 평균 별점
  async function stats() {
    await ready;
    let rows = demoRows();
    if (LIVE) {
      const { data, error } = await sb.from('reviews_public').select('cafe_id, rating').limit(10000);
      if (error) throw error;
      rows = data;
    }
    const m = {};
    rows.forEach(r => {
      const s = m[r.cafe_id] || (m[r.cafe_id] = { n: 0, sum: 0 });
      s.n += 1;
      s.sum += r.rating;
    });
    Object.values(m).forEach(s => { s.avg = s.sum / s.n; });
    return m;
  }

  async function mine(cafeId) {
    await inited;
    if (!user) return null;
    if (!LIVE) return ls.get(KEY.reviews, []).find(r => r.cafe_id === cafeId && r.user_id === 'demo') || null;
    const { data } = await sb.from('reviews').select('*').eq('cafe_id', cafeId).eq('user_id', user.id).maybeSingle();
    return data;
  }

  async function save(cafeId, row) {
    const now = new Date().toISOString();
    if (!LIVE) {
      const all = ls.get(KEY.reviews, []);
      const i = all.findIndex(r => r.cafe_id === cafeId && r.user_id === 'demo');
      const prev = all[i];
      const rec = { ...row, cafe_id: cafeId, user_id: 'demo', id: prev?.id || Date.now(), created_at: prev?.created_at || now, updated_at: now };
      if (i >= 0) all[i] = rec; else all.push(rec);
      ls.set(KEY.reviews, all);
      window.Lists?.syncFromReview(cafeId, prev?.good_for || [], row.good_for || []);
      return;
    }
    const { error } = await sb.from('reviews')
      .upsert({ ...row, cafe_id: cafeId, user_id: user.id, updated_at: now }, { onConflict: 'cafe_id,user_id' });
    if (error) throw error;
  }

  async function remove(cafeId) {
    if (!LIVE) {
      ls.set(KEY.reviews, ls.get(KEY.reviews, []).filter(r => !(r.cafe_id === cafeId && r.user_id === 'demo')));
      return;
    }
    const { error } = await sb.from('reviews').delete().eq('cafe_id', cafeId).eq('user_id', user.id);
    if (error) throw error;
  }

  // ---------- 요약 ----------
  function when(iso) {
    const d = new Date(iso);
    const days = Math.floor((Date.now() - d) / 864e5);
    if (days < 1) return '오늘';
    if (days < 2) return '어제';
    if (days < 30) return `${days}일 전`;
    return `${String(d.getFullYear()).slice(2)}.${d.getMonth() + 1}.${d.getDate()}`;
  }

  function tally(vals) {
    const m = new Map();
    vals.forEach(v => m.set(v, (m.get(v) || 0) + 1));
    return [...m].sort((a, b) => b[1] - a[1]);
  }

  function summaryHTML(rows) {
    if (!rows.length) return '<p class="rv-none">아직 후기가 없어요. 다녀왔다면 첫 후기를 남겨 주세요.</p>';

    const avg = rows.reduce((a, r) => a + r.rating, 0) / rows.length;
    const dist = [5, 4, 3, 2, 1].map(n => [n, rows.filter(r => r.rating === n).length]);
    let h = `<div class="rv-top">
      <b class="rv-avg"><span>★</span>${avg.toFixed(1)}</b>
      <div class="rv-dist">${dist.map(([n, c]) =>
        `<span><small>${n}</small><i style="width:${Math.round(c / rows.length * 100)}%"></i></span>`).join('')}</div>
      <small class="rv-n">후기 ${rows.length}</small>
    </div>`;

    const study = rows.filter(r => r.good_for?.includes('study')).length;
    const mood = rows.filter(r => r.good_for?.includes('mood')).length;
    if (study || mood) {
      h += `<div class="rv-split">
        ${study ? `<span class="s-study" style="flex:${study}">카공 ${study}</span>` : ''}
        ${mood ? `<span class="s-mood" style="flex:${mood}">느좋 ${mood}</span>` : ''}
      </div>`;
    }

    const lines = [];
    QS.filter(q => !q.multi).forEach(q => {
      const vals = rows.map(r => r[q.k]).filter(v => v !== null && v !== undefined);
      if (!vals.length) return;
      const [[top, n]] = tally(vals);
      let val = esc(labelOf(q, top));
      if (q.k === 'noise') {
        const a = Math.round(vals.reduce((x, y) => x + y, 0) / vals.length);
        val = `<span class="meter">${[1, 2, 3, 4].map(i => `<i${i <= a ? ' class="on"' : ''}></i>`).join('')}</span>${esc(labelOf(q, a))}`;
      }
      lines.push(`<dt>${esc(q.label)}</dt><dd>${val}${vals.length > 1 && q.k !== 'noise' ? ` <em>${n}/${vals.length}</em>` : ''}</dd>`);
    });
    const st = tally(rows.flatMap(r => r.styles || [])).slice(0, 3);
    if (st.length) {
      const q = QS.find(x => x.k === 'styles');
      lines.push(`<dt>추구미</dt><dd>${st.map(([k, n]) => `${esc(labelOf(q, k))}${n > 1 ? ` <em>${n}</em>` : ''}`).join(' · ')}</dd>`);
    }
    if (lines.length) h += `<dl class="rv-facts">${lines.join('')}</dl>`;

    h += `<ul class="rv-words">${rows.slice(0, 30).map(r => `<li>
      <div class="rv-who">${mark(r.mark)}<b>${esc(r.nickname || '탈퇴한 사람')}</b><span class="rv-stars">${stars(r.rating)}</span><small>${when(r.created_at)}</small></div>
      ${r.body ? `<p>${esc(r.body)}</p>` : ''}
    </li>`).join('')}</ul>`;
    return h;
  }

  async function fillSummary(cafeId, box, btn) {
    try {
      const [rows, my] = await Promise.all([listFor(cafeId), mine(cafeId)]);
      if (!box.isConnected) return;
      box.innerHTML = summaryHTML(rows);
      if (btn) btn.textContent = my ? '내 후기 고치기' : '이 카페 후기 남기기';
    } catch (e) {
      console.error(e);
      if (box.isConnected) box.innerHTML = '<p class="rv-none">후기를 불러오지 못했어요.</p>';
    }
  }

  // ---------- 패널 (로그인 / 프로필 / 후기 쓰기) ----------
  const panel = () => $('#panel');
  let view = null;      // 'login' | 'profile' | 'form'
  let current = null;   // 후기 쓰는 카페
  let onDone = null;
  let afterProfile = null;
  let draft = {};
  let pDraft = {};

  function show(html, name) {
    view = name;
    const p = panel();
    p.innerHTML = html;
    p.hidden = false;
    p.querySelector('.w-body')?.scrollTo(0, 0);
  }
  function close() {
    panel().hidden = true;
    view = null;
  }

  function head(kicker, title) {
    return `<header class="w-head">
      <button type="button" class="w-x" data-act="close" aria-label="닫기">×</button>
      <small>${kicker}</small>
      <h2>${title}</h2>
    </header>`;
  }

  function showLogin(cafe) {
    current = cafe;
    loginReturn = null;
    afterLogin = null;
    show(`
      ${head('로그인', '카카오로 들어오기')}
      <div class="w-body">
        <ul class="promise">
          <li>카카오 계정은 <b>같은 사람인지 알아보는 데만</b> 써요.</li>
          <li>카카오 이름, 프로필 사진, 이메일은 이 사이트에 보이지 않고 저장도 안 해요.</li>
          <li>후기에는 다음 화면에서 직접 정하는 <b>닉네임과 표시</b>만 나가요.</li>
          <li>탈퇴하면 계정과 후기가 전부 지워져요.</li>
        </ul>
        ${LIVE ? '' : '<p class="w-demo">데모 모드라 실제 카카오 대신 이 브라우저에 가짜 계정을 만들어요.</p>'}
      </div>
      <footer class="w-foot">
        <p class="w-err" hidden></p>
        <button type="button" class="kakao" data-act="login">
          <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path fill="currentColor" d="M12 3C6.5 3 2 6.5 2 10.8c0 2.8 1.9 5.2 4.7 6.6l-1 3.6c-.1.3.3.6.6.4l4.2-2.8c.5.1 1 .1 1.5.1 5.5 0 10-3.5 10-7.9S17.5 3 12 3z"/></svg>
          카카오로 계속하기
        </button>
      </footer>`, 'login');
  }

  function suggestNick() {
    const a = ['졸린', '느긋한', '새벽의', '조용한', '바쁜', '수줍은', '단골', '떠도는', '진한', '연한'];
    const b = ['라떼', '콜드브루', '아인슈페너', '플랫화이트', '카푸치노', '에스프레소', '드립', '디카페인', '아포가토', '모카'];
    const pick = l => l[Math.floor(Math.random() * l.length)];
    return `${pick(a)}${pick(b)}${Math.floor(Math.random() * 90 + 10)}`.slice(0, 12);
  }

  function showProfile(next) {
    afterProfile = next || null;
    const first = !profile;
    pDraft = { nickname: profile?.nickname || suggestNick(), mark: profile?.mark || Math.ceil(Math.random() * MARKS) };
    show(`
      ${head(first ? '처음 한 번만' : '내 프로필', first ? '여기서 쓸 이름 정하기' : esc(profile.nickname))}
      <div class="w-body">
        <p class="w-hint">후기 옆에 붙는 건 이 닉네임과 표시뿐이에요. 카카오에서 쓰는 이름과 다르게 지으면 누가 썼는지 아무도 몰라요.</p>
        <label class="w-label" for="nick">닉네임 <small>2–12자, 한글·영문·숫자</small></label>
        <div class="nick">
          <input id="nick" maxlength="12" autocomplete="off" value="${esc(pDraft.nickname)}">
          <button type="button" data-act="reroll">다른 이름</button>
        </div>
        <p class="w-label" style="margin-top:19px">표시</p>
        <div class="marks">${Array.from({ length: MARKS }, (_, i) =>
          `<button type="button" data-act="mark" data-v="${i + 1}" class="${pDraft.mark === i + 1 ? 'on' : ''}" aria-label="표시 ${i + 1}">${mark(i + 1)}</button>`).join('')}</div>
        ${first ? '' : `
          <div class="acct">
            <button type="button" data-act="logout">로그아웃</button>
            <button type="button" data-act="delete-account" class="danger">탈퇴하기 (내 후기도 전부 삭제)</button>
          </div>`}
      </div>
      <footer class="w-foot">
        <p class="w-err" hidden></p>
        <button type="button" class="w-send" data-act="save-profile">${first ? '이걸로 할게요' : '저장'}</button>
      </footer>`, 'profile');
  }

  function optHTML(q, [v, label]) {
    const on = q.multi ? (draft[q.k] || []).includes(v) : draft[q.k] === v;
    const tone = q.k === 'good_for' ? ` o-${v}` : '';
    return `<button type="button" class="opt${tone}${on ? ' on' : ''}" aria-pressed="${on}" data-act="opt" data-k="${q.k}" data-v='${esc(JSON.stringify(v))}'>${esc(label)}</button>`;
  }

  function starsHTML() {
    const r = draft.rating || 0;
    return `<div class="w-stars" role="radiogroup" aria-label="별점">
      ${[1, 2, 3, 4, 5].map(n => `<button type="button" role="radio" aria-checked="${r === n}" aria-label="${n}점" data-act="star" data-v="${n}" class="${n <= r ? 'on' : ''}">★</button>`).join('')}
      <span class="w-star-word">${r ? `${r}점 · ${STAR_WORDS[r]}` : '눌러서 별점 주기'}</span>
    </div>`;
  }

  async function showForm(cafe) {
    current = cafe;
    const existing = await mine(cafe.id).catch(() => null);
    draft = { rating: existing?.rating || 0, body: existing?.body || '' };
    QS.forEach(q => { draft[q.k] = existing?.[q.k] ?? (q.multi ? [] : null); });

    const qs = Q.map(q => q.group
      ? `<p class="w-group">${esc(q.group)}</p>`
      : `<div class="w-q${q.big ? ' big' : ''}">
          <span class="w-label">${esc(q.label)}${q.note ? `<small>${esc(q.note)}</small>` : ''}</span>
          <div class="w-opts">${q.opts.map(o => optHTML(q, o)).join('')}</div>
        </div>`).join('');

    show(`
      ${head(`${mark(profile.mark)} ${esc(profile.nickname)} 이름으로 올라가요${LIVE ? '' : ' · 데모'}`, esc(cafe.name))}
      <div class="w-body">
        <div class="w-must">
          <span class="w-label">별점 <small class="req">필수</small></span>
          <div id="stars">${starsHTML()}</div>
        </div>
        <p class="w-hint">여기부터는 아는 것만 톡톡. 모르면 비워 두고, 한 번 더 누르면 취소.</p>
        ${qs}
        <p class="w-group">한마디</p>
        <label class="w-text">
          <textarea id="w-body" maxlength="${MAX_TEXT}" rows="3" placeholder="다음에 갈 사람한테 해주고 싶은 말 (안 써도 돼요)">${esc(draft.body)}</textarea>
          <small id="w-len">${draft.body.length}/${MAX_TEXT}</small>
        </label>
        ${existing ? '<button type="button" class="w-del" data-act="del-review">내 후기 지우기</button>' : ''}
      </div>
      <footer class="w-foot">
        <p class="w-err" hidden></p>
        <button type="button" class="w-send" data-act="send"></button>
      </footer>`, 'form');
    refreshSend();
  }

  function extras() {
    return QS.filter(q => q.multi ? draft[q.k]?.length : draft[q.k] !== null && draft[q.k] !== undefined).length
      + (draft.body?.trim() ? 1 : 0);
  }

  function refreshSend() {
    const b = panel().querySelector('[data-act="send"]');
    if (!b) return;
    b.disabled = !draft.rating;
    const n = extras();
    b.textContent = !draft.rating ? '별점을 먼저 골라 주세요' : `올리기${n ? ` · 정보 ${n}개 더` : ''}`;
  }

  // 후기 쓰기 진입점: 로그인 → (처음이면) 프로필 → 폼
  async function startWrite(cafe, done) {
    onDone = done || onDone;
    await inited;
    if (!user) return showLogin(cafe);
    if (!profile) return showProfile(() => showForm(cafe));
    return showForm(cafe);
  }

  // 로그인과 닉네임까지 있어야 하는 일. 없으면 로그인 → 닉네임 → then 순서
  // 카카오로 다녀오면 페이지가 새로 열리니 params를 주소에 붙여서 돌아옴
  async function member(params, then) {
    await inited;
    if (user && profile) return then();
    if (user) return showProfile(then);
    showLogin(null);
    loginReturn = params;
    afterLogin = then;
  }

  async function openAccount() {
    await inited;
    if (!user) return showLogin(null);
    return showProfile(null);
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { t.hidden = true; }, 2200);
  }

  function fail(msg) {
    const e = panel().querySelector('.w-err');
    if (!e) return toast(msg);
    e.textContent = msg;
    e.hidden = false;
  }

  function explain(e) {
    const m = String(e?.message || e);
    if (e?.code === '23505' || /duplicate|unique/i.test(m)) return '누가 이미 쓰는 닉네임이에요. 다른 걸로 해 주세요.';
    if (/provider is not enabled|unsupported provider/i.test(m)) return 'Supabase에서 카카오 로그인이 아직 꺼져 있어요.';
    if (/JWT|not authenticated|permission/i.test(m)) return '로그인이 풀렸어요. 다시 로그인해 주세요.';
    return '저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
  }

  document.addEventListener('click', async e => {
    const p = panel();
    if (p.hidden || !p.contains(e.target)) return;
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;

    if (act === 'close') return close();

    if (act === 'login') {
      b.disabled = true;
      try {
        const stay = await login(current?.id);
        if (stay && afterLogin) { const f = afterLogin; afterLogin = null; return showProfile(f); }
        if (stay) return current ? startWrite(current) : showProfile(null);
      } catch (err) { console.error(err); fail(explain(err)); b.disabled = false; }
      return;
    }

    if (act === 'reroll') { $('#nick').value = suggestNick(); return; }

    if (act === 'mark') {
      pDraft.mark = Number(b.dataset.v);
      p.querySelectorAll('[data-act="mark"]').forEach(x => x.classList.toggle('on', x === b));
      return;
    }

    if (act === 'save-profile') {
      const nickname = $('#nick').value.trim();
      if (!NICK_RE.test(nickname)) return fail('닉네임은 2–12자, 한글·영문·숫자·_ . 만 돼요.');
      b.disabled = true;
      try {
        await saveProfile({ nickname, mark: pDraft.mark });
        if (afterProfile) { const f = afterProfile; afterProfile = null; f(); }
        else { close(); toast('저장했어요'); onDone?.(); }
      } catch (err) { console.error(err); fail(explain(err)); b.disabled = false; }
      return;
    }

    if (act === 'logout') { await logout(); close(); toast('로그아웃했어요'); onDone?.(); return; }

    if (act === 'delete-account') {
      if (!confirm('탈퇴하면 계정과 지금까지 쓴 후기가 전부 지워지고 되돌릴 수 없어요. 탈퇴할까요?')) return;
      try { await deleteAccount(); close(); toast('탈퇴했어요'); onDone?.(); }
      catch (err) { console.error(err); fail('탈퇴하지 못했어요. 잠시 뒤 다시 시도해 주세요.'); }
      return;
    }

    if (act === 'star') {
      const n = Number(b.dataset.v);
      draft.rating = draft.rating === n ? 0 : n;
      $('#stars').innerHTML = starsHTML();
      refreshSend();
      return;
    }

    if (act === 'opt') {
      const k = b.dataset.k;
      const v = JSON.parse(b.dataset.v);
      const q = QS.find(x => x.k === k);
      if (q.multi) {
        const arr = draft[k] || [];
        draft[k] = arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v].slice(-q.multi);
      } else {
        draft[k] = draft[k] === v ? null : v;
      }
      p.querySelectorAll(`.opt[data-k="${k}"]`).forEach(x => {
        const xv = JSON.parse(x.dataset.v);
        const on = q.multi ? draft[k].includes(xv) : draft[k] === xv;
        x.classList.toggle('on', on);
        x.setAttribute('aria-pressed', on);
      });
      refreshSend();
      return;
    }

    if (act === 'del-review') {
      if (!confirm('이 카페에 남긴 내 후기를 지울까요?')) return;
      try { await remove(current.id); close(); toast('지웠어요'); onDone?.(); }
      catch (err) { console.error(err); fail('지우지 못했어요.'); }
      return;
    }

    if (act === 'send') {
      if (!draft.rating) return;
      const row = { rating: draft.rating, body: draft.body?.trim() || null };
      QS.forEach(q => { row[q.k] = q.multi ? (draft[q.k] || []) : (draft[q.k] ?? null); });
      b.disabled = true;
      b.textContent = '올리는 중';
      try {
        await save(current.id, row);
        close();
        const names = (row.good_for || []).map(k => k === 'study' ? '카공' : '느좋');
        toast(names.length ? `후기 올렸어요. ${names.join('·')} 그룹에도 담았어` : '후기 올렸어요. 고마워요');
        onDone?.();
      } catch (err) {
        console.error(err);
        fail(explain(err));
        refreshSend();
      }
    }
  });

  document.addEventListener('input', e => {
    if (e.target.id !== 'w-body') return;
    draft.body = e.target.value;
    $('#w-len').textContent = `${e.target.value.length}/${MAX_TEXT}`;
    refreshSend();
  });

  return {
    live: LIVE,
    ready: inited,
    db: () => ready.then(() => sb),
    member,
    toast,
    show,
    onChange: f => listeners.push(f),
    me: () => ({ user, profile }),
    markHTML: mark,
    stats,
    fillSummary,
    startWrite,
    openAccount,
    close,
    isOpen: () => !panel().hidden
  };
})();
