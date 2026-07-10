-- ============================================================
-- DataMaster · Allocator — Schema Supabase (Postgres + RLS)
-- Execute no SQL Editor do Supabase (uma vez, na ordem).
-- Multiusuário: cada linha pertence a um usuário (auth.uid()).
-- MEMÓRIA ANTERIOR: a análise mais recente de um cliente é a
-- "foto do último planilhamento" usada no matching da próxima.
-- ============================================================

-- ---------- Carteira de clientes ----------
create table if not exists public.clientes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome        text not null,
  cnpj        text default '',
  grupo       text default '',
  setor       text default '',
  created_at  timestamptz not null default now()
);

-- ---------- Análises (planilhamentos) ----------
create table if not exists public.analises (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cliente_id       uuid references public.clientes(id) on delete set null,
  empresa          text default '',
  cnpj             text default '',
  grupo            text default '',
  status           text not null default 'rascunho',      -- rascunho | em_revisao | concluida
  unidade          text default 'Mil',
  moeda            text default 'BRL',
  is_balancete     boolean not null default false,
  anos             jsonb not null default '[]'::jsonb,     -- ["2023","2024","2025"]
  rows             jsonb not null default '[]'::jsonb,     -- Rastreabilidade finalizada (14 colunas)
  qa               jsonb,                                  -- issues + summary do parecer
  n_linhas         int default 0,
  balanco_fechado  boolean default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists analises_cliente_recentes
  on public.analises (cliente_id, updated_at desc);
create index if not exists analises_cnpj_recentes
  on public.analises (cnpj, updated_at desc);

-- ---------- Dicionário dinâmico (regras aprendidas/manuais) ----------
-- O seed oficial (1.285 regras) é embarcado no frontend; aqui ficam apenas
-- as regras APRENDIDAS com as análises salvas e as MANUAIS do usuário.
create table if not exists public.dicionario (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  chave         text not null,           -- origem_norm|grupo_norm|sub_norm
  origem        text not null,
  origem_norm   text not null,
  destino       text not null,
  grupo         text default '',
  sub_categoria text default '',
  fonte         text not null default 'manual',  -- aprendido | manual
  updated_at    timestamptz not null default now(),
  unique (user_id, chave)
);

-- ---------- Trilha de auditoria (aprendizado do dicionário) ----------
create table if not exists public.dicionario_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid(),
  ts         timestamptz not null default now(),
  acao       text not null,             -- learn | manual | delete
  chave      text not null,
  origem     text,
  destino    text,
  analise_id uuid
);

-- ============================================================
-- TRIGGER: aprendizado automático do dicionário no banco.
-- Ao salvar/atualizar uma análise, cada linha com
-- "Alocação da Hierarquia" = Sim e destino preenchido vira
-- (ou atualiza) uma regra origem -> destino do usuário.
-- Idempotente: upsert por (user_id, chave).
-- ============================================================
create or replace function public.fn_aprender_dicionario()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  r jsonb;
  v_origem text; v_destino text; v_grupo text; v_sub text;
  v_chave text;
begin
  for r in select * from jsonb_array_elements(coalesce(new.rows, '[]'::jsonb))
  loop
    if (r->>'alocacaoHierarquia') = 'Sim'
       and coalesce(trim(r->>'destino'), '') <> '' then
      v_origem  := trim(r->>'origem');
      v_destino := trim(r->>'destino');
      v_grupo   := coalesce(trim(r->>'grupo'), '');
      v_sub     := coalesce(trim(r->>'subCategoria'), '');
      if v_origem = '' then continue; end if;
      v_chave := lower(unaccent(v_origem)) || '|' || lower(unaccent(v_grupo)) || '|' || lower(unaccent(v_sub));

      insert into public.dicionario (user_id, chave, origem, origem_norm, destino, grupo, sub_categoria, fonte, updated_at)
      values (new.user_id, v_chave, v_origem, lower(unaccent(v_origem)), v_destino, v_grupo, v_sub, 'aprendido', now())
      on conflict (user_id, chave)
      do update set destino = excluded.destino, updated_at = now();

      insert into public.dicionario_log (user_id, acao, chave, origem, destino, analise_id)
      values (new.user_id, 'learn', v_chave, v_origem, v_destino, new.id);
    end if;
  end loop;
  return new;
end;
$$;

-- unaccent é usada na normalização da chave
create extension if not exists unaccent;

drop trigger if exists trg_aprender_dicionario on public.analises;
create trigger trg_aprender_dicionario
  after insert or update of rows on public.analises
  for each row execute function public.fn_aprender_dicionario();

-- updated_at automático
create or replace function public.fn_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists trg_touch_analises on public.analises;
create trigger trg_touch_analises
  before update on public.analises
  for each row execute function public.fn_touch_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY: cada usuário vê apenas o que é dele.
-- ============================================================
alter table public.clientes       enable row level security;
alter table public.analises       enable row level security;
alter table public.dicionario     enable row level security;
alter table public.dicionario_log enable row level security;

drop policy if exists "clientes_own" on public.clientes;
create policy "clientes_own" on public.clientes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "analises_own" on public.analises;
create policy "analises_own" on public.analises
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "dicionario_own" on public.dicionario;
create policy "dicionario_own" on public.dicionario
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "dicionario_log_own" on public.dicionario_log;
create policy "dicionario_log_own" on public.dicionario_log
  for select using (auth.uid() = user_id);

-- ============================================================
-- VIEW de conveniência: memória anterior por cliente
-- (a análise mais recente de cada cliente).
-- ============================================================
create or replace view public.v_memoria_anterior as
select distinct on (coalesce(cliente_id::text, cnpj))
  id as analise_id, user_id, cliente_id, cnpj, empresa, anos, rows, updated_at
from public.analises
order by coalesce(cliente_id::text, cnpj), updated_at desc;
