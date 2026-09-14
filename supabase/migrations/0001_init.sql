-- ─────────────────────────────────────────────────────────────────────────────
-- 밑줄 — 초기 스키마
--
-- 적용 방법 (로컬 컴퓨터 없이):
--   Supabase 대시보드 > 프로젝트 > SQL Editor > New query
--   이 파일 전체를 붙여넣고 Run.
--
-- 이 파일은 Phase 1 에서 사용합니다. Phase 0 배포에는 필요하지 않습니다.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── books ────────────────────────────────────────────────────────────────────
create table if not exists public.books (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null check (length(trim(title)) > 0),
  author      text,
  cover_path  text,                       -- Storage 내 경로. 표지는 직접 촬영한다.
  status      text not null default 'reading'
              check (status in ('reading', 'finished', 'wishlist')),
  rating      smallint check (rating between 1 and 5),
  review      text,
  started_at  date,
  finished_at date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── highlights ───────────────────────────────────────────────────────────────
create table if not exists public.highlights (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  book_id    uuid not null references public.books (id) on delete cascade,
  text       text not null check (length(trim(text)) > 0),
  page       integer check (page > 0),
  note       text,
  tags       text[] not null default '{}',
  image_path text,                        -- 원본 사진의 Storage 경로
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── daily_picks ──────────────────────────────────────────────────────────────
-- 오늘의 문장 이력. 최근 30일 안에 보여준 문장을 다시 뽑지 않기 위해 쓴다.
create table if not exists public.daily_picks (
  user_id      uuid not null references auth.users (id) on delete cascade,
  pick_date    date not null,
  highlight_id uuid not null references public.highlights (id) on delete cascade,
  primary key (user_id, pick_date)
);

-- ── push_subs (Phase 3) ──────────────────────────────────────────────────────
create table if not exists public.push_subs (
  endpoint   text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  keys       jsonb not null,
  enabled    boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── 인덱스 ───────────────────────────────────────────────────────────────────
-- RLS 정책이 거르는 컬럼에는 인덱스가 반드시 있어야 한다. 없으면 정책이
-- 모든 행을 훑는다.
create index if not exists books_user_idx        on public.books (user_id, created_at desc);
create index if not exists highlights_user_idx   on public.highlights (user_id, created_at desc);
create index if not exists highlights_book_idx   on public.highlights (book_id, page nulls last, created_at);
create index if not exists daily_picks_user_idx  on public.daily_picks (user_id, pick_date desc);
create index if not exists push_subs_user_idx    on public.push_subs (user_id);

-- 문장 검색용. 한국어 형태소 사전이 없으므로 전문검색 대신 trigram 을 쓴다.
create extension if not exists pg_trgm;
create index if not exists highlights_text_trgm_idx
  on public.highlights using gin (text gin_trgm_ops);

-- ── updated_at 자동 갱신 ─────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists books_touch_updated_at on public.books;
create trigger books_touch_updated_at
  before update on public.books
  for each row execute function public.touch_updated_at();

drop trigger if exists highlights_touch_updated_at on public.highlights;
create trigger highlights_touch_updated_at
  before update on public.highlights
  for each row execute function public.touch_updated_at();

-- ── 행 수준 보안 (RLS) ───────────────────────────────────────────────────────
-- 정책만으로는 부족하다. anon 롤에 남아 있을 수 있는 테이블 권한을 먼저 회수한다.
alter table public.books       enable row level security;
alter table public.highlights  enable row level security;
alter table public.daily_picks enable row level security;
alter table public.push_subs   enable row level security;

revoke all on public.books, public.highlights, public.daily_picks, public.push_subs
  from anon, authenticated;
grant select, insert, update, delete
  on public.books, public.highlights, public.daily_picks, public.push_subs
  to authenticated;

-- auth.uid() 는 반드시 서브셀렉트로 감싼다. 그냥 쓰면 행마다 재평가되고,
-- 감싸면 initPlan 으로 한 번만 평가된다.
do $$
declare
  t text;
begin
  foreach t in array array['books', 'highlights', 'daily_picks', 'push_subs'] loop
    execute format('drop policy if exists %I_owner_select on public.%I', t, t);
    execute format('drop policy if exists %I_owner_insert on public.%I', t, t);
    execute format('drop policy if exists %I_owner_update on public.%I', t, t);
    execute format('drop policy if exists %I_owner_delete on public.%I', t, t);

    execute format(
      'create policy %I_owner_select on public.%I for select to authenticated
         using ((select auth.uid()) = user_id)', t, t);
    execute format(
      'create policy %I_owner_insert on public.%I for insert to authenticated
         with check ((select auth.uid()) = user_id)', t, t);
    execute format(
      'create policy %I_owner_update on public.%I for update to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)', t, t);
    execute format(
      'create policy %I_owner_delete on public.%I for delete to authenticated
         using ((select auth.uid()) = user_id)', t, t);
  end loop;
end;
$$;
