# 개발 메모

## 구조

빌드 도구 없는 정적 사이트. `public/`이 그대로 서빙 루트이고 Cloudflare Pages가 main 푸시 때마다 배포함.

```
public/
  index.html        화면 뼈대
  style.css         디자인 전부 (글씨 크기는 --fs 배수)
  app.js            지도, 필터, 목록 시트, 카페 상세, 그룹 지도 보기
  cafes.js          카페·역 데이터 읽기 (Supabase 또는 데모 json)
  lists.js          그룹: 담기 창, 공유 링크, 색
  me.js             내 프로필: 그룹 목록, 새 그룹, 설정
  reviews.js        카카오 로그인, 닉네임, 후기 요약, 후기 작성
  config.js         Supabase 주소와 공개 키, CARTO 지도 키 (비어 있으면 데모 모드)
  data/cafes.json   데모용 예시 카페
supabase/
  schema.sql        프로필, 후기, 카카오 정보 지우는 트리거
  cafes.sql         카페, 역, 공개 뷰, 운영자 함수
  lists.sql         그룹(하트·카공·느좋 + 직접 만든 것), 공유, 후기→그룹 동기화
tools/
  import_cafes.py   공공데이터 → Supabase
docs/
  data.md           카페 데이터 넣고 갱신하는 법
```

SQL은 `schema.sql` → `cafes.sql` → `lists.sql` 순서. 셋 다 여러 번 실행해도 안전함.

## 기술 선택

- 정적 사이트 + Cloudflare Pages: 서버 없음, 무료
- Supabase 무료 플랜: 후기, 프로필, 그룹, 카페 목록. 카카오 OAuth도 여기서
- Leaflet + CARTO 타일(키 있을 때) / OpenStreetMap 타일(없을 때)
- 카페 목록은 공공데이터만. 카카오·네이버 장소 API 결과는 저장 금지라 안 씀

## 익명성

- 카카오 계정은 같은 사람인지 구분하는 데만 씀
- 카카오가 넘기는 이름·사진·이메일은 저장 직전에 트리거(`strip_kakao_profile`)가 지움
- 공개 조회는 `reviews_public`, `cafes_public` 뷰와 `get_shared_list()`로만. 계정 id가 안 나감
- 탈퇴하면 계정, 프로필, 후기, 그룹이 연쇄 삭제
- `config.js`에는 공개돼도 되는 키만 (Supabase publishable, CARTO)

## 로컬 실행

```
python3 -m http.server 8000 -d public
```

http://localhost:8000. `index.html`을 파일로 직접 열면 데이터를 못 읽음.
카카오 로그인까지 보려면 Supabase URL Configuration의 Redirect URLs에 `http://localhost:8000/**`.
