-- ============================================================
--  TRESORERIE — App perso (auto-entrepreneur parfumerie, La Reunion)
--  Projet Supabase : lpvuklsxnrqliarwvmst. Tout scope par "code". Realtime active.
--  A executer UNE FOIS dans le SQL Editor de Supabase. Strictement additif. Idempotent.
--  Aucune modif des tables existantes (Mon-Temps / Equipe-Dawah) — zero impact.
-- ============================================================

-- 1) REGLAGES (un enregistrement par code de synchro)
create table if not exists public.treso_settings (
  code           text primary key,
  fond           numeric(12,2) not null default 0,   -- fond de caisse (especes)
  init_especes   numeric(12,2) not null default 0,   -- solde de depart especes (physique, fond inclus)
  init_ca        numeric(12,2) not null default 0,   -- solde de depart Credit Agricole
  init_revolut   numeric(12,2) not null default 0,   -- solde de depart Revolut
  date_init      date,                               -- date d'initialisation
  seuil_especes  numeric(12,2),                      -- seuils d'alerte (nullable = desactive)
  seuil_ca       numeric(12,2),
  seuil_revolut  numeric(12,2),
  updated_at     timestamptz not null default now()
);

-- 2) MOUVEMENTS (id genere cote client = uuid, pour fiabilite offline)
create table if not exists public.treso_mouvements (
  id          uuid primary key,
  code        text not null,
  day         date not null,                         -- date du mouvement (YYYY-MM-DD)
  ts          bigint not null,                       -- epoch ms (heure + ordre)
  type        text not null check (type in ('VENTE','REMISE','ACHAT','CHARGE','RETRAIT')),
  compte      text not null check (compte in ('especes','ca','revolut')),
  montant     numeric(12,2) not null,                -- toujours positif ; le signe depend du type
  note        text,
  updated_at  timestamptz not null default now()
);

create index if not exists treso_mouvements_code_day_idx on public.treso_mouvements(code, day);
create index if not exists treso_mouvements_code_ts_idx  on public.treso_mouvements(code, ts desc);

-- 3) RLS : acces anon complet (coherent avec le reste, scope par code cote app)
alter table public.treso_settings   enable row level security;
alter table public.treso_mouvements enable row level security;

drop policy if exists anon_all on public.treso_settings;
create policy anon_all on public.treso_settings   for all to anon, authenticated using (true) with check (true);
drop policy if exists anon_all on public.treso_mouvements;
create policy anon_all on public.treso_mouvements for all to anon, authenticated using (true) with check (true);

grant all on public.treso_settings, public.treso_mouvements to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- 4) Realtime (ignore l'erreur si deja ajoute)
do $$ begin
  begin
    alter publication supabase_realtime add table public.treso_settings;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.treso_mouvements;
  exception when duplicate_object then null;
  end;
end $$;
