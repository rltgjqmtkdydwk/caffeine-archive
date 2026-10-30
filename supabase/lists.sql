-- 그룹 (카페 모음)
-- cafes.sql 다음에 실행. 여러 번 실행해도 안전하게 작성
--
-- 구조
--   lists        사용자가 만든 그룹. 기본으로 카공·느좋 그룹이 하나씩 생김
--   list_items   그룹에 담긴 카페
--
-- 그룹은 기본 비공개. 공유를 켜면 추측하기 어려운 share_id가 생기고,
-- 그 링크를 아는 사람만 get_shared_list()로 볼 수 있음 (계정 id는 안 나가고 닉네임만)


-- 1. 그룹 -------------------------------------------------------------------------

create table if not exists public.lists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 20),
  kind        text check (kind in ('study', 'mood')),     -- 기본 그룹 표시. 직접 만든 그룹은 null
  share_id    text unique,                                -- null이면 비공개
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists lists_default_idx on public.lists (user_id, kind) where kind is not null;
create index if not exists lists_user_idx on public.lists (user_id, created_at);

create table if not exists public.list_items (
  list_id   uuid not null references public.lists (id) on delete cascade,
  cafe_id   text not null check (char_length(cafe_id) between 1 and 40),
  added_at  timestamptz not null default now(),
  primary key (list_id, cafe_id)
);

create index if not exists list_items_cafe_idx on public.list_items (cafe_id);


-- 2. 권한: 내 그룹만 보고 고치기 -------------------------------------------------

alter table public.lists enable row level security;
alter table public.list_items enable row level security;

drop policy if exists "own lists read"   on public.lists;
drop policy if exists "own lists write"  on public.lists;
drop policy if exists "own lists edit"   on public.lists;
drop policy if exists "own lists delete" on public.lists;
drop policy if exists "own items read"   on public.list_items;
drop policy if exists "own items write"  on public.list_items;
drop policy if exists "own items delete" on public.list_items;

create policy "own lists read"   on public.lists for select to authenticated using (user_id = auth.uid());
create policy "own lists write"  on public.lists for insert to authenticated with check (user_id = auth.uid() and kind is null);
create policy "own lists edit"   on public.lists for update to authenticated using (user_id = auth.uid() and kind is null) with check (user_id = auth.uid());
create policy "own lists delete" on public.lists for delete to authenticated using (user_id = auth.uid() and kind is null);

create policy "own items read"   on public.list_items for select to authenticated
  using (exists (select 1 from public.lists l where l.id = list_id and l.user_id = auth.uid()));
create policy "own items write"  on public.list_items for insert to authenticated
  with check (exists (select 1 from public.lists l where l.id = list_id and l.user_id = auth.uid()));
create policy "own items delete" on public.list_items for delete to authenticated
  using (exists (select 1 from public.lists l where l.id = list_id and l.user_id = auth.uid()));

revoke all on public.lists, public.list_items from anon, authenticated;
grant select, delete on public.lists to authenticated;
grant insert (name), update (name) on public.lists to authenticated;   -- share_id, kind는 아래 함수로만
grant select, insert (list_id, cafe_id), delete on public.list_items to authenticated;

-- 그룹은 한 사람당 30개, 그룹 하나에 카페 500곳까지
create or replace function public.lists_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'lists' then
    if (select count(*) from public.lists where user_id = new.user_id) >= 30 then
      raise exception 'too many lists';
    end if;
  else
    if (select count(*) from public.list_items where list_id = new.list_id) >= 500 then
      raise exception 'list is full';
    end if;
    update public.lists set updated_at = now() where id = new.list_id;
  end if;
  return new;
end;
$$;

drop trigger if exists lists_limit on public.lists;
create trigger lists_limit before insert on public.lists for each row execute function public.lists_limit();
drop trigger if exists list_items_limit on public.list_items;
create trigger list_items_limit before insert on public.list_items for each row execute function public.lists_limit();


-- 3. 함수 --------------------------------------------------------------------------

-- 기본 그룹(카공·느좋)이 없으면 만들어 줌. 로그인할 때마다 불러도 됨
create or replace function public.ensure_default_lists()
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.lists (user_id, name, kind)
  select auth.uid(), d.name, d.kind
  from (values ('카공', 'study'), ('느좋', 'mood')) as d (name, kind)
  where auth.uid() is not null
    and exists (select 1 from public.profiles where id = auth.uid())
  on conflict do nothing;
$$;

-- 공유 켜기: 링크용 id를 만들어서 돌려줌 (이미 있으면 그대로)
create or replace function public.share_list(p_list uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  sid text;
begin
  select share_id into sid from public.lists where id = p_list and user_id = auth.uid();
  if not found then
    raise exception 'not your list';
  end if;
  if sid is null then
    sid := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
    update public.lists set share_id = sid, updated_at = now() where id = p_list;
  end if;
  return sid;
end;
$$;

-- 공유 끄기: 예전 링크는 더 이상 안 열림
create or replace function public.unshare_list(p_list uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.lists set share_id = null, updated_at = now()
  where id = p_list and user_id = auth.uid();
$$;

-- 공유된 그룹 보기. 로그인 안 해도 됨
create or replace function public.get_shared_list(p_share text)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'name', l.name,
    'nickname', p.nickname,
    'mark', p.mark,
    'cafes', coalesce((
      select json_agg(c order by i.added_at desc)
      from public.list_items i
      join public.cafes_public c on c.id = i.cafe_id
      where i.list_id = l.id
    ), '[]'::json)
  )
  from public.lists l
  join public.profiles p on p.id = l.user_id
  where l.share_id = p_share and p_share is not null;
$$;

revoke all on function public.ensure_default_lists() from public, anon;
revoke all on function public.share_list(uuid) from public, anon;
revoke all on function public.unshare_list(uuid) from public, anon;
revoke all on function public.get_shared_list(text) from public;
grant execute on function public.ensure_default_lists() to authenticated;
grant execute on function public.share_list(uuid) to authenticated;
grant execute on function public.unshare_list(uuid) to authenticated;
grant execute on function public.get_shared_list(text) to anon, authenticated;
