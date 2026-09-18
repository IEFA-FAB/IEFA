-- Projeto α: um módulo PBAC por PAPEL, cada grant escopado por OM, e a hierarquia de APOIO
-- entre OMs que decide o alcance desse escopo.
--
-- NÃO APLICADA. Ordem de deploy: esta migration → α (apps/alpha) → contrate. O α novo lê os
-- módulos `alpha-*` e `submission.unit_id`; subir antes da migration derrubaria a fila (a
-- RPC nova não existe) e deixaria todo ACI sem papel.
--
-- ## Antes
--
-- Um módulo `alpha` com nível aninhado (1 requisitante, 2 licitações, 3 ACI), sem escopo:
-- licitações e ACI enxergavam o fluxo da FAB inteira, e o ACI triava e emitia parecer sobre
-- processo de qualquer OM. Duas rotas nem conferiam de quem era o processo
-- (`PATCH /compliance/findings/:id`, `POST /compliance/runs/:id/reviews`).
--
-- ## Depois
--
--   alpha-requester    level 1 — vê todas as submissões das OMs que cobre
--   alpha-procurement  level 1 — fila e processos das OMs que cobre
--   alpha-aci          level 1 — triagem e parecer só nos processos das OMs que cobre
--   alpha-admin        level 3 — (já existia) agora escopável: o de OM X concede só em X e
--                                 nas OMs que X apoia
--
-- `unit_id` nulo = global. `module` é `text` sem CHECK em `user_permissions` e em
-- `policy_statement`: os nomes novos não pedem DDL. Unicidade: `user_permissions_allow_uniq`
-- e `_deny_uniq` (20260917185655) já incluem `unit_id` com `nulls not distinct` — um grant
-- por (usuário, módulo, OM) em cada sinal, sem índice novo.
--
-- Idempotente de ponta a ponta: reaplicar não duplica unidade, grant nem statement.

begin;

-- ─── 1. Hierarquia de APOIO em core.units ────────────────────────────────────
-- `parent_unit_id` (20260827163000) é a cadeia de COMANDO — ELO → COMAR → FAB — e alimenta o
-- rollup regional do sisub. Apoio é outra relação: o GAP-SJ conduz as licitações do IAE, do
-- DCTA e do escritório do IEFA em SJ, que não são subordinados dele. Sobrecarregar `parent_unit_id` misturaria as
-- duas e quebraria o rollup; daí a coluna própria.
--
-- Coluna, e não tabela de junção: uma OM tem UMA apoiadora (o GAP da guarnição, que é a UASG
-- que licita por ela). Não há hoje caso de OM apoiada por duas — nem no cadastro do sucont
-- (UG × órgão superior), nem na matriz de ranchos, onde cada apoiada aparece sob um único
-- GAP. Se aparecer, a coluna vira tabela sem mudar a regra de cobertura.
--
-- A cobertura é TRANSITIVA (A apoia B, B apoia C → grant em A cobre C) e é calculada no
-- `@iefa/pbac` (`expandSupportCoverage`), em memória sobre o grafo inteiro (~35 linhas) —
-- mais barato que uma CTE recursiva por request e testável sem banco. O inverso não vale:
-- a apoiada não enxerga a apoiadora.
alter table core.units
	add column if not exists supporting_unit_id bigint references core.units (id) on delete restrict;

do $$
begin
	if not exists (select 1 from pg_constraint where conname = 'units_supporting_not_self' and conrelid = 'core.units'::regclass) then
		alter table core.units add constraint units_supporting_not_self check (supporting_unit_id is null or supporting_unit_id <> id);
	end if;
end
$$;

create index if not exists units_supporting_unit_idx
	on core.units (supporting_unit_id) where supporting_unit_id is not null;

comment on column core.units.supporting_unit_id is
	'Unidade APOIADORA (o GAP que conduz as contratações desta OM). NÃO é comando — isso é parent_unit_id. Decide o alcance de grant escopado por OM: grant na apoiadora cobre as apoiadas, transitivamente; o inverso não. Null = sem apoiadora.';

-- ─── 2. As OMs apoiadas pelo GAP-SJ ──────────────────────────────────────────
-- `core.units` tinha só as compradoras (29 `purchase`) e a sentinela de treino. As apoiadas
-- entram como `consumption`: não licitam, não têm UASG, cozinha nem refeitório. Código e
-- nome seguem a convenção das linhas existentes (sigla nos dois).
--
-- O sisub lista unidades para seleção por `listUnits` (@iefa/sisub-domain), que passa a
-- filtrar `type = 'purchase'` — sem isso as apoiadas apareceriam nos seletores do módulo
-- Unidade, de Análises da Unidade e de escopo de permissão como unidades vazias.
--
-- Pela apoiadora com `code = 'GAP-SJ'`, e não pelo id 26: em banco local/staging o id pode
-- ser outro. Sem GAP-SJ, nada entra (o join é vazio) em vez de entrar sem apoiadora.
insert into core.units (code, display_name, type, is_training, supporting_unit_id)
select v.code, v.display_name, 'consumption'::sisub.unit_type, false, gap.id
from (values
	('IAE',  'IAE'),   -- Instituto de Aeronáutica e Espaço
	('DCTA', 'DCTA'),  -- Departamento de Ciência e Tecnologia Aeroespacial
	('IEFA-SJ', 'IEFA-SJ')  -- Escritório do IEFA em São José dos Campos (a sede não é apoiada pelo GAP-SJ)
) as v (code, display_name)
join core.units gap on gap.code = 'GAP-SJ'
on conflict (code) do nothing;

-- ─── 3. A OM da submissão ────────────────────────────────────────────────────
-- Toda submissão passa a ser atribuída a uma OM, escolhida por quem envia. Qualquer
-- autenticado segue enviando; é a OM que decide quem mais a enxerga.
--
-- NULLABLE de propósito, e só por agora. Hoje há ZERO submissões, mas α e contrate têm deploy
-- independente: com NOT NULL, o α antigo ainda no ar (ou um rollback dele) falharia todo envio
-- entre a migration e o deploy. O α novo EXIGE a OM no envio; o NOT NULL entra no PR de
-- limpeza, junto com a remoção do módulo `alpha`.
--
-- `on delete restrict`: apagar a OM não pode apagar nem órfã processo de contratação.
alter table alpha.submission
	add column if not exists unit_id bigint references core.units (id) on delete restrict;

create index if not exists submission_unit_ix on alpha.submission (unit_id, created_at desc);

comment on column alpha.submission.unit_id is
	'OM a que a submissão é atribuída (escolhida por quem envia). Decide quem a enxerga além do autor: requisitante, licitações e ACI das OMs que a cobrem pela hierarquia de apoio. Nullable só até o PR de limpeza — o α exige no envio.';

-- ─── 4. Backfill dos grants ──────────────────────────────────────────────────
-- Ninguém perde acesso no deploy. O nível do `alpha` vira os papéis que ele alcançava:
--   alpha 1 → alpha-requester
--   alpha 2 → alpha-requester + alpha-procurement
--   alpha 3 → alpha-requester + alpha-procurement + alpha-aci + alpha-admin 3
-- Hoje só existe o terceiro caso (2 usuários, nível 3, global), que recebe os QUATRO. Os três
-- `alpha-admin` 3 globais que já existem ficam como estão.
--
-- Mesmo escopo e mesmo `expires_at` da linha de origem: copiar sem o prazo transformaria um
-- acesso temporário em quatro permanentes. Deny (`level <= 0`) no `alpha` vira deny nos
-- quatro papéis — no α antigo ele fechava a API inteira; hoje não há nenhum.
--
-- As linhas `module = 'alpha'` NÃO são apagadas: nada as lê depois do deploy, e mantê-las é o
-- que faz um rollback do α devolver o acesso. Saem num PR de limpeza, como o `sucont`
-- (20260910191735).
--
-- O `not exists` separa allow de deny — é a mesma partição dos dois índices únicos: um allow
-- novo não pode ser barrado por um deny existente na chave, nem o contrário.

with role_map (min_level, module, target_level) as (
	values
		(1, 'alpha-requester', 1),
		(2, 'alpha-procurement', 1),
		(3, 'alpha-aci', 1),
		(3, 'alpha-admin', 3)
)
insert into access_control.user_permissions (user_id, module, level, mess_hall_id, kitchen_id, unit_id, expires_at)
select s.user_id, m.module, case when s.level > 0 then m.target_level else s.level end, s.mess_hall_id, s.kitchen_id, s.unit_id, s.expires_at
from access_control.user_permissions s
join role_map m on (s.level <= 0 or s.level >= m.min_level)
where s.module = 'alpha'
	and not exists (
		select 1
		from access_control.user_permissions t
		where t.user_id = s.user_id
			and t.module = m.module
			and (t.level > 0) = (s.level > 0)
			and t.mess_hall_id is not distinct from s.mess_hall_id
			and t.kitchen_id   is not distinct from s.kitchen_id
			and t.unit_id      is not distinct from s.unit_id
	);

-- Espelho em `policy_statement`: nenhuma política empresta `alpha` hoje, mas uma criada entre
-- o merge e o deploy não pode virar acesso que some. Sem UNIQUE aqui (várias linhas por
-- política), o dedup inclui o nível.
with role_map (min_level, module, target_level) as (
	values
		(1, 'alpha-requester', 1),
		(2, 'alpha-procurement', 1),
		(3, 'alpha-aci', 1),
		(3, 'alpha-admin', 3)
)
insert into access_control.policy_statement (policy_id, module, level, unit_id, kitchen_id, mess_hall_id)
select s.policy_id, m.module, case when s.level > 0 then m.target_level else s.level end, s.unit_id, s.kitchen_id, s.mess_hall_id
from access_control.policy_statement s
join role_map m on (s.level <= 0 or s.level >= m.min_level)
where s.module = 'alpha'
	and not exists (
		select 1
		from access_control.policy_statement t
		where t.policy_id = s.policy_id
			and t.module = m.module
			and t.level = case when s.level > 0 then m.target_level else s.level end
			and t.unit_id      is not distinct from s.unit_id
			and t.kitchen_id   is not distinct from s.kitchen_id
			and t.mess_hall_id is not distinct from s.mess_hall_id
	);

-- ─── 5. A fila do analista, recortada por OM ─────────────────────────────────
-- `p_unit_ids` é a cobertura JÁ EXPANDIDA pela hierarquia de apoio (o α a calcula uma vez por
-- request). Nulo = sem recorte, e só o α com papel GLOBAL o manda — a regra opengrep
-- `alpha-aci-queue-without-units` barra a chamada que esquece o argumento.
--
-- A assinatura antiga SAI antes: `create or replace` com um parâmetro a mais criaria uma
-- SOBRECARGA, e o PostgREST, diante de `aci_queue(p_limit)` e `aci_queue(p_limit, p_unit_ids)`,
-- resolveria a chamada de um α antigo para a versão sem recorte — ou recusaria as duas por
-- ambiguidade (PGRST203).
--
-- Registro sem OM (`unit_id` nulo, anterior a esta migration) só aparece sem recorte: um
-- papel escopado não alcança o que não é de OM nenhuma.
drop function if exists alpha.aci_queue(int);

create or replace function alpha.aci_queue(p_limit int default 200, p_unit_ids bigint[] default null)
returns table (
	submission_id        uuid,
	user_id              uuid,
	unit_id              bigint,
	filename             text,
	doc_kind             text,
	modalidade           text,
	objeto               text,
	submitted_at         timestamptz,
	extraction_id        uuid,
	extraction_created_at timestamptz,
	run_id               uuid,
	run_status           text,
	run_started_at       timestamptz,
	run_finished_at      timestamptz,
	rules_applied        int,
	rules_not_assessed   int,
	discarded_findings   int,
	review_decision      text,
	review_created_at    timestamptz,
	finding_counts       jsonb
)
language sql
stable
set search_path = alpha, pg_temp
as $$
	with s as (
		select sub.id, sub.user_id, sub.unit_id, sub.filename, sub.doc_kind, sub.modalidade, sub.objeto, sub.created_at
		from alpha.submission sub
		where p_unit_ids is null or sub.unit_id = any (p_unit_ids)
		order by sub.created_at desc
		limit p_limit
	),
	e as (
		select distinct on (ext.submission_id) ext.submission_id, ext.id, ext.created_at
		from alpha.extraction ext
		where ext.submission_id in (select s.id from s)
		order by ext.submission_id, ext.created_at desc
	),
	r as (
		select distinct on (run.submission_id)
			run.submission_id, run.id, run.status, run.started_at, run.finished_at,
			run.rules_applied, run.rules_not_assessed, run.discarded_findings
		from alpha.compliance_run run
		where run.submission_id in (select s.id from s)
		order by run.submission_id, run.started_at desc
	),
	rv as (
		select distinct on (rev.run_id) rev.run_id, rev.decision, rev.created_at
		from alpha.compliance_review rev
		where rev.run_id in (select r.id from r)
		order by rev.run_id, rev.created_at desc
	),
	fc as (
		select g.run_id, jsonb_agg(jsonb_build_object('severity', g.severity, 'triage', g.triage, 'count', g.n)) as counts
		from (
			select f.run_id, f.severity, f.triage, count(*) as n
			from alpha.compliance_finding f
			where f.run_id in (select r.id from r)
			group by f.run_id, f.severity, f.triage
		) g
		group by g.run_id
	)
	select
		s.id, s.user_id, s.unit_id, s.filename, s.doc_kind, s.modalidade, s.objeto, s.created_at,
		e.id, e.created_at,
		r.id, r.status, r.started_at, r.finished_at, r.rules_applied, r.rules_not_assessed, r.discarded_findings,
		rv.decision, rv.created_at,
		coalesce(fc.counts, '[]'::jsonb)
	from s
	left join e  on e.submission_id = s.id
	left join r  on r.submission_id = s.id
	left join rv on rv.run_id = r.id
	left join fc on fc.run_id = r.id
	order by s.created_at desc
$$;

-- O α é o único cliente (service_role). A função antiga herdava EXECUTE para PUBLIC do
-- default do Postgres — inócuo, porque anon/authenticated não têm USAGE no schema `alpha`,
-- mas a nova não repete o default.
revoke execute on function alpha.aci_queue(int, bigint[]) from public;
grant execute on function alpha.aci_queue(int, bigint[]) to service_role;

-- O PostgREST precisa ver a assinatura nova antes do primeiro request do α novo.
notify pgrst, 'reload schema';

commit;
