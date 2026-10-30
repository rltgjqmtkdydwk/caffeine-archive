# 카페 데이터

서울 카페 전부를 Supabase `cafes` 표에 넣어 두고, 지도는 화면에 보이는 만큼만 불러옴.
카공/느좋 표시는 운영자가 직접 붙이거나, 후기에서 자동으로 붙음.

## 출처

| 데이터 | 어디서 | 파일 |
|---|---|---|
| 카페 | 공공데이터포털 `소상공인시장진흥공단_상가(상권)정보` | 압축 안의 서울 CSV |
| 역 | 서울 열린데이터광장 `서울시 역사마스터 정보` | CSV 내려받기 |

둘 다 이용 제한 없는 공공데이터. 카카오·네이버 장소 검색 결과는 저장이 금지라 쓰지 않음.

## 처음 넣기

1. Supabase SQL Editor에서 `supabase/cafes.sql` 실행 (`schema.sql`은 이미 실행된 상태 기준)
2. 받은 CSV 두 개를 `data-raw/`에 두고 (깃에는 안 올라감)

```
python tools/import_cafes.py data-raw/상가정보_서울.csv data-raw/역사마스터.csv
```

→ `out/stations.csv`, `out/cafes.csv` 생성. 업종별 개수와 역에서 먼 카페 수가 같이 찍힘

3. 올리기는 둘 중 하나
   - Supabase 표 편집기에서 `stations` → `cafes` 순서로 CSV 가져오기
   - 또는 환경변수로 바로 올리기 (service_role 키는 터미널에서만 쓰고 어디에도 저장 안 함)

```
SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... python tools/import_cafes.py data-raw/상가정보_서울.csv data-raw/역사마스터.csv --upload
```

## 다시 넣기 (분기마다 새 데이터가 나올 때)

`--upload`로 같은 명령을 다시 돌리면 이름·주소·좌표·역만 갱신됨. 운영자가 붙인 카공/느좋 표시와 숨김은 그대로 남음.
없어진 카페는 자동으로 지우지 않음. 폐업한 곳은 지도에서 운영자가 숨기기.

## 운영자

```sql
update public.profiles set is_admin = true where nickname = '내닉네임';
```

운영자로 로그인하면 카페 상세에 `카공 표시` `느좋 표시` `숨기기` 버튼이 생김.

## 자동 분류 기준

후기에서 카공(또는 느좋) 표가 2개 이상이고, 그 카페 후기의 절반 이상이 골랐으면 붙음.
숫자는 `supabase/cafes.sql`의 `cafes_public` 뷰에서 조정.

## 화면에서 불러오는 방식

- 카공/느좋이 붙은 카페: 처음에 전부 받아서 핀으로 늘 표시
- 나머지 카페: 줌 15 이상에서 화면 안에 있는 것만 받아서 작은 점으로 (최대 1200곳)
- 역을 고르면 그 역에 묶인 카페 전부, 이름 검색은 최대 40곳
- `public/config.js`가 비어 있으면 예전처럼 `public/data/cafes.json` 데모로 돌아감
