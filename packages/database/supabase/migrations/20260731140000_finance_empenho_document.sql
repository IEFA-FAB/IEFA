-- ============================================================================
-- Fase 3 (execução orçamentária): empenho como DOCUMENTO
-- ============================================================================
-- Hoje `finance.empenho` é um registro manual simplificado (número, data,
-- quantidade, valor). Passa a carregar a classificação orçamentária completa
-- e — o ponto central — o valor deixa de ser editável: reforço e anulação
-- entram como EVENTOS (mesma filosofia append-only do ledger de estoque;
-- correção por evento, nunca por UPDATE), e o valor vigente é derivado.
--
-- A invariante `pago ≤ liquidado ≤ vigente` é garantida por trigger nas
-- tabelas de liquidação/pagamento (fase 4) — aqui ficam as views que a
-- alimentam.
-- ============================================================================

alter table finance.empenho
  add column tipo text check (tipo in ('ordinario', 'estimativo', 'global')),
  add column favorecido_cnpj text check (favorecido_cnpj is null or favorecido_cnpj ~ '^[0-9]{14}$'),
  add column favorecido_nome text,
  add column nd text,
  add column ptres text,
  add column fonte text,
  add column ug_emitente text,
  add column exercicio integer,
  add column origem text not null default 'manual' check (origem in ('manual', 'siafi')),
  add column siafi_synced_at timestamptz,
  add column import_batch_id uuid references siafi_integration.import_batch (id) on delete set null,
  add column rp_inscrito boolean not null default false,
  add column rp_tipo text check (rp_tipo is null or rp_tipo in ('processado', 'nao_processado')),
  add column rp_exercicio integer;

comment on column finance.empenho.origem is
  'manual = lançado no sisub; siafi = criado/atualizado por importação do Tesouro Gerencial.';
comment on column finance.empenho.valor_total is
  'Valor ORIGINAL do empenho. O valor vigente = original + Σ eventos (ver finance.v_empenho_saldo) — não editar esta coluna para reforço/anulação.';

-- backfill: tudo que já existe é lançamento manual; exercício vem da data
update finance.empenho
  set exercicio = extract(year from data_empenho)::int
  where exercicio is null;

create index empenho_exercicio_idx on finance.empenho (unit_id, exercicio);
create index empenho_nd_idx on finance.empenho (unit_id, nd) where nd is not null;

-- ----------------------------------------------------------------------------
-- Eventos: reforço, anulação (parcial ou total) e cancelamento
-- ----------------------------------------------------------------------------
create table finance.empenho_event (
  id uuid primary key default gen_random_uuid(),
  empenho_id uuid not null references finance.empenho (id) on delete cascade,
  tipo text not null check (tipo in ('reforco', 'anulacao', 'cancelamento', 'rp_inscricao')),
  -- sempre POSITIVO; o sinal vem do tipo (reforço soma, anulação subtrai)
  valor numeric(14,2) not null check (valor >= 0),
  data date not null default current_date,
  documento text,
  justificativa text not null check (btrim(justificativa) <> ''),
  origem text not null default 'manual' check (origem in ('manual', 'siafi')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

comment on table finance.empenho_event is
  'Histórico append-only de reforço/anulação/cancelamento do empenho. Justificativa é obrigatória — o valor do empenho nunca é editado diretamente.';

create index empenho_event_empenho_idx on finance.empenho_event (empenho_id, data);

-- ----------------------------------------------------------------------------
-- Saldos derivados: vigente, liquidado, pago, a liquidar, a pagar
-- (liquidacao/pagamento chegam na fase 4 — a view já as referencia por LEFT
--  JOIN em tabelas criadas lá; por isso é criada naquela migration.)
-- ----------------------------------------------------------------------------
create view finance.v_empenho_vigente
  with (security_invoker = true) as
select
  e.id as empenho_id,
  e.unit_id,
  e.valor_total as valor_original,
  coalesce(sum(case when ev.tipo = 'reforco' then ev.valor
                    when ev.tipo in ('anulacao', 'cancelamento') then -ev.valor
                    else 0 end), 0) as ajustes,
  e.valor_total + coalesce(sum(case when ev.tipo = 'reforco' then ev.valor
                                    when ev.tipo in ('anulacao', 'cancelamento') then -ev.valor
                                    else 0 end), 0) as valor_vigente
from finance.empenho e
left join finance.empenho_event ev on ev.empenho_id = e.id
group by e.id, e.unit_id, e.valor_total;

comment on view finance.v_empenho_vigente is
  'Valor vigente do empenho = original + Σ eventos. Base da invariante pago ≤ liquidado ≤ vigente.';

alter table finance.empenho_event enable row level security;
