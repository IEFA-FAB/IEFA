-- ============================================================================
-- Fase 5 (execução orçamentária): conciliação SIAFI × sisub
-- ============================================================================
-- A conciliação MOSTRA divergência; não decide. O operador escolhe entre
-- "adotar o SIAFI" (atualiza o registro e marca origem=siafi) ou "manter e
-- justificar" — a escolha fica registrada e a divergência volta a aparecer se
-- persistir num lote novo.
-- ============================================================================

create table finance.reconciliation_decision (
  id uuid primary key default gen_random_uuid(),
  unit_id bigint not null references core.units (id),
  documento_tipo text not null check (documento_tipo in ('ne', 'ns', 'ob')),
  numero_documento text not null,
  -- valores no momento da decisão: se um lote novo trouxer outro valor, a
  -- divergência reaparece (a decisão anterior vira contexto, não silêncio)
  valor_sisub numeric(14,2),
  valor_siafi numeric(14,2),
  decisao text not null check (decisao in ('adotado_siafi', 'mantido_local')),
  justificativa text,
  decided_by uuid references auth.users (id),
  decided_at timestamptz not null default now(),
  constraint reconciliation_decision_key unique (unit_id, documento_tipo, numero_documento)
);

comment on table finance.reconciliation_decision is
  'Resolução explícita de divergência SIAFI × sisub. Guarda os valores do momento da decisão para que uma divergência NOVA no mesmo documento volte a ser listada.';

-- ----------------------------------------------------------------------------
-- Divergências por documento (NE/NS/OB) entre o domínio e o último lote
-- ----------------------------------------------------------------------------
create view finance.v_siafi_reconciliation
  with (security_invoker = true) as
with siafi_rows as (
  select
    b.unit_id,
    b.report_type as documento_tipo,
    coalesce(r.parsed->>'numero_ne', r.parsed->>'numero_ns', r.parsed->>'numero_ob') as numero_documento,
    (r.parsed->>'valor')::numeric as valor_siafi,
    b.created_at as lote_em,
    b.id as batch_id,
    row_number() over (
      partition by b.unit_id, b.report_type,
        coalesce(r.parsed->>'numero_ne', r.parsed->>'numero_ns', r.parsed->>'numero_ob')
      order by b.created_at desc
    ) as recencia
  from siafi_integration.import_row r
  join siafi_integration.import_batch b on b.id = r.batch_id
  where r.parse_status = 'parsed' and b.report_type in ('ne', 'ns', 'ob')
),
latest_siafi as (
  select * from siafi_rows where recencia = 1 and numero_documento is not null
),
sisub_rows as (
  select e.unit_id, 'ne' as documento_tipo, e.numero_empenho as numero_documento, v.valor_vigente as valor_sisub
    from finance.empenho e
    join finance.v_empenho_vigente v on v.empenho_id = e.id
  union all
  select l.unit_id, 'ns', l.numero_ns, l.valor from finance.liquidacao l
  union all
  select p.unit_id, 'ob', p.numero_ob, p.valor from finance.pagamento p
)
select
  coalesce(s.unit_id, f.unit_id) as unit_id,
  coalesce(s.documento_tipo, f.documento_tipo) as documento_tipo,
  coalesce(s.numero_documento, f.numero_documento) as numero_documento,
  s.valor_sisub,
  f.valor_siafi,
  f.batch_id,
  f.lote_em,
  case
    when f.numero_documento is null then 'apenas_sisub'
    when s.numero_documento is null then 'apenas_siafi'
    when abs(coalesce(s.valor_sisub, 0) - coalesce(f.valor_siafi, 0)) > 0.009 then 'divergente'
    else 'conciliado'
  end as situacao,
  coalesce(f.valor_siafi, 0) - coalesce(s.valor_sisub, 0) as diferenca,
  d.decisao,
  d.justificativa,
  -- decisão só vale para os MESMOS valores; mudou o número, volta à lista
  (d.id is not null
    and d.valor_sisub is not distinct from s.valor_sisub
    and d.valor_siafi is not distinct from f.valor_siafi) as decisao_vigente
from sisub_rows s
full outer join latest_siafi f
  on f.unit_id = s.unit_id and f.documento_tipo = s.documento_tipo and f.numero_documento = s.numero_documento
left join finance.reconciliation_decision d
  on d.unit_id = coalesce(s.unit_id, f.unit_id)
 and d.documento_tipo = coalesce(s.documento_tipo, f.documento_tipo)
 and d.numero_documento = coalesce(s.numero_documento, f.numero_documento);

comment on view finance.v_siafi_reconciliation is
  'Documento a documento: apenas_sisub | apenas_siafi | divergente | conciliado, comparando o domínio com o LOTE MAIS RECENTE de cada número.';

-- ----------------------------------------------------------------------------
-- Conciliação físico × contábil: recebimento definitivo × liquidação
-- ----------------------------------------------------------------------------
create view finance.v_physical_accounting_reconciliation
  with (security_invoker = true) as
select
  gr.id as goods_receipt_id,
  gr.kitchen_id,
  gr.definitive_at,
  coalesce(sum(gri.received_qty_base * coalesce(gri.unit_cost, 0)), 0) as valor_recebido,
  l.id as liquidacao_id,
  l.numero_ns,
  l.valor as valor_liquidado,
  case
    when l.id is null then 'sem_liquidacao'
    when abs(coalesce(sum(gri.received_qty_base * coalesce(gri.unit_cost, 0)), 0) - l.valor) > 0.009 then 'valor_divergente'
    else 'conciliado'
  end as situacao,
  (current_date - gr.definitive_at::date) as dias_desde_recebimento
from inventory.goods_receipt gr
join inventory.goods_receipt_item gri on gri.receipt_id = gr.id
left join finance.liquidacao l on l.id = gr.liquidacao_id
where gr.definitive_at is not null
group by gr.id, gr.kitchen_id, gr.definitive_at, l.id, l.numero_ns, l.valor;

comment on view finance.v_physical_accounting_reconciliation is
  'Recebimento definitivo × liquidação: aponta recebimento sem NS (pendência contábil) e diferença de valor entre o físico e o liquidado.';

alter table finance.reconciliation_decision enable row level security;
