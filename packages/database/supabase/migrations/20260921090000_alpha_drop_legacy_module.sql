-- alpha_drop_legacy_module
-- Limpeza do Projeto α depois do escopo por OM (20260918123000): o módulo `alpha` de nível
-- único é CONVERTIDO nos papéis e some, e a OM da submissão passa a ser obrigatória no banco.
--
-- DECLARADA, NÃO APLICADA. Ordem: aplicar ANTES do merge do PR que tira `"alpha"` do
-- `AppModule` — o código novo trata `submission.unit_id` como sempre preenchido. O código
-- antigo segue funcionando depois dela: nada lê as linhas `alpha`, e o α já exige a OM no
-- envio desde o #383.
--
-- ## 1. As linhas `module = 'alpha'`: converter o que ficou para trás, depois apagar
--
-- O backfill de 20260918123000 (aplicado em 2026-09-18 12:30 UTC) espelhou cada linha
-- `alpha` nos papéis e deixou a original de pé para o rollback do α. Mas a tela antiga do
-- contrate continuou gravando `alpha` até o deploy do contrate novo — e uma linha gravada
-- DEPOIS do backfill nunca foi convertida. O α novo não lê `alpha`: quem a recebeu PERDEU,
-- em silêncio, o acesso que ela concedia (nível 3 era ACI).
--
-- A conversão aqui é deliberadamente ESTREITA:
--
--   - só linha criada DEPOIS do backfill (`created_at > 2026-09-18 12:30 UTC`). As anteriores
--     já foram convertidas; se o papel delas não existe mais, foi REVOGADO pela tela nova — e
--     reconvertê-la desfaria a revogação em silêncio (o log mostraria o revoke como última
--     palavra e a pessoa estaria de papel de volta);
--   - pela mesma razão, nada é convertido para um par (pessoa, papel) com revogação no
--     `sensitive_operation_log` posterior à linha;
--   - NUNCA gera `alpha-admin`. No modelo antigo, nível 3 era ACI; administrar acesso sempre
--     foi o módulo `alpha-admin`, à parte. Gerar admin aqui seria conceder por migration, sem
--     log, o poder de conceder.
--
--   alpha 1       → alpha-requester 1
--   alpha 2       → + alpha-procurement 1
--   alpha 3       → + alpha-aci 1
--   alpha <= 0    → bloqueio nos três papéis
--
-- Mesmo escopo e mesmo `expires_at` da linha de origem. O `not exists` separa allow de deny,
-- a mesma partição dos dois índices únicos parciais.
--
-- Depois, TODA linha `alpha` sai: nada a lê desde o #383, então apagá-la não tira acesso de
-- ninguém — o que ela significava já está (ou deliberadamente não está) nos papéis.
--
-- `policy_statement` com `alpha`: nenhuma em produção. Se aparecer, a migration PARA — um
-- statement de política é decisão de quem administra a política, não de migration.
--
-- Em produção (consulta de 2026-09-19): 3 linhas `alpha`, nível 3, globais. Duas de 2026-09-17
-- (já convertidas pelo backfill) e uma de 2026-09-18 13:34 UTC, gravada pela tela antiga
-- depois do backfill — convertida aqui em requisitante + licitações + ACI (o admin, a titular
-- já tinha por grant próprio).
--
-- ## 2. `alpha.submission.unit_id` NOT NULL
--
-- Nasceu nullable só para o α antigo não falhar envio entre a migration e o deploy
-- (20260918123000). O α exige a OM no envio desde o #383, e o único registro sem OM (o TR de
-- teste de 2026-08-11) foi apagado em 2026-09-18. Em produção: 4 submissões, 0 sem OM.
--
-- Se houver submissão sem OM, a migration PARA com a contagem — atribuir uma OM a processo
-- de contratação por palpite exporia o documento a quem não devia vê-lo.
--
-- Idempotente: reaplicar não encontra mais linha `alpha` (nada a converter nem a apagar), e
-- `set not null` sobre coluna já NOT NULL não faz nada.

begin;

-- ─── 1a. Statement de política com `alpha`: decisão manual ───────────────────
do $$
declare
	v_policy integer;
begin
	select count(*) into v_policy from access_control.policy_statement where module = 'alpha';
	if v_policy > 0 then
		raise exception 'access_control.policy_statement tem % statement(s) com o módulo legado alpha: converta-os pela tela de políticas antes de aplicar esta migration', v_policy
			using errcode = '55000';
	end if;
end
$$;

-- ─── 1b. Conversão estreita das linhas `alpha` gravadas depois do backfill ────
create temporary table alpha_legacy_converted (
	owner_id uuid,
	module text,
	level integer,
	unit_id bigint,
	kitchen_id bigint,
	mess_hall_id bigint
) on commit drop;

with role_map (min_level, module, target_level) as (
	values
		(1, 'alpha-requester', 1),
		(2, 'alpha-procurement', 1),
		(3, 'alpha-aci', 1)
),
inserted as (
	insert into access_control.user_permissions (user_id, module, level, mess_hall_id, kitchen_id, unit_id, expires_at)
	select s.user_id, m.module, case when s.level > 0 then m.target_level else s.level end, s.mess_hall_id, s.kitchen_id, s.unit_id, s.expires_at
	from access_control.user_permissions s
	join role_map m on (s.level <= 0 or s.level >= m.min_level)
	where s.module = 'alpha'
		-- Só o que o backfill de 20260918123000 não viu.
		and s.created_at > timestamptz '2026-09-18 12:30:00+00'
		and not exists (
			select 1
			from access_control.user_permissions t
			where t.user_id = s.user_id
				and t.module = m.module
				and (t.level > 0) = (s.level > 0)
				and t.mess_hall_id is not distinct from s.mess_hall_id
				and t.kitchen_id   is not distinct from s.kitchen_id
				and t.unit_id      is not distinct from s.unit_id
		)
		-- Revogação posterior à linha é a última palavra: não se desfaz por migration.
		and not exists (
			select 1
			from access_control.sensitive_operation_log l
			where l.operation like '%.permission.revoke'
				and l.created_at > s.created_at
				and l.target ->> 'target_user_id' = s.user_id::text
				and l.target ->> 'module' = m.module
		)
	returning user_id, module, level, unit_id, kitchen_id, mess_hall_id
)
insert into alpha_legacy_converted
select user_id, module, level, unit_id, kitchen_id, mess_hall_id from inserted;

-- ─── 1c. Toda linha `alpha` sai ──────────────────────────────────────────────
delete from access_control.user_permissions where module = 'alpha';

do $$
declare
	v_converted text;
begin
	select string_agg(format('%s → %s %s (%s)', c.owner_id, c.module, c.level,
			coalesce('OM ' || c.unit_id, 'cozinha ' || c.kitchen_id, 'refeitório ' || c.mess_hall_id, 'global')), '; ' order by c.owner_id, c.module)
		into v_converted
		from alpha_legacy_converted c;
	raise notice 'alpha: convertido nesta aplicação: %', coalesce(v_converted, 'nada');
end
$$;

-- ─── 2. A OM da submissão passa a ser obrigatória ────────────────────────────
do $$
declare
	v_missing integer;
begin
	select count(*) into v_missing from alpha.submission where unit_id is null;
	if v_missing > 0 then
		raise exception 'alpha.submission tem % registro(s) sem OM (unit_id nulo): atribua a OM de cada um (ou apague o registro de teste) antes de aplicar esta migration', v_missing
			using errcode = '23502';
	end if;
end
$$;

alter table alpha.submission alter column unit_id set not null;

comment on column alpha.submission.unit_id is
	'OM a que a submissão é atribuída (escolhida por quem envia). Decide quem a enxerga além do autor: requisitante, licitações e ACI das OMs que a cobrem pela hierarquia de apoio. NOT NULL desde 20260921090000.';

commit;
