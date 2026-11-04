# 카페인 아카이브 (caffeine-archive)

지하철역 기준 카페 지도 + 익명 후기. 카공/느좋 두 종류로 분류. 모바일 우선.

## 구조

- 빌드 도구 없는 정적 사이트. 사이트 파일은 `public/`에 있고 이 폴더가 서빙 루트. Cloudflare Pages가 이 폴더로 배포(main 푸시 시 자동). GitHub Pages는 꺼 둠
- `public/` 구성: `index.html`·`privacy.html`·`site.webmanifest`(루트) / `css/`(base·map·cafe·account·filters·me·doc·wide, index.html 로드 순서대로 이어 붙는 하나의 스타일) / `js/app/`(state·map·view·list·groups·search·cafe·session·main: 지도·필터·목록·상세, 전역 공유라 로드 순서 중요) / `js/features/`(`lists.js` 그룹, `me.js` 내 프로필, `reviews.js` 로그인·프로필·후기, `avatars.js`) / `js/data/cafes.js` 카페·역 읽기 / `js/config.js` / `assets/`(아이콘·og.png) / `data/cafes.json`
- README는 사용자에게 보여 주는 소개글(목적: 카공·느좋 정보를 같이 모으는 지도, 길찾기 앱 아님). 개발 메모는 `docs/dev.md`
- 카페와 역: Supabase `cafes`, `stations` 표 (서울 카페 공공데이터를 `tools/import_cafes.py`로 넣음). 공개 조회는 `cafes_public` 뷰. 자세한 건 `docs/data.md`
- `public/data/cafes.json`은 config가 비어 있을 때 쓰는 데모 데이터
- 후기·프로필: Supabase. 스키마는 `supabase/schema.sql` → `cafes.sql` → `lists.sql` 순서, 키는 `public/js/config.js` (비어 있으면 localStorage 데모 모드)
- 카공/느좋: 운영자 지정(`admin_types`, `profiles.is_admin`) 또는 후기 자동 분류(뷰에서 계산)
- 로그인: 카카오 OAuth(Supabase). 카카오 프로필 정보는 화면에 쓰지 않고 DB에도 남기지 않음. 공개 표시는 사이트 전용 닉네임 + 동물 표시 7종(`js/features/avatars.js`, mark 1–7, 예전 8은 고양이로)
- 후기는 별점(rating)만 필수, 나머지는 전부 선택. 카페당 사용자당 1개(upsert)
- 그룹: 사용자별 카페 폴더. 기본 ♥(하트)·카공·느좋(이름 변경·삭제 불가) + 직접 만든 것. 카페 창의 ♥ 버튼: 아직 ♥·직접 만든 그룹 어디에도 없으면 ♥ 그룹에 바로 담고 담기 창(♥ + 직접 만든 그룹)을 띄움. ♥나 직접 만든 그룹 어디든 담겨 있으면 하트가 채워짐. 카공·느좋은 후기 체크로만(자동). 하트는 이모지 말고 글자 ♥︎(U+FE0E)로 표시. 기본 비공개, 공유하면 `?list=share_id` 링크로 누구나 열람(닉네임만 표시). 카페 하나는 `?cafe=id` 링크
- 후기에서 카공·느좋을 고르면 내 기본 카공·느좋 그룹에 자동으로 담김(DB 트리거 `sync_review_lists`). 고치면서 빼면 그룹에서도 빠지고, 후기를 지워도 그룹은 그대로
- 그룹의 카공·느좋은 개인 폴더일 뿐, 지도의 카공·느좋 분류에는 안 섞임
- 그룹은 상단 토글이 아니라 내 프로필(`js/features/me.js`)에서 보고 고름. 그룹마다 색(`lists.color`, 기본 4색 + 사용자가 추가한 색은 그 기기 localStorage). 기본 그룹은 이름은 고정, 색은 변경 가능(트리거 `lists_guard`)
- 화면: 목록 시트는 3단계(`body[data-sheet]` = peek/half/full). 로고 누르면 처음 화면. 카페 상세는 이름 옆 하트(담기)·공유 아이콘, 카카오맵 버튼이 앞
- 내가 후기 쓴 카페는 지도 핀에 별 딱지, 점은 노랗게, 목록엔 "내 후기"
- 처음 화면: 카공·느좋 표시된 카페가 8곳 이상이면 그걸 다 보이게, 적으면 홍대입구 근처를 줌 15로(`startView`)
- 개인정보처리방침 `public/privacy.html` (실제 저장하는 것만 적음. 저장 항목이 바뀌면 같이 고치기). 로그인 창·설정·README에서 링크
- 카페인 아카이브 아이콘·`site.webmanifest`·링크 미리보기 `assets/og.png`(1200×630). og 태그는 사이트 공통이라 카페별 미리보기는 안 됨 → 공유할 때 글로 카페 이름·역을 같이 보냄
- 설정: 글씨 크기 4단계(`html[data-fs]`, CSS의 `--fs` 배수, 이 기기 localStorage). 헤더·지도 핀은 고정 크기

## 지켜야 할 것

- 익명성: 공개 조회는 `reviews_public` 뷰로만. user_id나 카카오 정보가 화면이나 공개 쿼리에 나가면 안 됨
- `public/js/config.js`에는 anon/publishable 키만. service_role 키 금지 (가져오기 스크립트는 환경변수로만 받음)
- 카카오·네이버 장소 API 결과는 DB에 저장 금지(약관). 카페 목록은 공공데이터로만
- 디자인 톤: 종이색 배경(#ece5d8), 진한 잉크색 테두리, 오프셋 그림자, 살짝 기울인 요소. 파란 계열·둥근 카드·균일한 8px 간격 지양
- 문구와 버튼은 ~요 말투로 통일(단어만 있는 버튼은 그대로). 교과서 같은 안내문 지양
- 모든 사용자 입력은 `esc()`로 이스케이프

## 확인

```
python3 -m http.server 8000 -d public
```

휴대폰 폭(390px)에서 먼저 확인.
