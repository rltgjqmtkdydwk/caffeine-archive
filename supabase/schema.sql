-- 카페인 아카이브 DB
-- 여러 번 실행해도 안전하게 작성 (if not exists / drop if exists)
--
-- 구조
--   auth.users        카카오 로그인 계정 (Supabase가 관리). "같은 사람인지"만 기억
--   profiles          이 사이트에서만 쓰는 닉네임과 표시
--   reviews           후기 원본. 본인만 직접 읽고 쓸 수 있음
--   reviews_public    공개용. 계정 id 없이 닉네임만 붙여서 보여줌


-- 0. 카카오에서 넘어오는 이름/사진/이메일을 DB에 남기지 않기 ---------------------
--    로그인할 때마다 Supabase가 auth.users / auth.identities에 카카오 프로필을 써 넣는데,
--    저장되기 직전에 그 값들을 지운다. 로그인에 필요한 sub(카카오 회원번호)는 남김.

create or replace function public.strip_kakao_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  junk text[] := array['name','full_name','nickname','user_name','preferred_username',
                       'avatar_url','picture','email','email_verified','phone','phone_verified'];
begin
  if tg_table_name = 'users' then
    new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb) - junk;
    if new.raw_app_meta_data ->> 'provider' = 'kakao' then
      new.email := null;
    end if;
  else
    new.identity_data := coalesce(new.identity_data, '{}'::jsonb) - junk;
  end if;
  return new;
end;
$$;

drop trigger if exists strip_kakao_profile on auth.users;
create trigger strip_kakao_profile
  before insert or update on auth.users
  for each row execute function public.strip_kakao_profile();

drop trigger if exists strip_kakao_profile on auth.identities;
create trigger strip_kakao_profile
  before insert or update on auth.identities
  for each row execute function public.strip_kakao_profile();


-- 1. 사이트 전용 프로필 -----------------------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  nickname    text not null unique
              check (nickname ~ '^[가-힣a-zA-Z0-9_.]{2,12}$'),
  mark        smallint not null default 1 check (mark between 1 and 8),
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "read own profile"  on public.profiles;
drop policy if exists "make own profile"  on public.profiles;
drop policy if exists "edit own profile"  on public.profiles;

create policy "read own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "make own profile" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "edit own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

revoke all on public.profiles from anon;
grant select, insert, update on public.profiles to authenticated;


-- 2. 후기 -------------------------------------------------------------------------

create table if not exists public.reviews (
  id          bigint generated always as identity primary key,
  cafe_id     text not null check (char_length(cafe_id) between 1 and 40),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  rating      smallint not null check (rating between 1 and 5),   -- 유일한 필수 항목

  good_for    text[] not null default '{}' check (good_for <@ array['study', 'mood']),
  seats       smallint check (seats between 1 and 4),
  noise       smallint check (noise between 1 and 4),
  outlets     smallint check (outlets between 1 and 3),
  time_limit  smallint check (time_limit in (0, 2, 3, 4)),
  close_at    smallint check (close_at between 1 and 5),
  dessert     smallint check (dessert between 0 and 3),
  roasting    boolean,
  quirk       smallint check (quirk between 1 and 3),
  styles      text[] not null default '{}' check (
                cardinality(styles) <= 2 and
                styles <@ array['minimal','wood','vintage','retro','industrial','plants','hanok','gallery','cozy']
              ),
  body        text check (char_length(body) <= 300),

  unique (cafe_id, user_id)   -- 카페 하나에 한 사람당 후기 하나. 다시 쓰면 고쳐짐
);

create index if not exists reviews_cafe_idx on public.reviews (cafe_id, created_at desc);

alter table public.reviews enable row level security;

drop policy if exists "read own"   on public.reviews;
drop policy if exists "write own"  on public.reviews;
drop policy if exists "edit own"   on public.reviews;
drop policy if exists "delete own" on public.reviews;

create policy "read own"   on public.reviews for select to authenticated using (user_id = auth.uid());
create policy "write own"  on public.reviews for insert to authenticated with check (user_id = auth.uid());
create policy "edit own"   on public.reviews for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own" on public.reviews for delete to authenticated using (user_id = auth.uid());

revoke all on public.reviews from anon;
grant select, insert, update, delete on public.reviews to authenticated;


-- 3. 공개용 뷰: 계정 id는 빼고 닉네임과 표시만 ----------------------------------

drop view if exists public.reviews_public;
create view public.reviews_public as
  select r.id, r.cafe_id, r.created_at, r.rating,
         r.good_for, r.seats, r.noise, r.outlets, r.time_limit, r.close_at,
         r.dessert, r.roasting, r.quirk, r.styles, r.body,
         p.nickname, p.mark
  from public.reviews r
  join public.profiles p on p.id = r.user_id;

grant select on public.reviews_public to anon, authenticated;


-- 4. 탈퇴: 계정을 지우면 프로필과 후기가 연달아 지워짐 ---------------------------

create or replace function public.delete_me()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke all on function public.delete_me() from public, anon;
grant execute on function public.delete_me() to authenticated;
