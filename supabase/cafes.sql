-- 카페와 역
-- schema.sql 다음에 실행. 여러 번 실행해도 안전하게 작성
--
-- 구조
--   stations       지하철역 (공공데이터 역사 정보에서 가져옴)
--   cafes          카페 (소상공인 상가정보의 서울 카페 + 운영자가 직접 넣은 곳)
--   cafes_public   공개용. 후기 수, 평균 별점, 카공/느좋 분류를 붙여서 보여줌
--
-- 카공/느좋 분류는 두 갈래
--   1) 운영자가 직접 붙인 것 (cafes.admin_types)
--   2) 후기에서 그 표가 2개 이상이고, 후기 절반 이상이 고른 것


-- 1. 지하철역 ---------------------------------------------------------------------

create table if not exists public.stations (
  id     text primary key,
  name   text not null,
  lines  text[] not null default '{}',
  lat    double precision not null,
  lng    double precision not null
);

alter table public.stations enable row level security;
drop policy if exists "anyone reads stations" on public.stations;
create policy "anyone reads stations" on public.stations for select to anon, authenticated using (true);
revoke all on public.stations from anon, authenticated;
grant select on public.stations to anon, authenticated;


-- 2. 카페 -------------------------------------------------------------------------

create table if not exists public.cafes (
  id           text primary key,                       -- 공공데이터는 'sb-상가업소번호', 직접 넣은 곳은 아무 고유값
  name         text not null,
  lat          double precision not null,
  lng          double precision not null,
  address      text,
  station_id   text references public.stations (id) on delete set null,
  walk         smallint,                               -- 역에서 걸어서 몇 분 (직선거리로 어림)
  source       text not null default 'manual',         -- 'semas' | 'manual'
  admin_types  text[] not null default '{}' check (admin_types <@ array['카공', '느좋']),
  hidden       boolean not null default false,         -- 폐업, 카페 아님 등은 지우지 않고 숨김
  updated_at   timestamptz not null default now()
);

create index if not exists cafes_lat_lng_idx on public.cafes (lat, lng);
create index if not exists cafes_station_idx on public.cafes (station_id);
create index if not exists cafes_name_idx on public.cafes (name text_pattern_ops);

-- 원본 테이블은 아무도 직접 못 읽고 못 씀. 읽기는 cafes_public, 쓰기는 아래 함수나 가져오기 스크립트(service_role)로만
alter table public.cafes enable row level security;
revoke all on public.cafes from anon, authenticated;


-- 3. 공개용 뷰: 후기 통계 + 카공/느좋 분류 ----------------------------------------

drop view if exists public.cafes_public;
create view public.cafes_public as
  with stat as (
    select cafe_id,
           count(*)::int                                          as n,
           round(avg(rating), 1)::float                           as avg_rating,
           (count(*) filter (where 'study' = any (good_for)))::int as study,
           (count(*) filter (where 'mood'  = any (good_for)))::int as mood
    from public.reviews
    group by cafe_id
  )
  select c.id, c.name, c.lat, c.lng, c.address, c.station_id, c.walk,
         coalesce(s.n, 0)     as review_count,
         s.avg_rating,
         coalesce(s.study, 0) as study_votes,
         coalesce(s.mood, 0)  as mood_votes,
         array_remove(array[
           case when '카공' = any (c.admin_types) or (coalesce(s.study, 0) >= 2 and s.study * 2 >= s.n) then '카공' end,
           case when '느좋' = any (c.admin_types) or (coalesce(s.mood, 0)  >= 2 and s.mood  * 2 >= s.n) then '느좋' end
         ], null) as types,
         c.admin_types
  from public.cafes c
  left join stat s on s.cafe_id = c.id
  where not c.hidden;

grant select on public.cafes_public to anon, authenticated;


-- 4. 운영자 ------------------------------------------------------------------------
--    운영자 지정: update public.profiles set is_admin = true where nickname = '내닉네임';

alter table public.profiles add column if not exists is_admin boolean not null default false;

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant insert (id, nickname, mark), update (id, nickname, mark) on public.profiles to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- 카공/느좋 직접 붙이기
create or replace function public.set_cafe_types(p_cafe text, p_types text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;
  update public.cafes
     set admin_types = coalesce(p_types, '{}'), updated_at = now()
   where id = p_cafe;
end;
$$;

-- 폐업·카페 아님 숨기기 (되살릴 때는 false)
create or replace function public.set_cafe_hidden(p_cafe text, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;
  update public.cafes
     set hidden = coalesce(p_hidden, true), updated_at = now()
   where id = p_cafe;
end;
$$;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.set_cafe_types(text, text[]) from public, anon;
revoke all on function public.set_cafe_hidden(text, boolean) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.set_cafe_types(text, text[]) to authenticated;
grant execute on function public.set_cafe_hidden(text, boolean) to authenticated;
