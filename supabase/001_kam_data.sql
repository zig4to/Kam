-- Kam — ena vrstica na uporabnika; cela vsebina aplikacije (shranjene točke,
-- območja, gorovja, seznam "Vem kam grem") je en jsonb blob v stolpcu `data`.
-- Zaženi v Supabase SQL Editor projekta TomStudios (abjnxhfxjolwwxlckkje).

create table if not exists public.kam_data (
  user_id uuid primary key default auth.uid()
    references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.kam_data enable row level security;

drop policy if exists "select own row" on public.kam_data;
drop policy if exists "insert own row" on public.kam_data;
drop policy if exists "update own row" on public.kam_data;
drop policy if exists "delete own row" on public.kam_data;

create policy "select own row" on public.kam_data
  for select using (auth.uid() = user_id);
create policy "insert own row" on public.kam_data
  for insert with check (auth.uid() = user_id);
create policy "update own row" on public.kam_data
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own row" on public.kam_data
  for delete using (auth.uid() = user_id);
