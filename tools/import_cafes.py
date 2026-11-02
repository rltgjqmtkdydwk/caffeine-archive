"""서울 카페와 지하철역 공공데이터를 Supabase용으로 정리

입력
  상가정보   소상공인시장진흥공단_상가(상권)정보 서울 CSV (data.go.kr)
  역 정보    서울시 역사마스터 정보 CSV (서울 열린데이터광장)

출력 (out/)
  stations.csv, cafes.csv   Supabase 표 편집기에서 그대로 가져오기 가능
  --upload 를 주면 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경변수로 바로 올림

  python tools/import_cafes.py 상가정보_서울.csv 역사마스터.csv
  python tools/import_cafes.py 상가정보_서울.csv 역사마스터.csv --upload

표준 라이브러리만 씀. 열 이름이 해마다 조금씩 바뀌어서 후보 이름 중 맞는 걸 찾아 씀
"""

import argparse
import csv
import io
import json
import math
import os
import re
import sys
import urllib.request
from collections import Counter, defaultdict

# 서울 둘레 + 여유. 경계 근처 카페도 가까운 역을 찾을 수 있게 역은 조금 넓게 받음
SEOUL = (37.40, 37.72, 126.73, 127.20)
STATION_BOX = (37.33, 37.78, 126.65, 127.28)
MAX_WALK_M = 1500          # 이보다 멀면 역 없음으로
WALK_M_PER_MIN = 67        # 4km/h
DETOUR = 1.3               # 직선거리 → 실제 걷는 거리 어림

CAFE_RE = re.compile(r'카페|커피')
# 이름에 '카페'가 붙어도 커피 마시러 가는 곳은 아닌 업종
SKIP_RE = re.compile(r'독서실|스터디|오락|키즈|보드|만화|노래|PC|피시|게임')
SAME_SPOT_M = 200          # 이름이 달라도 이만큼 붙어 있으면 한 역 (총신대입구·이수 같은 환승역)

COLS = {
    'id':       ['상가업소번호'],
    'name':     ['상호명'],
    'branch':   ['지점명'],
    'cat':      ['상권업종소분류명', '소분류명'],
    'cat_std':  ['표준산업분류명'],
    'sido':     ['시도명'],
    'road':     ['도로명주소'],
    'lot':      ['지번주소'],
    'lng':      ['경도'],
    'lat':      ['위도'],
}
STATION_COLS = {
    'name': ['역사명', '역명', '전철역명', 'BLDN_NM', 'STATION_NM', 'SUBWAY_STATION_NM'],
    'line': ['호선명', '호선', '노선명', '노선', 'ROUTE', 'LINE_NUM', 'LINE'],
    'lat':  ['위도', 'LAT', 'Y', 'y좌표', 'YPOINT_WGS'],
    'lng':  ['경도', 'LOT', 'LNG', 'LON', 'X', 'x좌표', 'XPOINT_WGS'],
}

# 화면에서 노선 색을 붙이는 이름으로 맞춤
LINE_ALIASES = [
    (r'^0?(\d)\s*호선$', r'\1'),
    (r'^수도권\s*0?(\d)\s*호선$', r'\1'),
    (r'^경의.*', '경의중앙'),
    (r'^공항.*', '공항'),
    (r'^신분당.*', '신분당'),
    (r'^(수인)?분당.*', '수인분당'),
    (r'^우이신설.*', '우이신설'),
    (r'^신림.*', '신림'),
    (r'^경춘.*', '경춘'),
    (r'^서해.*', '서해'),
    (r'^김포.*', '김포골드'),
    (r'^GTX-?A.*', 'GTX-A'),
]


def read_csv(path):
    raw = open(path, 'rb').read()
    for enc in ('utf-8-sig', 'cp949'):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        sys.exit(f'{path}: 글자 인코딩을 못 알아봄 (utf-8, cp949 둘 다 아님)')
    rows = list(csv.reader(io.StringIO(text)))
    if not rows:
        sys.exit(f'{path}: 비어 있음')
    return rows[0], rows[1:]


def find_cols(header, wanted, path, required):
    clean = [h.strip().strip('﻿') for h in header]
    upper = [h.upper() for h in clean]
    got = {}
    for key, names in wanted.items():
        for n in names:
            if n in clean:
                got[key] = clean.index(n)
                break
            if n.upper() in upper:
                got[key] = upper.index(n.upper())
                break
    missing = [k for k in required if k not in got]
    if missing:
        sys.exit(f'{path}: 필요한 열을 못 찾음 {missing}\n  있는 열: {clean}')
    return got


def dist_m(lat1, lng1, lat2, lng2):
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def norm_line(s):
    s = s.strip()
    for pat, rep in LINE_ALIASES:
        if re.match(pat, s):
            return re.sub(pat, rep, s)
    return re.sub(r'선$', '', s)


def norm_station(s):
    s = re.sub(r'\(.*?\)', '', s).strip()
    return s[:-1] if s.endswith('역') and len(s) > 2 else s


def to_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def in_box(lat, lng, box):
    return box[0] <= lat <= box[1] and box[2] <= lng <= box[3]


# ---------- 역 ----------

def load_stations(path):
    header, rows = read_csv(path)
    c = find_cols(header, STATION_COLS, path, ['name', 'lat', 'lng'])
    groups = defaultdict(list)       # 같은 이름이라도 멀리 떨어져 있으면 다른 역
    for r in rows:
        lat, lng = to_float(r[c['lat']]), to_float(r[c['lng']])
        if lat is None or lng is None:
            continue
        if lat > lng:                # 위도/경도 열이 바뀌어 들어온 파일 대비
            lat, lng = lng, lat
        if not in_box(lat, lng, STATION_BOX):
            continue
        name = norm_station(r[c['name']])
        line = norm_line(r[c['line']]) if 'line' in c else ''
        for g in groups[name]:
            if dist_m(lat, lng, g['lat'], g['lng']) < 700:
                if line and line not in g['lines']:
                    g['lines'].append(line)
                g['pts'].append((lat, lng))
                break
        else:
            groups[name].append({'name': name, 'lines': [line] if line else [], 'lat': lat, 'lng': lng, 'pts': [(lat, lng)]})

    spots = []
    for name, gs in groups.items():
        for g in gs:
            g['lat'] = sum(p[0] for p in g['pts']) / len(g['pts'])
            g['lng'] = sum(p[1] for p in g['pts']) / len(g['pts'])
            g['names'] = [name]
            for t in spots:
                if dist_m(g['lat'], g['lng'], t['lat'], t['lng']) < SAME_SPOT_M:
                    t['names'] += [n for n in g['names'] if n not in t['names']]
                    t['lines'] += [l for l in g['lines'] if l not in t['lines']]
                    t['pts'] += g['pts']
                    t['lat'] = sum(p[0] for p in t['pts']) / len(t['pts'])
                    t['lng'] = sum(p[1] for p in t['pts']) / len(t['pts'])
                    break
            else:
                spots.append(g)

    out, used = [], set()
    for t in spots:
        name = '·'.join(sorted(t['names'], key=len))
        sid = name
        if sid in used:
            sid = f'{name}-{t["lines"][0]}' if t['lines'] else name
        while sid in used:
            sid += "'"
        used.add(sid)
        out.append({'id': sid, 'name': name, 'lines': sorted(t['lines'], key=line_order), 'lat': round(t['lat'], 6), 'lng': round(t['lng'], 6)})
    return out


def line_order(l):
    return (0, int(l)) if l.isdigit() else (1, l)


# ---------- 카페 ----------

def load_cafes(path, stations):
    header, rows = read_csv(path)
    c = find_cols(header, COLS, path, ['id', 'name', 'lat', 'lng'])
    if 'cat' not in c and 'cat_std' not in c:
        sys.exit(f'{path}: 업종 열(상권업종소분류명/표준산업분류명)을 못 찾음')

    # 가까운 역 찾기를 빠르게: 0.01도(약 1km) 격자
    grid = defaultdict(list)
    for s in stations:
        grid[(int(s['lat'] * 100), int(s['lng'] * 100))].append(s)

    cats, skipped = Counter(), Counter()
    out, seen = [], set()
    for r in rows:
        cat = r[c['cat']] if 'cat' in c else ''
        std = r[c['cat_std']] if 'cat_std' in c else ''
        if not (CAFE_RE.search(cat) or CAFE_RE.search(std)):
            continue
        if SKIP_RE.search(cat):
            skipped[cat] += 1
            continue
        if 'sido' in c and '서울' not in r[c['sido']]:
            continue
        lat, lng = to_float(r[c['lat']]), to_float(r[c['lng']])
        if lat is None or lng is None or not in_box(lat, lng, SEOUL):
            continue
        cats[cat or std] += 1
        cid = 'sb-' + r[c['id']].strip()
        if cid in seen:
            continue
        seen.add(cid)

        name = r[c['name']].strip()
        branch = r[c['branch']].strip() if 'branch' in c else ''
        if branch and branch not in name:
            name = f'{name} {branch}'
        addr = (r[c['road']].strip() if 'road' in c else '') or (r[c['lot']].strip() if 'lot' in c else '')

        best, best_d = None, MAX_WALK_M + 1
        gy, gx = int(lat * 100), int(lng * 100)
        for dy in (-1, 0, 1):
            for dx in (-2, -1, 0, 1, 2):
                for s in grid.get((gy + dy, gx + dx), ()):
                    d = dist_m(lat, lng, s['lat'], s['lng'])
                    if d < best_d:
                        best, best_d = s, d
        walk = max(1, round(best_d * DETOUR / WALK_M_PER_MIN)) if best else None

        out.append({
            'id': cid, 'name': name[:80], 'lat': round(lat, 6), 'lng': round(lng, 6),
            'address': addr[:160] or None, 'station_id': best['id'] if best else None,
            'walk': walk, 'source': 'semas',
        })
    return out, cats, skipped


# ---------- 내보내기 ----------

def write_csv(path, rows, fields):
    with open(path, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in rows:
            r = dict(r)
            if isinstance(r.get('lines'), list):
                r['lines'] = '{' + ','.join(f'"{x}"' for x in r['lines']) + '}'
            w.writerow({k: ('' if r.get(k) is None else r[k]) for k in fields})


def upload(table, rows, batch=1000):
    url = os.environ.get('SUPABASE_URL', '').rstrip('/')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
    if not url or not key:
        sys.exit('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요함 (service_role 키는 저장소에 절대 넣지 말 것)')
    for i in range(0, len(rows), batch):
        body = json.dumps(rows[i:i + batch], ensure_ascii=False).encode()
        req = urllib.request.Request(
            f'{url}/rest/v1/{table}?on_conflict=id', data=body, method='POST',
            headers={
                'apikey': key, 'Authorization': f'Bearer {key}',
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates,return=minimal',
            })
        try:
            urllib.request.urlopen(req).read()
        except urllib.error.HTTPError as e:
            sys.exit(f'{table} 올리다 실패 ({i}~): {e.code} {e.read().decode()[:400]}')
        print(f'  {table}: {min(i + batch, len(rows))}/{len(rows)}', end='\r')
    print()


def main():
    ap = argparse.ArgumentParser(description='서울 카페·역 공공데이터 정리')
    ap.add_argument('shops', help='소상공인 상가(상권)정보 서울 CSV')
    ap.add_argument('stations', help='서울시 역사마스터 정보 CSV')
    ap.add_argument('--out', default='out')
    ap.add_argument('--upload', action='store_true', help='Supabase에 바로 올림 (환경변수 필요)')
    a = ap.parse_args()

    stations = load_stations(a.stations)
    print(f'역 {len(stations)}곳')
    if not stations:
        sys.exit('역을 하나도 못 읽음. 좌표 열을 확인해 볼 것')

    cafes, cats, skipped = load_cafes(a.shops, stations)
    for k, v in skipped.most_common():
        print(f'  뺀 업종 "{k}": {v}')

    # 가까운 카페가 하나도 없는 역(서울 밖 경계 역 등)은 버림
    used = {x['station_id'] for x in cafes}
    dropped = len(stations) - len(used)
    stations = [s for s in stations if s['id'] in used]
    print(f'역 {len(stations)}곳만 남김 (카페가 안 붙은 역 {dropped}곳 뺌)')
    near = sum(1 for x in cafes if x['station_id'])
    print(f'카페 {len(cafes)}곳 (역 {MAX_WALK_M}m 안: {near}곳)')
    for k, v in cats.most_common(6):
        print(f'  업종 "{k}": {v}')

    os.makedirs(a.out, exist_ok=True)
    write_csv(os.path.join(a.out, 'stations.csv'), stations, ['id', 'name', 'lines', 'lat', 'lng'])
    write_csv(os.path.join(a.out, 'cafes.csv'), cafes, ['id', 'name', 'lat', 'lng', 'address', 'station_id', 'walk', 'source'])
    print(f'{a.out}/stations.csv, {a.out}/cafes.csv 저장')

    if a.upload:
        upload('stations', stations)
        upload('cafes', cafes)
        print('업로드 끝')


if __name__ == '__main__':
    main()
