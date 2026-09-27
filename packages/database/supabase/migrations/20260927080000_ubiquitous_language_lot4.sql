-- Finanças: crédito recebido, crédito disponível e UG emitente com o nome do glossário — fase EXPAND.
--
-- Lote 4 da linguagem ubíqua do sisub (`openspec/changes/sisub-ubiquitous-language`, D2, D4 e D9).
-- Numa UG executora não há dotação: a dotação é da LOA, no órgão. O que chega à UG por nota de
-- crédito (provisão ou destaque) é CRÉDITO RECEBIDO, e o saldo que o SIAFI informa é o CRÉDITO
-- DISPONÍVEL. A tela já rotula assim (D11 de `sisub-flexible-expense-execution`); a coluna ficou
-- com o nome antigo por medo de quebrar a `main`, e o espelho por trigger resolve isso. A UG
-- emitente da NE ganha o nome que a NC já usa (`finance.credit_note.issuer_ug`): um conceito, um
-- nome na mesma schema.
--
--   coluna (tabela fica com o nome)          → coluna
--   finance.budget_credit.dotacao            → received_credit
--   finance.budget_credit.saldo_siafi        → available_credit_siafi
--   finance.empenho.ug_emitente              → issuer_ug
--
-- ## Por que expand/contract
--
-- O banco é compartilhado e a `main` roda contra ele o tempo todo. Esta migration só ACRESCENTA
-- caminhos (técnica de 20260927040000):
--
--   * Coluna nova ao lado da antiga, backfill e um trigger BEFORE INSERT OR UPDATE que espelha os
--     dois sentidos e recusa valores divergentes. O código da `main` continua gravando e lendo o
--     nome antigo; o código novo grava e lê só o nome novo.
--   * A ANTIGA fica anulável e sem default até o contract: é o trigger que a preenche, e o código
--     novo não precisa citá-la (nem os tipos regerados a exigem no INSERT). O default sai porque,
--     com default nas duas, o INSERT do código antigo (só `dotacao`) chegaria ao trigger com
--     `received_credit = 0` e pareceria divergente; sem default, "não informado" é NULL.
--   * A NOVA de `budget_credit` nasce NOT NULL sem default nesta fase, pelo mesmo motivo: o trigger
--     aplica o antigo default (0) quando nenhuma das duas vem. O contract devolve `default 0` a ela.
--     NOT NULL é conferido depois dos triggers BEFORE, então o INSERT sem as colunas passa.
--   * `issuer_ug` é texto anulável sem default, como `ug_emitente`: espelho por NULL, como o lote 2.
--
-- O que cita as colunas antigas no banco vivo (`pg_proc.prosrc`/`prosqlbody`, `pg_views`,
-- `pg_matviews`, `pg_policies` e `pg_depend`, conferidos em 2026-09-27): só
-- `siafi_integration.apply_document_row` (import de NE do SIAFI, grava `ug_emitente`), recriada
-- abaixo com `issuer_ug`. Nenhuma view, policy, índice ou constraint usa as três (`v_empenho_*` e
-- `v_siafi_reconciliation` leem valor, status e eventos). Os grants são por tabela (sem grant de
-- coluna): `service_role` e, em `finance.empenho`, `analytics_reader` alcançam as colunas novas sem
-- mudança. O bloco 0 confere de novo na hora de aplicar.
--
-- O CONTRACT (20260927090000) confere que antigas e novas não divergem, derruba os triggers, as
-- funções de espelho e as colunas antigas, e devolve o default de `received_credit` e
-- `available_credit_siafi`. Só pode ser aplicado depois do deploy do código que usa só os nomes
-- novos.

-- ─── 0. Conferência: só a função recriada aqui cita as colunas antigas ─────────────
--
-- plpgsql não cria dependência de coluna: uma função esquecida gravaria a coluna antiga pelo
-- espelho até o contract e quebraria depois dele, em produção.

do $$
declare
	offenders text;
begin
	select string_agg(p.oid::regprocedure::text, ', ') into offenders
	from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname not in ('pg_catalog', 'information_schema')
		and p.oid <> 'siafi_integration.apply_document_row(bigint,text,uuid,uuid,jsonb,date,uuid)'::regprocedure
		and (
			coalesce(p.prosrc, '') ~ '\m(dotacao|saldo_siafi|ug_emitente)\M'
			or coalesce(pg_get_function_sqlbody(p.oid), '') ~ '\m(dotacao|saldo_siafi|ug_emitente)\M'
		);
	if offenders is not null then
		raise exception 'funções citam dotacao/saldo_siafi/ug_emitente e precisam ser recriadas neste expand: %', offenders;
	end if;

	select string_agg(schemaname || '.' || viewname, ', ') into offenders
	from (
		select schemaname, viewname, definition from pg_views
		union all
		select schemaname, matviewname, definition from pg_matviews
	) v
	where definition ~ '\m(dotacao|saldo_siafi|ug_emitente)\M';
	if offenders is not null then
		raise exception 'views citam dotacao/saldo_siafi/ug_emitente: %', offenders;
	end if;

	select string_agg(schemaname || '.' || tablename || '.' || policyname, ', ') into offenders
	from pg_policies
	where coalesce(qual, '') || coalesce(with_check, '') ~ '\m(dotacao|saldo_siafi|ug_emitente)\M';
	if offenders is not null then
		raise exception 'policies citam dotacao/saldo_siafi/ug_emitente: %', offenders;
	end if;
end;
$$;

-- ─── 1. finance.budget_credit: crédito recebido e crédito disponível ───────────────

alter table finance.budget_credit add column received_credit numeric(14, 2);
alter table finance.budget_credit add column available_credit_siafi numeric(14, 2);
update finance.budget_credit set received_credit = dotacao, available_credit_siafi = saldo_siafi;
alter table finance.budget_credit alter column received_credit set not null;
alter table finance.budget_credit alter column available_credit_siafi set not null;

alter table finance.budget_credit alter column dotacao drop default;
alter table finance.budget_credit alter column dotacao drop not null;
alter table finance.budget_credit alter column saldo_siafi drop default;
alter table finance.budget_credit alter column saldo_siafi drop not null;

-- INSERT: aceita qualquer uma das duas de cada par e recusa as duas divergentes; nenhuma das duas
-- = 0 (o default de antes). UPDATE: vale a que mudou; as duas mudadas para valores diferentes são
-- recusadas. No fim a antiga sempre copia a nova.
create function finance.mirror_budget_credit_naming()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if tg_op = 'INSERT' then
		if new.received_credit is not null and new.dotacao is not null and new.received_credit <> new.dotacao then
			raise exception using
				errcode = '23514',
				message = format('finance.budget_credit: dotacao e received_credit divergem (%s ≠ %s)', new.dotacao, new.received_credit);
		end if;
		if new.available_credit_siafi is not null and new.saldo_siafi is not null and new.available_credit_siafi <> new.saldo_siafi then
			raise exception using
				errcode = '23514',
				message = format('finance.budget_credit: saldo_siafi e available_credit_siafi divergem (%s ≠ %s)', new.saldo_siafi, new.available_credit_siafi);
		end if;
		new.received_credit := coalesce(new.received_credit, new.dotacao, 0);
		new.available_credit_siafi := coalesce(new.available_credit_siafi, new.saldo_siafi, 0);
	else
		if new.received_credit is distinct from old.received_credit then
			if new.dotacao is distinct from old.dotacao and new.dotacao is distinct from new.received_credit then
				raise exception using
					errcode = '23514',
					message = format('finance.budget_credit: dotacao e received_credit divergem (%s ≠ %s)', new.dotacao, new.received_credit);
			end if;
		elsif new.dotacao is distinct from old.dotacao then
			new.received_credit := new.dotacao;
		end if;
		if new.available_credit_siafi is distinct from old.available_credit_siafi then
			if new.saldo_siafi is distinct from old.saldo_siafi and new.saldo_siafi is distinct from new.available_credit_siafi then
				raise exception using
					errcode = '23514',
					message = format('finance.budget_credit: saldo_siafi e available_credit_siafi divergem (%s ≠ %s)', new.saldo_siafi, new.available_credit_siafi);
			end if;
		elsif new.saldo_siafi is distinct from old.saldo_siafi then
			new.available_credit_siafi := new.saldo_siafi;
		end if;
	end if;
	new.dotacao := new.received_credit;
	new.saldo_siafi := new.available_credit_siafi;
	return new;
end;
$$;

create trigger budget_credit_mirror_naming
before insert or update on finance.budget_credit
for each row execute function finance.mirror_budget_credit_naming();

comment on function finance.mirror_budget_credit_naming() is
	'Expand de 20260927080000: mantém as colunas antigas iguais a received_credit e available_credit_siafi enquanto o código antigo as escreve. Removida em 20260927090000.';

comment on column finance.budget_credit.received_credit is
	'Crédito RECEBIDO pela UG na classificação (provisão/destaque, somadas as NC). Numa UG executora não há dotação (ela é da LOA, no órgão): há crédito descentralizado. A tela rotula "Crédito recebido"; o crédito disponível é available_credit_siafi.';
comment on column finance.budget_credit.available_credit_siafi is
	'Crédito disponível na classificação segundo o SIAFI, na data de snapshot_at. O sisub nunca o recalcula; o comprometimento local aparece ao lado.';
comment on column finance.budget_credit.dotacao is 'Obsoleta: espelho de received_credit até o contract 20260927090000.';
comment on column finance.budget_credit.saldo_siafi is 'Obsoleta: espelho de available_credit_siafi até o contract 20260927090000.';

-- ─── 2. finance.empenho: UG emitente ─────────────────────────────────────────────

alter table finance.empenho add column issuer_ug text;
update finance.empenho set issuer_ug = ug_emitente where ug_emitente is not null;

create function finance.mirror_empenho_issuer_ug()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if tg_op = 'INSERT' then
		if new.issuer_ug is not null and new.ug_emitente is not null and new.issuer_ug <> new.ug_emitente then
			raise exception using
				errcode = '23514',
				message = format('finance.empenho: ug_emitente e issuer_ug divergem (%s ≠ %s)', new.ug_emitente, new.issuer_ug);
		end if;
		new.issuer_ug := coalesce(new.issuer_ug, new.ug_emitente);
	elsif new.issuer_ug is distinct from old.issuer_ug then
		if new.ug_emitente is distinct from old.ug_emitente and new.ug_emitente is distinct from new.issuer_ug then
			raise exception using
				errcode = '23514',
				message = format('finance.empenho: ug_emitente e issuer_ug divergem (%s ≠ %s)', new.ug_emitente, new.issuer_ug);
		end if;
	elsif new.ug_emitente is distinct from old.ug_emitente then
		new.issuer_ug := new.ug_emitente;
	end if;
	new.ug_emitente := new.issuer_ug;
	return new;
end;
$$;

create trigger empenho_mirror_issuer_ug
before insert or update on finance.empenho
for each row execute function finance.mirror_empenho_issuer_ug();

comment on function finance.mirror_empenho_issuer_ug() is
	'Expand de 20260927080000: mantém a coluna antiga igual a issuer_ug enquanto o código antigo a escreve. Removida em 20260927090000.';

comment on column finance.empenho.issuer_ug is 'UG emitente da NE (a mesma grandeza de finance.credit_note.issuer_ug).';
comment on column finance.empenho.ug_emitente is 'Obsoleta: espelho de issuer_ug até o contract 20260927090000.';

-- ─── 3. Import do SIAFI grava o nome novo ────────────────────────────────────────
--
-- Mesmo corpo de 20260926214000, com `issuer_ug` no lugar de `ug_emitente`. `create or replace`
-- mantém dono e ACL: executável só por `postgres` e `service_role`.

create or replace function siafi_integration.apply_document_row(
  p_unit_id bigint,
  p_report_type text,
  p_row_id uuid,
  p_batch_id uuid,
  p_parsed jsonb,
  p_competencia date,
  p_actor uuid
) returns text
language plpgsql
set search_path = ''
as $$
declare
  v_number text;
  v_parent_number text;
  v_value numeric;
  v_date date := coalesce(siafi_integration.parsed_date(p_parsed->>'data'), (now() at time zone 'America/Sao_Paulo')::date);
  v_cnpj text := case when p_parsed->>'favorecido_cnpj' ~ '^[0-9]{14}$' then p_parsed->>'favorecido_cnpj' end;
  v_tipo text := case
    when lower(coalesce(p_parsed->>'tipo_empenho', '')) like 'ordin%' then 'ordinario'
    when lower(coalesce(p_parsed->>'tipo_empenho', '')) like 'estim%' then 'estimativo'
    when lower(coalesce(p_parsed->>'tipo_empenho', '')) like 'glob%' then 'global'
  end;
  v_existing record;
  v_parent uuid;
  v_new uuid;
begin
  v_value := case when p_parsed->>'valor' ~ '^-?[0-9]+(\.[0-9]+)?$' then (p_parsed->>'valor')::numeric end;

  if p_report_type = 'ne' then
    v_number := upper(btrim(coalesce(p_parsed->>'numero_ne', '')));
    if v_number = '' then return 'skipped'; end if;

    select e.id, e.valor_total into v_existing
      from finance.empenho e where e.unit_id = p_unit_id and e.numero_empenho = v_number;
    if found then
      update finance.empenho e set
        nd = coalesce(e.nd, nullif(p_parsed->>'nd', '')),
        ptres = coalesce(e.ptres, nullif(p_parsed->>'ptres', '')),
        fonte = coalesce(e.fonte, nullif(p_parsed->>'fonte', '')),
        issuer_ug = coalesce(e.issuer_ug, nullif(p_parsed->>'ug', '')),
        favorecido_cnpj = coalesce(e.favorecido_cnpj, v_cnpj),
        favorecido_nome = coalesce(e.favorecido_nome, nullif(p_parsed->>'favorecido_nome', '')),
        tipo = coalesce(e.tipo, v_tipo),
        exercicio = coalesce(e.exercicio, extract(year from v_date)::integer),
        siafi_synced_at = now()
       where e.id = v_existing.id;
      update siafi_integration.import_row
         set parse_status = 'parsed', parse_error = null, applied_table = 'finance.empenho', applied_id = v_existing.id
       where id = p_row_id;
      return case when v_value is not null and abs(v_existing.valor_total - v_value) > 0.009 then 'enriched_divergent' else 'enriched' end;
    end if;

    if v_value is null then
      raise exception 'NE % sem valor no relatório', v_number;
    end if;
    insert into finance.empenho (
      unit_id, numero_empenho, data_empenho, valor_total, nd, ptres, fonte, issuer_ug,
      favorecido_cnpj, favorecido_nome, tipo, exercicio, origem, siafi_synced_at, import_batch_id, created_by
    ) values (
      p_unit_id, v_number, v_date, v_value, nullif(p_parsed->>'nd', ''), nullif(p_parsed->>'ptres', ''),
      nullif(p_parsed->>'fonte', ''), nullif(p_parsed->>'ug', ''), v_cnpj, nullif(p_parsed->>'favorecido_nome', ''),
      v_tipo, extract(year from v_date)::integer, 'siafi', now(), p_batch_id, p_actor
    ) returning id into v_new;
    update siafi_integration.import_row
       set parse_status = 'parsed', parse_error = null, applied_table = 'finance.empenho', applied_id = v_new
     where id = p_row_id;
    return 'created';
  end if;

  if p_report_type = 'ns' then
    v_number := upper(btrim(coalesce(p_parsed->>'numero_ns', '')));
    if v_number = '' then return 'skipped'; end if;

    select l.id into v_existing from finance.liquidacao l where l.unit_id = p_unit_id and l.numero_ns = v_number;
    if found then
      update finance.liquidacao set origem = 'siafi' where id = v_existing.id;
      update siafi_integration.import_row
         set parse_status = 'parsed', parse_error = null, applied_table = 'finance.liquidacao', applied_id = v_existing.id
       where id = p_row_id;
      return 'enriched';
    end if;

    v_parent_number := upper(btrim(coalesce(p_parsed->>'ne_origem', p_parsed->>'numero_ne', '')));
    if v_parent_number = '' then
      -- Sem o número da NE no relatório não há o que esperar: fica na conciliação.
      update siafi_integration.import_row
         set parse_error = 'NS sem a NE de origem no relatório: vincule pela conciliação'
       where id = p_row_id;
      return 'unlinked';
    end if;
    select e.id into v_parent from finance.empenho e where e.unit_id = p_unit_id and e.numero_empenho = v_parent_number;
    if v_parent is null then
      update siafi_integration.import_row
         set parse_status = 'waiting_parent', parse_error = 'Aguardando a NE ' || v_parent_number
       where id = p_row_id;
      return 'waiting';
    end if;
    if v_value is null or v_value <= 0 then
      raise exception 'NS % sem valor no relatório', v_number;
    end if;
    insert into finance.liquidacao (unit_id, empenho_id, numero_ns, data, valor, competencia, origem, import_batch_id, created_by)
    values (p_unit_id, v_parent, v_number, v_date, v_value, p_competencia, 'siafi', p_batch_id, p_actor)
    returning id into v_new;
    update siafi_integration.import_row
       set parse_status = 'parsed', parse_error = null, applied_table = 'finance.liquidacao', applied_id = v_new
     where id = p_row_id;
    return 'created';
  end if;

  if p_report_type = 'ob' then
    v_number := upper(btrim(coalesce(p_parsed->>'numero_ob', '')));
    if v_number = '' then return 'skipped'; end if;

    select p.id into v_existing from finance.pagamento p where p.unit_id = p_unit_id and p.numero_ob = v_number;
    if found then
      update finance.pagamento set origem = 'siafi' where id = v_existing.id;
      update siafi_integration.import_row
         set parse_status = 'parsed', parse_error = null, applied_table = 'finance.pagamento', applied_id = v_existing.id
       where id = p_row_id;
      return 'enriched';
    end if;

    v_parent_number := upper(btrim(coalesce(p_parsed->>'ns_origem', p_parsed->>'numero_ns', '')));
    if v_parent_number = '' then
      update siafi_integration.import_row
         set parse_error = 'OB sem a NS de origem no relatório: vincule pela conciliação'
       where id = p_row_id;
      return 'unlinked';
    end if;
    select l.id into v_parent from finance.liquidacao l where l.unit_id = p_unit_id and l.numero_ns = v_parent_number;
    if v_parent is null then
      update siafi_integration.import_row
         set parse_status = 'waiting_parent', parse_error = 'Aguardando a NS ' || v_parent_number
       where id = p_row_id;
      return 'waiting';
    end if;
    if v_value is null or v_value <= 0 then
      raise exception 'OB % sem valor no relatório', v_number;
    end if;
    insert into finance.pagamento (unit_id, liquidacao_id, numero_ob, data, valor, origem, import_batch_id, created_by)
    values (p_unit_id, v_parent, v_number, v_date, v_value, 'siafi', p_batch_id, p_actor)
    returning id into v_new;
    update siafi_integration.import_row
       set parse_status = 'parsed', parse_error = null, applied_table = 'finance.pagamento', applied_id = v_new
     where id = p_row_id;
    return 'created';
  end if;

  raise exception 'Tipo de relatório sem aplicação de documento: %', p_report_type;
end;
$$;
