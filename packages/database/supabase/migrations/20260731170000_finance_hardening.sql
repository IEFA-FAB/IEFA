-- ============================================================================
-- Hardening da execução orçamentária (passada de review)
-- ============================================================================
-- Três achados das mesmas classes que a review do épico de estoque pegou:
--
--  1. UNIQUE com colunas NULLABLE não dedupe (NULL <> NULL): crédito com
--     ug/ptres/fonte nulos DUPLICAVA a cada aplicação de lote em vez de
--     substituir o snapshot. Mesma pegadinha do "UNIQUE ignora deleted_at".
--  2. A invariante vigente ≥ liquidado só era checada na server fn (TOCTOU:
--     duas anulações concorrentes passavam, e qualquer outro caminho de
--     escrita furava) — vai para trigger, como já é em liquidação/pagamento.
--  3. Aplicar lote não era atômico: dois cliques aplicavam duas vezes (o
--     check de status e o update viviam em requests separados).
-- ============================================================================

-- (1) NULLS NOT DISTINCT — PG15+; aqui roda em PG17
alter table finance.budget_credit
  drop constraint budget_credit_classification_key;

alter table finance.budget_credit
  add constraint budget_credit_classification_key
  unique nulls not distinct (unit_id, ug, nd, ptres, fonte, competencia);

comment on constraint budget_credit_classification_key on finance.budget_credit is
  'NULLS NOT DISTINCT: ug/ptres/fonte nulos ainda contam como a MESMA classificação — sem isso o upsert duplicaria a linha a cada importação.';

-- (2) anulação não pode derrubar o vigente abaixo do já liquidado
create function finance.check_empenho_event_floor() returns trigger
language plpgsql as $$
declare
  v_vigente numeric(14,2);
  v_liquidado numeric(14,2);
begin
  if new.tipo not in ('anulacao', 'cancelamento') then return new; end if;

  -- serializa eventos concorrentes do mesmo empenho
  perform pg_advisory_xact_lock(hashtextextended('empenho_event:' || new.empenho_id::text, 42));

  select valor_vigente into v_vigente from finance.v_empenho_vigente where empenho_id = new.empenho_id;
  select coalesce(sum(valor), 0) into v_liquidado from finance.liquidacao where empenho_id = new.empenho_id;

  -- v_vigente já inclui os eventos anteriores; o novo ainda não está gravado
  if coalesce(v_vigente, 0) - new.valor < v_liquidado then
    raise exception 'Anulação deixaria o empenho vigente (%) abaixo do já liquidado (%)',
      coalesce(v_vigente, 0) - new.valor, v_liquidado;
  end if;
  return new;
end;
$$;

create trigger empenho_event_floor
  before insert on finance.empenho_event
  for each row execute function finance.check_empenho_event_floor();

-- (3) reserva atômica do lote: só UM caller consegue mover parsed → applying
create function siafi_integration.claim_import_batch(p_batch_id uuid)
returns table (claimed boolean, report_type text, unit_id bigint, competencia date)
language plpgsql as $$
declare
  v_row siafi_integration.import_batch%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('siafi_batch:' || p_batch_id::text, 42));

  select * into v_row from siafi_integration.import_batch where id = p_batch_id for update;
  if not found then raise exception 'Lote não encontrado'; end if;
  if v_row.status = 'applied' then
    raise exception 'Lote já aplicado em %', v_row.applied_at;
  end if;

  return query select true, v_row.report_type, v_row.unit_id, v_row.competencia;
end;
$$;

comment on function siafi_integration.claim_import_batch is
  'Reserva o lote para aplicação sob advisory lock — dois cliques simultâneos no botão "Aplicar" não aplicam duas vezes.';
