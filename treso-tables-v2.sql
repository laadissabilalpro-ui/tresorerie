-- ============================================================
--  TRESORERIE — v2 : dettes (« ce que je dois ») + marge % par jour
--  Projet Supabase : lpvuklsxnrqliarwvmst. Scopé par "code". Realtime activé.
--  À exécuter UNE FOIS dans le SQL Editor (après treso-tables.sql). Additif. Idempotent.
-- ============================================================

-- DETTES (« ce que je dois ») : liste à part, datée, total dû calculé par jour côté app
create table if not exists public.treso_dettes (
  id          uuid primary key,
  code        text not null,
  label       text,
  montant     numeric(12,2) not null,
  day         date not null,            -- date où la dette est contractée
  settled_day date,                     -- date de règlement (null = en cours)
  updated_at  timestamptz not null default now()
);
create index if not exists treso_dettes_code_idx on public.treso_dettes(code);

-- MARGE % PAR JOUR (saisie manuelle, affichée dans le registre)
create table if not exists public.treso_jours (
  code        text not null,
  day         date not null,
  marge       numeric(12,2),            -- marge en %, ex. 32 ou 32.5
  updated_at  timestamptz not null default now(),
  primary key (code, day)
);

-- RLS : accès anon complet (cohérent avec le reste, scopé par code côté app)
alter table public.treso_dettes enable row level security;
alter table public.treso_jours  enable row level security;

drop policy if exists anon_all on public.treso_dettes;
create policy anon_all on public.treso_dettes for all to anon, authenticated using (true) with check (true);
drop policy if exists anon_all on public.treso_jours;
create policy anon_all on public.treso_jours  for all to anon, authenticated using (true) with check (true);

grant all on public.treso_dettes, public.treso_jours to anon, authenticated;

-- Realtime (ignore l'erreur si déjà ajouté)
do $$ begin
  begin alter publication supabase_realtime add table public.treso_dettes; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.treso_jours;  exception when duplicate_object then null; end;
end $$;
