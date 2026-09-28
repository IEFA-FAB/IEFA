-- Papel `gestor_setorial` na designação de contrato.
--
-- O Decreto 13.031/2026 (art. 15) alterou o Decreto 11.246/2022 e criou a gestão setorial:
--
--   art. 19, V   gestão setorial: "a coordenação das atividades de gestão de contrato, quando a
--                prestação do objeto ocorrer concomitantemente em setores distintos, em unidades
--                desconcentradas ou em diferentes órgãos e entidades";
--   art. 21-A    aos gestores setoriais e, nos afastamentos e impedimentos, aos substitutos cabem
--                as atribuições do gestor (art. 21), "no âmbito dos respectivos órgãos ou entidades";
--   art. 25      "o recebimento definitivo ficará a cargo do gestor do contrato, do gestor setorial
--                ou da comissão designada pela autoridade competente".
--
-- O próprio Decreto 13.031/2026, art. 10, repete: o termo de recebimento definitivo é registrado
-- "pelo gestor do contrato, pelos gestores setoriais ou por comissão designada".
--
-- Compatibilidade com o Contratos.gov.br: o sistema federal já tem a função "Gestor Setorial" nos
-- responsáveis do contrato (`GET /api/contrato/{id}/responsaveis`, campo `funcao_id`, que devolve
-- o rótulo). Lá o substituto é outra função ("Gestor Substituto", "Fiscal Técnico Substituto"...);
-- aqui ele segue como `is_substitute`, que já existe (20260917200000). O mapa sisub ↔
-- Contratos.gov.br mora em `@iefa/sisub-domain` (`designation-contratos-gov-br.ts`), não no banco.
--
-- Só o CHECK muda. Nenhuma linha é convertida; nenhuma função nova. `inventory.find_designation` e
-- `inventory.designations_covering` filtram pelo array de papéis que o código passa
-- (`PROVISIONAL_RECEIPT_ROLES`, `DEFINITIVE_RECEIPT_ROLES`); a conferência abaixo recusa a
-- migration se algum outro objeto do banco citar a lista de papéis.

-- ─── 1. Conferência: só o CHECK cita os papéis ───────────────────────────────────

do $$
declare
	role_literal constant text := '''(gestor|gestor_setorial|fiscal_tecnico|fiscal_administrativo|fiscal_setorial|membro_comissao)''';
	app_schemas constant text[] := array[
		'sisub', 'core', 'kitchen', 'inventory', 'procurement', 'finance', 'access_control',
		'nutrition_reference', 'siafi_integration', 'compras_gov_integration'
	];
	offenders text;
begin
	select string_agg(n.nspname || '.' || p.proname, ', ') into offenders
	from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = any(app_schemas)
		and p.prokind in ('f', 'p')
		and pg_get_functiondef(p.oid) ~ role_literal;
	if offenders is not null then
		raise exception 'funções citam papel da designação (a lista vem do código): %', offenders;
	end if;

	select string_agg(schemaname || '.' || viewname, ', ') into offenders
	from pg_views
	where schemaname = any(app_schemas) and definition ~ role_literal;
	if offenders is not null then
		raise exception 'views citam papel da designação: %', offenders;
	end if;

	select string_agg(schemaname || '.' || matviewname, ', ') into offenders
	from pg_matviews
	where schemaname = any(app_schemas) and definition ~ role_literal;
	if offenders is not null then
		raise exception 'views materializadas citam papel da designação: %', offenders;
	end if;

	select string_agg(schemaname || '.' || tablename || '.' || policyname, ', ') into offenders
	from pg_policies
	where schemaname = any(app_schemas) and coalesce(qual, '') || ' ' || coalesce(with_check, '') ~ role_literal;
	if offenders is not null then
		raise exception 'policies citam papel da designação: %', offenders;
	end if;

	select string_agg(c.conrelid::regclass::text || '.' || c.conname, ', ') into offenders
	from pg_constraint c
	join pg_namespace n on n.oid = c.connamespace
	where n.nspname = any(app_schemas)
		and c.contype = 'c'
		and c.conname <> 'contract_designation_role_check'
		and pg_get_constraintdef(c.oid) ~ role_literal;
	if offenders is not null then
		raise exception 'outros CHECKs citam papel da designação: %', offenders;
	end if;

	select string_agg(t.tgrelid::regclass::text || '.' || t.tgname, ', ') into offenders
	from pg_trigger t
	join pg_class cl on cl.oid = t.tgrelid
	join pg_namespace n on n.oid = cl.relnamespace
	where n.nspname = any(app_schemas) and not t.tgisinternal and pg_get_triggerdef(t.oid) ~ role_literal;
	if offenders is not null then
		raise exception 'triggers citam papel da designação: %', offenders;
	end if;

	select string_agg(a.adrelid::regclass::text || '.' || att.attname, ', ') into offenders
	from pg_attrdef a
	join pg_attribute att on att.attrelid = a.adrelid and att.attnum = a.adnum
	join pg_class cl on cl.oid = a.adrelid
	join pg_namespace n on n.oid = cl.relnamespace
	where n.nspname = any(app_schemas) and pg_get_expr(a.adbin, a.adrelid) ~ role_literal;
	if offenders is not null then
		raise exception 'defaults de coluna citam papel da designação: %', offenders;
	end if;

	if to_regclass('cron.job') is not null then
		execute 'select string_agg(jobname, '', '') from cron.job where command ~ $1' into offenders using role_literal;
		if offenders is not null then
			raise exception 'jobs do pg_cron citam papel da designação: %', offenders;
		end if;
	end if;
end;
$$;

-- ─── 2. CHECK com o gestor setorial ──────────────────────────────────────────────

alter table procurement.contract_designation drop constraint contract_designation_role_check;
alter table procurement.contract_designation
	add constraint contract_designation_role_check check (role in (
		'gestor', 'gestor_setorial', 'fiscal_tecnico', 'fiscal_administrativo', 'fiscal_setorial', 'membro_comissao'
	));

comment on column procurement.contract_designation.role is
	'Papel na designação (Lei 14.133/2021, arts. 7º, 117 e 140, II; Decreto 11.246/2022, arts. 19, 21 a 25, com a redação do Decreto 13.031/2026): gestor | gestor_setorial | fiscal_tecnico | fiscal_administrativo | fiscal_setorial | membro_comissao. O definitivo é de gestor, gestor_setorial ou membro_comissao (Decreto 11.246/2022, art. 25). Rótulo no Contratos.gov.br: CONTRATOS_GOV_BR_FUNCTIONS em @iefa/sisub-domain.';
comment on column procurement.contract_designation.is_substitute is
	'Substituto do titular no mesmo papel (Decreto 11.246/2022, arts. 8º e 21 a 24). No Contratos.gov.br o substituto é função própria ("Gestor Substituto", "Fiscal Técnico Substituto"...); o mapa está em @iefa/sisub-domain.';
