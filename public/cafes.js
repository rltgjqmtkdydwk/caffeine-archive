// 카페와 역 데이터. Supabase가 연결돼 있으면 cafes_public 뷰에서, 아니면 data/cafes.json(데모)에서 읽음
window.Cafes = (() => {
  const LIVE = Reviews.live;
  const COLS = 'id,name,lat,lng,address,station_id,walk,review_count,avg_rating,types,admin_types';

  // ---------- 데모 ----------
  let demo = null;
  let demoStats = {};

  async function demoData() {
    if (!demo) {
      const d = await fetch('data/cafes.json').then(r => r.json());
      demo = {
        stations: d.stations || [],
        cafes: (d.cafes || []).map(c => ({
          ...c,
          station_id: c.station,
          types: c.type || [],
          admin_types: c.type || []
        }))
      };
      await reload();
    }
    return demo;
  }

  const withStats = c => ({
    ...c,
    review_count: demoStats[c.id]?.n || 0,
    avg_rating: demoStats[c.id] ? Math.round(demoStats[c.id].avg * 10) / 10 : null
  });

  // 후기를 쓰고 나면 다시 계산 (Supabase는 뷰가 알아서 계산)
  async function reload() {
    if (!LIVE) demoStats = await Reviews.stats().catch(() => ({}));
  }

  // ---------- 공통 ----------
  // 쿼리 빌더는 await 하는 순간 실행되니까 db만 기다리고 빌더는 그대로 돌려줌
  const view = db => db.from('cafes_public').select(COLS);
  const dbc = () => Reviews.db();

  async function run(query) {
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function stations() {
    if (!LIVE) return (await demoData()).stations;
    const db = await Reviews.db();
    return run(db.from('stations').select('id,name,lines,lat,lng').limit(2000));
  }

  // 카공이나 느좋이 붙은 카페 전부 (지도에 늘 보이는 핀)
  async function classified() {
    if (!LIVE) return (await demoData()).cafes.filter(c => c.types.length).map(withStats);
    return run(view(await dbc()).neq('types', '{}').limit(3000));
  }

  // 지도 화면 안의 카페
  async function inBox(b, limit = 1200) {
    if (!LIVE) {
      return (await demoData()).cafes
        .filter(c => c.lat >= b.s && c.lat <= b.n && c.lng >= b.w && c.lng <= b.e)
        .map(withStats);
    }
    return run(view(await dbc())
      .gte('lat', b.s).lte('lat', b.n).gte('lng', b.w).lte('lng', b.e)
      .limit(limit));
  }

  async function atStation(id) {
    if (!LIVE) return (await demoData()).cafes.filter(c => c.station_id === id).map(withStats);
    return run(view(await dbc()).eq('station_id', id).order('walk', { ascending: true }).limit(500));
  }

  async function search(text) {
    const t = text.trim();
    if (t.length < 2) return [];
    if (!LIVE) {
      return (await demoData()).cafes.filter(c => c.name.includes(t)).map(withStats);
    }
    const pat = '%' + t.replace(/[%_\\]/g, ch => '\\' + ch) + '%';
    return run(view(await dbc()).ilike('name', pat).order('review_count', { ascending: false }).limit(40));
  }

  async function byId(id) {
    if (!LIVE) {
      const c = (await demoData()).cafes.find(x => x.id === id);
      return c ? withStats(c) : null;
    }
    const rows = await run(view(await dbc()).eq('id', id).limit(1));
    return rows[0] || null;
  }

  // ---------- 운영자 ----------
  async function setTypes(id, types) {
    const db = await Reviews.db();
    const { error } = await db.rpc('set_cafe_types', { p_cafe: id, p_types: types });
    if (error) throw error;
  }

  async function setHidden(id, hidden) {
    const db = await Reviews.db();
    const { error } = await db.rpc('set_cafe_hidden', { p_cafe: id, p_hidden: hidden });
    if (error) throw error;
  }

  return { live: LIVE, reload, stations, classified, inBox, atStation, search, byId, setTypes, setHidden };
})();
