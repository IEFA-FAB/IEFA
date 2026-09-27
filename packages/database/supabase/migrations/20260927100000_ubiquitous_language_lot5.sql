-- Valores de domínio na língua da norma — fase EXPAND.
--
-- Lote 5 da linguagem ubíqua do sisub (`openspec/changes/sisub-ubiquitous-language`, D1 critério 5,
-- D2, D4 e D9). Valor que é categoria da norma ou do ofício fica na língua da norma; estado de
-- fluxo do sistema fica em inglês.
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
--                                            (eventual fica)
--   procurement.policy_rule.target           product                   → ingredient  (recipe fica)
--   kitchen.menu_template.template_type      exception                 → apoio       (weekly, event ficam)
--   kitchen.menu_items.origin_template_type  exception                 → apoio
--
-- Papéis: Lei 14.133/2021, arts. 7º, 117 e 140, II, b, e Decreto 11.246/2022 (dispositivos a
-- confirmar). Tipos de inventário: IN SEDAP 205/1988 (item e lista a confirmar). `product` era o
-- nome antigo do insumo. "Exceção" nunca foi o conceito: o cardápio de apoio são refeições
-- previsíveis fora da rotina semanal (lanches de bordo e de apoio, coffee breaks). Homônimo
-- registrado: `menu_template.snack_family = 'apoio'` é o LANCHE de apoio e não muda.
--
-- ## Por que expand/contract
--
-- O banco é compartilhado, e a `main` lê de volta o que grava (`role === "manager"`,
-- `template_type === "exception"`). Um valor novo gravado por baixo dela sumiria da tela até o
-- deploy. Por isso esta migration só ALARGA os CHECKs: cada um aceita os dois vocabulários. Nenhuma
-- linha muda, e nenhum trigger normaliza.
--
--   * O código do PR deste expand lê os dois (normaliza na leitura), filtra pelos dois e ainda grava
--     o valor ANTIGO (`renamedVocabulary` em `@iefa/sisub-domain`).
--   * O CONTRACT (20260927110000) converte as linhas, aperta os CHECKs só no vocabulário novo, e o
--     código dele passa a gravar o valor novo.
--
-- ## O que cita os valores no banco vivo (conferido em 2026-09-27, só SELECT)
--
-- `pg_proc.prosrc`/`prosqlbody`, `pg_views`, `pg_matviews`, `pg_policies`, `pg_indexes` (predicado),
-- `pg_constraint`, `pg_attrdef` (defaults), `pg_trigger` (WHEN) e `cron.job`: nenhum objeto cita os
-- valores antigos como literal, fora os CHECKs alargados abaixo. Quem toca as colunas sem citar
-- valor, e por isso não muda:
--
--   * `inventory.open_inventory_count(p_type text, …)` grava `p_type` como veio: o CHECK decide.
--   * `inventory.designations_covering(…, p_roles text[])` e `find_designation` filtram por
--     `role = any(p_roles)`: o código passa os dois vocabulários (`designationRoleStoredValues`).
--
-- O único outro objeto é o CHECK `menu_template_snack_complete_check` (20260922140000): padrão de
-- lanche só em cardápio de apoio (`template_type = 'exception'`), alargado aqui para os dois.
--
-- `procurement.quantity_estimate_snapshot_selection.template_type` é o retrato congelado do tipo,
-- sem CHECK: não muda aqui; o leitor normaliza e o contract converte.
--
-- O bloco 0 refaz a conferência na hora de aplicar.

-- ─── 0. Conferência: nenhum objeto compara com o valor antigo ────────────────────
--
-- plpgsql, view e job do pg_cron não criam dependência de valor: uma comparação esquecida com
-- 'manager' deixaria de casar depois do contract, calada, em produção.

do $$
declare
	old_values constant text := '''(manager|technical_inspector|administrative_inspector|sectoral_inspector|committee_member|annual|responsibility_transfer|rotating|product|exception)''';
	offenders text;
begin
	select string_agg(p.oid::regprocedure::text, ', ') into offenders
	from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname not in ('pg_catalog', 'information_schema')
		-- Função de extensão (graphql, storage, auth...) não é do sisub: um `'product'` dela seria
		-- falso positivo.
		and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
		and (
			coalesce(p.prosrc, '') ~ old_values
			or coalesce(pg_get_function_sqlbody(p.oid), '') ~ old_values
		);
	if offenders is not null then
		raise exception 'funções citam valor antigo do lote 5 e precisam aceitar os dois vocabulários neste expand: %', offenders;
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
	where schemaname in ('procurement', 'inventory', 'kitchen') and indexdef ~ old_values;
	if offenders is not null then
		raise exception 'índices parciais citam valor antigo do lote 5: %', offenders;
	end if;

	-- CHECK de outra tabela, default de coluna e cláusula WHEN de trigger também comparam valor. Os
	-- seis CHECKs redefinidos abaixo ficam de fora: são eles que este expand alarga.
	select string_agg(c.conrelid::regclass::text || '.' || c.conname, ', ') into offenders
	from pg_constraint c
	join pg_namespace n on n.oid = c.connamespace
	where n.nspname in ('core', 'kitchen', 'procurement', 'finance', 'inventory', 'access_control', 'siafi_integration', 'sisub', 'analytics')
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
	where n.nspname in ('core', 'kitchen', 'procurement', 'finance', 'inventory', 'access_control', 'siafi_integration', 'sisub', 'analytics')
		and pg_get_expr(a.adbin, a.adrelid) ~ old_values;
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

-- ─── 1. Papel na designação ──────────────────────────────────────────────────────

alter table procurement.contract_designation drop constraint contract_designation_role_check;
alter table procurement.contract_designation
	add constraint contract_designation_role_check check (role in (
		'manager', 'technical_inspector', 'administrative_inspector', 'sectoral_inspector', 'committee_member',
		'gestor', 'fiscal_tecnico', 'fiscal_administrativo', 'fiscal_setorial', 'membro_comissao'
	));

-- ─── 2. Tipo de inventário físico ────────────────────────────────────────────────

alter table inventory.inventory_count drop constraint inventory_count_type_check;
alter table inventory.inventory_count
	add constraint inventory_count_type_check check (type in (
		'annual', 'responsibility_transfer', 'eventual', 'rotating',
		'anual', 'transferencia_responsabilidade', 'rotativo'
	));

-- ─── 3. Alvo da regra de política de revisão ─────────────────────────────────────

alter table procurement.policy_rule drop constraint policy_rule_target_check;
alter table procurement.policy_rule
	add constraint policy_rule_target_check check (target in ('product', 'recipe', 'ingredient'));

-- ─── 4. Cardápio de apoio ────────────────────────────────────────────────────────

alter table kitchen.menu_template drop constraint menu_template_template_type_check;
alter table kitchen.menu_template
	add constraint menu_template_template_type_check check (template_type in ('weekly', 'event', 'exception', 'apoio'));

alter table kitchen.menu_items drop constraint menu_items_origin_template_type_check;
alter table kitchen.menu_items
	add constraint menu_items_origin_template_type_check check (origin_template_type in ('weekly', 'event', 'exception', 'apoio'));

-- Classificação de padrão de lanche é tudo ou nada, e só em cardápio de apoio (nos dois nomes).
alter table kitchen.menu_template drop constraint menu_template_snack_complete_check;
alter table kitchen.menu_template
	add constraint menu_template_snack_complete_check check (
		(snack_family is null and snack_class is null and snack_variant is null and orderable = false)
		or (snack_family is not null and snack_class is not null and snack_variant is not null and template_type in ('exception', 'apoio'))
	);
