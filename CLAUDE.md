# 카페인 아카이브 (caffeine-archive)

지하철역 기준 카페 지도 + 익명 후기. 카공/느좋 두 종류로 분류. 모바일 우선.

## 구조

- 빌드 도구 없는 정적 사이트. 사이트 파일은 `public/`에 있고 이 폴더가 서빙 루트. Cloudflare Pages가 이 폴더로 배포(main 푸시 시 자동). GitHub Pages는 꺼 둠
- `public/app.js` 지도·필터·목록·상세 / `cafes.js` 카페·역 데이터 읽기 / `lists.js` 그룹(담기·공유) / `reviews.js` 로그인·프로필·후기 / `style.css` 전부
- 카페와 역: Supabase `cafes`, `stations` 표 (서울 카페 공공데이터를 `tools/import_cafes.py`로 넣음). 공개 조회는 `cafes_public` 뷰. 자세한 건 `docs/data.md`
- `public/data/cafes.json`은 config가 비어 있을 때 쓰는 데모 데이터
- 후기·프로필: Supabase. 스키마는 `supabase/schema.sql` → `cafes.sql` → `lists.sql` 순서, 키는 `public/config.js` (비어 있으면 localStorage 데모 모드)
- 카공/느좋: 운영자 지정(`admin_types`, `profiles.is_admin`) 또는 후기 자동 분류(뷰에서 계산)
- 로그인: 카카오 OAuth(Supabase). 카카오 프로필 정보는 화면에 쓰지 않고 DB에도 남기지 않음. 공개 표시는 사이트 전용 닉네임 + 모양 표시(mark 1–8)
- 후기는 별점(rating)만 필수, 나머지는 전부 선택. 카페당 사용자당 1개(upsert)
- 그룹: 사용자별 카페 폴더. 기본 카공·느좋(이름 변경·삭제 불가) + 직접 만든 것. 기본 비공개, 공유하면 `?list=share_id` 링크로 누구나 열람(닉네임만 표시). 카페 하나는 `?cafe=id` 링크
- 그룹의 카공·느좋은 개인 폴더일 뿐, 지도의 카공·느좋 분류에는 안 섞임

## 지켜야 할 것

- 익명성: 공개 조회는 `reviews_public` 뷰로만. user_id나 카카오 정보가 화면이나 공개 쿼리에 나가면 안 됨
- `public/config.js`에는 anon/publishable 키만. service_role 키 금지 (가져오기 스크립트는 환경변수로만 받음)
- 카카오·네이버 장소 API 결과는 DB에 저장 금지(약관). 카페 목록은 공공데이터로만
- 디자인 톤: 종이색 배경(#ece5d8), 진한 잉크색 테두리, 오프셋 그림자, 살짝 기울인 요소. 파란 계열·둥근 카드·균일한 8px 간격 지양
- 문구는 반말 섞인 짧은 구어체. 교과서 같은 안내문 지양
- 모든 사용자 입력은 `esc()`로 이스케이프

## 확인

```
python3 -m http.server 8000 -d public
```

휴대폰 폭(390px)에서 먼저 확인.
