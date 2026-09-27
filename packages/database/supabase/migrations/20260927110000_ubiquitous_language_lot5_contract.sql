-- Valores de domínio na língua da norma — fase CONTRACT.
--
-- Lote 5 da linguagem ubíqua do sisub (`openspec/changes/sisub-ubiquitous-language`, D2 e D4). O
-- expand (20260927100000) alargou os CHECKs para os dois vocabulários, e o código do PR dele lê os
-- dois e ainda grava o antigo. Aqui:
--
--   1. as linhas passam ao vocabulário do glossário;
--   2. os CHECKs ficam só com ele;
--   3. um trigger TRADUZ na gravação o valor antigo que ainda chegar, pela janela entre aplicar este
--      contract e o deploy do código que grava o valor novo (o PR deste contract).
--
--   coluna                                   valor antigo              → valor do glossário
--   procurement.contract_designation.role    manager                   → gestor
--                                            technical_inspector       → fiscal_tecnico
--                                            administrative_inspector  → fiscal_administrativo
--                                            sectoral_inspector        → fiscal_setorial
--                                            committee_member          → membro_comissao
--   inventory.inventory_count.type           annual                    → anual
--                                            responsibility_transfer   → transferencia_responsabilidade
--                                            rotating                  → rotativo
--   procurement.policy_rule.target           product                   → ingredient
--   kitchen.menu_template.template_type      exception                 → apoio
--   kitchen.menu_items.origin_template_type  exception                 → apoio
--   procurement.quantity_estimate_snapshot_selection.template_type (retrato, sem CHECK): exception → apoio
--
-- ## Por que o trigger de tradução
--
-- Sem ele, entre aplicar este contract e o deploy do código novo, a `main` (que ainda grava o valor
-- antigo) teria recusada toda gravação desses valores: designar, abrir inventário, criar regra de
-- insumo, criar ou aplicar cardápio de apoio e aceitar pedido de lanche (o item do dia nasce com a
-- origem do padrão). A execução não trava por janela de deploy. O trigger só dispara com o valor
-- antigo (`when`), converte-o antes do CHECK e nada mais; a `main` já lê os dois desde o expand.
-- Ele sai numa migration própria um ciclo depois do deploy deste PR (tarefa 5.5 da change),
-- conferido que nenhuma gravação o acionou.
--
-- ## Ordem
--
-- Só depois do deploy do código do expand (lê os dois), conferido em
-- `gh run list --branch main --workflow "CI/CD"`. Aplicado antes, a `main` anterior leria `gestor`,
-- `apoio`, `ingredient` e não reconheceria.

-- ─── 0. Conferência: nada além destes CHECKs compara com o valor antigo ──────────
--
-- Mesma conferência do expand: função, view, policy, índice, CHECK de outra tabela, default,
-- trigger e job do pg_cron. Depois deste contract o valor antigo não existe mais no banco, e uma
-- comparação esquecida deixaria de casar calada.

do $$
declare
	old_values constant text := '''(manager|technical_inspector|administrative_inspector|sectoral_inspector|committee_member|annual|responsibility_transfer|rotating|product|exception)''';
	domain_schemas constant text[] := array['core', 'kitchen', 'procurement', 'finance', 'inventory', 'access_control', 'siafi_integration', 'sisub', 'analytics'];
	offenders text;
begin
	select string_agg(p.oid::regprocedure::text, ', ') into offenders
	from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname not in ('pg_catalog', 'information_schema')
		and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
		and (
			coalesce(p.prosrc, '') ~ old_values
			or coalesce(pg_get_function_sqlbody(p.oid), '') ~ old_values
		);
	if offenders is not null then
		raise exception 'funções citam valor antigo do lote 5: %', offenders;
	end if;

	select string_agg(schemaname || '.' || viewname, ', ') into offenders
	from (
		select schemaname, viewname, definition from pg_views
		union all
		select schemaname, matviewname, definition from pg_matviews
	) v
	where definition ~ old_values;
	if offenders is not null then
		raise exception 'views citam valor antigo do lote 5: %', offenders;
	end if;

	select string_agg(schemaname || '.' || tablename || '.' || policyname, ', ') into offenders
	from pg_policies
	where coalesce(qual, '') || coalesce(with_check, '') ~ old_values;
	if offenders is not null then
		raise exception 'policies citam valor antigo do lote 5: %', offenders;
	end if;

	select string_agg(schemaname || '.' || indexname, ', ') into offenders
	from pg_indexes
	where schemaname = any(domain_schemas) and indexdef ~ old_values;
	if offenders is not null then
		raise exception 'índices parciais citam valor antigo do lote 5: %', offenders;
	end if;

	select string_agg(c.conrelid::regclass::text || '.' || c.conname, ', ') into offenders
	from pg_constraint c
	join pg_namespace n on n.oid = c.connamespace
	where n.nspname = any(domain_schemas)
		and c.contype = 'c'
		and c.conname not in (
			'contract_designation_role_check', 'inventory_count_type_check', 'policy_rule_target_check',
			'menu_template_template_type_check', 'menu_items_origin_template_type_check', 'menu_template_snack_complete_check'
		)
		and pg_get_constraintdef(c.oid) ~ old_values;
	if offenders is not null then
		raise exception 'CHECKs citam valor antigo do lote 5: %', offenders;
	end if;

	select string_agg(a.adrelid::regclass::text || '.' || att.attname, ', ') into offenders
	from pg_attrdef a
	join pg_attribute att on att.attrelid = a.adrelid and att.attnum = a.adnum
	join pg_class cl on cl.oid = a.adrelid
	join pg_namespace n on n.oid = cl.relnamespace
	where n.nspname = any(domain_schemas) and pg_get_expr(a.adbin, a.adrelid) ~ old_values;
	if offenders is not null then
		raise exception 'defaults de coluna citam valor antigo do lote 5: %', offenders;
	end if;

	select string_agg(t.tgrelid::regclass::text || '.' || t.tgname, ', ') into offenders
	from pg_trigger t
	where not t.tgisinternal and pg_get_triggerdef(t.oid) ~ old_values;
	if offenders is not null then
		raise exception 'triggers citam valor antigo do lote 5: %', offenders;
	end if;

	if to_regclass('cron.job') is not null then
		execute 'select string_agg(jobname, '', '') from cron.job where command ~ $1' into offenders using old_values;
		if offenders is not null then
			raise exception 'jobs do pg_cron citam valor antigo do lote 5: %', offenders;
		end if;
	end if;
end;
$$;

-- ─── 1. Trava: nenhuma gravação entre a conversão e o CHECK apertado ────────────
--
-- Sem a trava, uma linha com valor antigo gravada pela `main` entre o `update` e o `add constraint`
-- faria o contract falhar na validação do CHECK. `share row exclusive` deixa ler e segura a escrita
-- só pelo tempo da migration (tabelas pequenas).

lock table
	procurement.contract_designation,
	inventory.inventory_count,
	procurement.policy_rule,
	kitchen.menu_template,
	kitchen.menu_items,
	procurement.quantity_estimate_snapshot_selection
in share row exclusive mode;

-- ─── 2. Tradução do valor antigo na gravação (sai na tarefa 5.5) ────────────────
--
-- Genérica: `tg_argv[0]` é a coluna, e os pares seguintes são antigo → novo. O `when` de cada
-- trigger já filtra o valor antigo, então no caminho comum a função nem é chamada.

create function core.translate_legacy_domain_value()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
	current_value text := to_jsonb(new) ->> tg_argv[0];
	i integer := 1;
begin
	while i < tg_nargs loop
		if current_value = tg_argv[i] then
			return jsonb_populate_record(new, jsonb_build_object(tg_argv[0], tg_argv[i + 1]));
		end if;
		i := i + 2;
	end loop;
	return new;
end;
$$;

comment on function core.translate_legacy_domain_value() is
	'Lote 5 da linguagem ubíqua (20260927110000): traduz na gravação o valor de domínio antigo que ainda chegar do código anterior ao deploy. Temporária: sai um ciclo depois do deploy do contract (tarefa 5.5).';

create trigger contract_designation_translate_legacy_role
	before insert or update of role on procurement.contract_designation
	for each row
	when (new.role in ('manager', 'technical_inspector', 'administrative_inspector', 'sectoral_inspector', 'committee_member'))
	execute function core.translate_legacy_domain_value(
		'role',
		'manager', 'gestor',
		'technical_inspector', 'fiscal_tecnico',
		'administrative_inspector', 'fiscal_administrativo',
		'sectoral_inspector', 'fiscal_setorial',
		'committee_member', 'membro_comissao'
	);

create trigger inventory_count_translate_legacy_type
	before insert or update of type on inventory.inventory_count
	for each row
	when (new.type in ('annual', 'responsibility_transfer', 'rotating'))
	execute function core.translate_legacy_domain_value(
		'type',
		'annual', 'anual',
		'responsibility_transfer', 'transferencia_responsabilidade',
		'rotating', 'rotativo'
	);

create trigger policy_rule_translate_legacy_target
	before insert or update of target on procurement.policy_rule
	for each row
	when (new.target = 'product')
	execute function core.translate_legacy_domain_value('target', 'product', 'ingredient');

create trigger menu_template_translate_legacy_type
	before insert or update of template_type on kitchen.menu_template
	for each row
	when (new.template_type = 'exception')
	execute function core.translate_legacy_domain_value('template_type', 'exception', 'apoio');

create trigger menu_items_translate_legacy_origin_type
	before insert or update of origin_template_type on kitchen.menu_items
	for each row
	when (new.origin_template_type = 'exception')
	execute function core.translate_legacy_domain_value('origin_template_type', 'exception', 'apoio');

-- ─── 3. Conversão das linhas ─────────────────────────────────────────────────────
--
-- `update … set col = col` com o valor antigo dispara o trigger acima, que converte: a mesma regra
-- da gravação, num lugar só. O retrato do anexo não tem CHECK nem trigger e vai por `case`.

update procurement.contract_designation set role = role
where role in ('manager', 'technical_inspector', 'administrative_inspector', 'sectoral_inspector', 'committee_member');

update inventory.inventory_count set type = type where type in ('annual', 'responsibility_transfer', 'rotating');

update procurement.policy_rule set target = target where target = 'product';

update kitchen.menu_template set template_type = template_type where template_type = 'exception';

update kitchen.menu_items set origin_template_type = origin_template_type where origin_template_type = 'exception';

update procurement.quantity_estimate_snapshot_selection set template_type = 'apoio' where template_type = 'exception';

-- Conferência: não sobrou valor antigo (o CHECK abaixo também recusaria, mas sem dizer onde).
do $$
declare
	leftovers text;
begin
	select string_agg(format('%s = %s (%s)', col, value, n), ', ') into leftovers
	from (
		select 'contract_designation.role' as col, role as value, count(*) as n from procurement.contract_designation
		where role not in ('gestor', 'fiscal_tecnico', 'fiscal_administrativo', 'fiscal_setorial', 'membro_comissao') group by role
		union all
		select 'inventory_count.type', type, count(*) from inventory.inventory_count
		where type not in ('anual', 'transferencia_responsabilidade', 'eventual', 'rotativo') group by type
		union all
		select 'policy_rule.target', target, count(*) from procurement.policy_rule
		where target not in ('ingredient', 'recipe') group by target
		union all
		select 'menu_template.template_type', template_type, count(*) from kitchen.menu_template
		where template_type not in ('weekly', 'event', 'apoio') group by template_type
		union all
		select 'menu_items.origin_template_type', origin_template_type, count(*) from kitchen.menu_items
		where origin_template_type not in ('weekly', 'event', 'apoio') group by origin_template_type
		union all
		select 'quantity_estimate_snapshot_selection.template_type', template_type, count(*) from procurement.quantity_estimate_snapshot_selection
		where template_type = 'exception' group by template_type
	) s;
	if leftovers is not null then
		raise exception 'valor fora do vocabulário do glossário depois da conversão: %', leftovers;
	end if;
end;
$$;

-- ─── 4. CHECKs só com o vocabulário do glossário ─────────────────────────────────

alter table procurement.contract_designation drop constraint contract_designation_role_check;
alter table procurement.contract_designation
	add constraint contract_designation_role_check check (role in (
		'gestor', 'fiscal_tecnico', 'fiscal_administrativo', 'fiscal_setorial', 'membro_comissao'
	));

alter table inventory.inventory_count drop constraint inventory_count_type_check;
alter table inventory.inventory_count
	add constraint inventory_count_type_check check (type in ('anual', 'transferencia_responsabilidade', 'eventual', 'rotativo'));

alter table procurement.policy_rule drop constraint policy_rule_target_check;
alter table procurement.policy_rule
	add constraint policy_rule_target_check check (target in ('ingredient', 'recipe'));

alter table kitchen.menu_template drop constraint menu_template_template_type_check;
alter table kitchen.menu_template
	add constraint menu_template_template_type_check check (template_type in ('weekly', 'event', 'apoio'));

alter table kitchen.menu_items drop constraint menu_items_origin_template_type_check;
alter table kitchen.menu_items
	add constraint menu_items_origin_template_type_check check (origin_template_type in ('weekly', 'event', 'apoio'));

-- Classificação de padrão de lanche é tudo ou nada, e só em cardápio de apoio.
alter table kitchen.menu_template drop constraint menu_template_snack_complete_check;
alter table kitchen.menu_template
	add constraint menu_template_snack_complete_check check (
		(snack_family is null and snack_class is null and snack_variant is null and orderable = false)
		or (snack_family is not null and snack_class is not null and snack_variant is not null and template_type in ('apoio'))
	);

comment on column procurement.contract_designation.role is
	'Papel na designação (Lei 14.133/2021, arts. 7º, 117 e 140, II, b): gestor | fiscal_tecnico | fiscal_administrativo | fiscal_setorial | membro_comissao.';
comment on column inventory.inventory_count.type is
	'Tipo de inventário físico: anual | transferencia_responsabilidade | eventual | rotativo.';
comment on column procurement.policy_rule.target is
	'Catálogo que a regra de revisão cobre: ingredient (insumo) | recipe (preparação).';
comment on column kitchen.menu_template.template_type is
	'Regime do cardápio: weekly (semanal) | event (evento) | apoio (cardápio de apoio: refeições previsíveis fora da rotina semanal). Não confundir com snack_family = apoio (lanche de apoio).';
comment on column kitchen.menu_items.origin_template_type is
	'Regime do cardápio que pôs o item no dia: weekly | event | apoio. Nulo = item manual.';
