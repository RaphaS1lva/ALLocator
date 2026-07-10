-- ============================================================================
-- DataMaster — schema Supabase (Postgres) para quando migrar para nuvem.
-- Rode no SQL Editor do Supabase. Inclui o TRIGGER de dicionario dinamico
-- AUTOMATICO: cada analise salva ensina o dicionario a partir das linhas
-- alocadas (Alocacao da Hierarquia = 'Sim').
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------- Analises (cabecalho + linhas + ajustes em JSONB) ----------------
create table if not exists public.analises (
  id            uuid primary key default gen_random_uuid(),
  empresa       text,
  cnpj          text,
  grupo         text,
  auditado      text,
  consolidado   text,
  modelo        text,
  unidade       text,
  moeda         text,
  is_balancete  boolean default false,
  anos          jsonb  default '[]'::jsonb,
  rows          jsonb  default '[]'::jsonb,   -- linhas da Rastreabilidade
  adjustments   jsonb  default '{}'::jsonb,   -- Retirar/Adicionar/inversor por chaveDestino
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists idx_analises_cnpj on public.analises (cnpj);

-- ---------- Dicionario dinamico ---------------------------------------------
create table if not exists public.dicionario (
  id            uuid primary key default gen_random_uuid(),
  chave         text unique not null,          -- origem_norm|grupo_norm|sub_norm
  origem        text not null,
  origem_norm   text,
  destino       text not null,
  grupo         text,
  sub_categoria text,
  fonte         text default 'aprendido',      -- seed | aprendido | manual
  freq          integer default 1,
  updated_at    timestamptz default now()
);

-- ---------- Log de aprendizado ----------------------------------------------
create table if not exists public.dicionario_log (
  id            bigserial primary key,
  ts            timestamptz default now(),
  acao          text,                           -- novo | atualizado
  origem        text,
  destino       text,
  grupo         text,
  sub_categoria text,
  analise_id    uuid
);

-- ---------- Normalizacao (equivalente ao normalize_text do core) ------------
create or replace function public.dm_normalize(txt text)
returns text language sql immutable as $$
  select trim(regexp_replace(
           regexp_replace(
             lower(unaccent(coalesce(txt,''))),
             '[^a-z0-9\s]', ' ', 'g'),
           '\s+', ' ', 'g'))
$$;
-- Requer extensao unaccent:
create extension if not exists unaccent;

-- ---------- TRIGGER: dicionario dinamico automatico -------------------------
create or replace function public.learn_dicionario()
returns trigger language plpgsql as $$
declare
  item        jsonb;
  v_origem    text;
  v_destino   text;
  v_grupo     text;
  v_sub       text;
  v_chave     text;
  v_existing  text;
begin
  for item in select * from jsonb_array_elements(coalesce(new.rows, '[]'::jsonb))
  loop
    if coalesce(item->>'alocacaoHierarquia','') <> 'Sim' then continue; end if;
    v_destino := trim(coalesce(item->>'destino',''));
    if v_destino = '' then continue; end if;
    v_origem := trim(coalesce(item->>'origem',''));
    v_grupo  := trim(coalesce(item->>'grupo',''));
    v_sub    := trim(coalesce(item->>'subCategoria',''));
    v_chave  := public.dm_normalize(v_origem) || '|' ||
                public.dm_normalize(v_grupo)  || '|' ||
                public.dm_normalize(v_sub);

    select destino into v_existing from public.dicionario where chave = v_chave;

    insert into public.dicionario (chave, origem, origem_norm, destino, grupo, sub_categoria, fonte, freq, updated_at)
    values (v_chave, v_origem, public.dm_normalize(v_origem), v_destino, v_grupo, v_sub, 'aprendido', 1, now())
    on conflict (chave) do update
      set destino = excluded.destino,
          origem = excluded.origem,
          grupo = excluded.grupo,
          sub_categoria = excluded.sub_categoria,
          freq = public.dicionario.freq + 1,
          updated_at = now();

    if v_existing is null or public.dm_normalize(v_existing) <> public.dm_normalize(v_destino) then
      insert into public.dicionario_log (acao, origem, destino, grupo, sub_categoria, analise_id)
      values (case when v_existing is null then 'novo' else 'atualizado' end,
              v_origem, v_destino, v_grupo, v_sub, new.id);
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_learn_dicionario on public.analises;
create trigger trg_learn_dicionario
  after insert or update of rows on public.analises
  for each row execute function public.learn_dicionario();

-- ---------- RLS (ajuste conforme sua politica de seguranca) -----------------
-- DEMO: libera anon. EM PRODUCAO, restrinja por auth.uid()/matricula.
alter table public.analises      enable row level security;
alter table public.dicionario    enable row level security;
alter table public.dicionario_log enable row level security;

create policy if not exists p_analises_all   on public.analises      for all using (true) with check (true);
create policy if not exists p_dicionario_all on public.dicionario    for all using (true) with check (true);
create policy if not exists p_log_all        on public.dicionario_log for all using (true) with check (true);
