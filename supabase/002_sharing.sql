-- Kam — deljenje seznama "Vem kam grem" med uporabniki.
-- Vsak uporabnik ima profil z imenom, stikalom "prikaži točke ostalim" in
-- kopijo svojega seznama (shared_wishlist). Ko je share_enabled = true, lahko
-- ta profil (in samo seznam, ne ostalih podatkov) bere vsak prijavljen
-- uporabnik. Zaženi v Supabase SQL Editor projekta TomStudios.

create table if not exists public.kam_profiles (
  user_id uuid primary key default auth.uid()
    references auth.users(id) on delete cascade,
  display_name text not null default '',
  share_enabled boolean not null default false,
  shared_wishlist jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.kam_profiles enable row level security;

drop policy if exists "own profile"          on public.kam_profiles;
drop policy if exists "read shared profiles" on public.kam_profiles;

-- svoj profil: polna kontrola
create policy "own profile" on public.kam_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- profili z vklopljenim deljenjem: vsak prijavljen jih lahko bere
create policy "read shared profiles" on public.kam_profiles
  for select using (share_enabled = true);
