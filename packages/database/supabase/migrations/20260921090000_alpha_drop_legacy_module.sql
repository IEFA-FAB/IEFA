-- alpha_drop_legacy_module
-- Limpeza do Projeto α depois do escopo por OM (20260918123000): some o módulo `alpha` de
-- nível único, e a OM da submissão passa a ser obrigatória no banco.
--
-- DECLARADA, NÃO APLICADA. Ordem: aplicar ANTES do merge do PR que tira `"alpha"` do
-- `AppModule` e os campos legados do `/me/access` — o código novo trata `submission.unit_id`
-- como sempre preenchido. O código antigo segue funcionando depois dela: nada lê as linhas
-- `alpha`, e o α já exige a OM no envio desde o #383.
--
-- ## 1. As linhas `module = 'alpha'`
--
-- O backfill de 20260918123000 espelhou cada linha `alpha` nos papéis que o nível dela
-- alcançava e deixou a original de pé para o rollback do α. O α novo está no ar e não lê
-- `alpha`; a linha virou ruído — um grant que a tela de acessos não mostra e ninguém revoga
-- pela interface, e que parece acesso concedido numa auditoria da tabela.
--
-- O DELETE é CONDICIONADO À COBERTURA, como o do `sucont` (20260910191735): só sai a linha
-- cujo titular tem TODOS os papéis que o nível dela alcançava, no mesmo escopo e no mesmo
-- lado (acesso ou bloqueio):
--
--   alpha 1       → alpha-requester
--   alpha 2       → alpha-requester + alpha-procurement
--   alpha 3       → alpha-requester + alpha-procurement + alpha-aci + alpha-admin 3
--   alpha <= 0    → bloqueio nos quatro
--
-- Um `delete ... where module = 'alpha'` cru apagaria o acesso de quem estivesse num banco
-- onde o backfill não rodou (restauração parcial, ambiente montado fora de ordem), sem
-- caminho de volta pela interface.
--
-- Em produção (consulta de 2026-09-19): 3 linhas `alpha`, todas nível 3 e globais. DUAS
-- estão cobertas (as dos administradores do backfill) e saem. A TERCEIRA fica: foi gravada
-- em 2026-09-18 13:34 UTC, DEPOIS do backfill (12:30), pela tela antiga — o titular tem só
-- `alpha-admin` 3, sem requisitante, licitações e ACI. Apagá-la não tira acesso nenhum (nada a
-- lê), mas conceder os três papéis que ela implicava seria decidir, por migration, que essa
-- pessoa é ACI global. Essa decisão é do mantenedor, pela tela de Acessos (auditada); depois
-- dela, reaplicar esta migration remove a linha. O aviso no fim lista o que ficou.
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
-- Idempotente: reaplicar não apaga mais do que a cobertura permite, e `set not null` sobre
-- coluna já NOT NULL não faz nada.

begin;

-- ─── 1. Linhas `alpha` cobertas pelos papéis ─────────────────────────────────
-- Sai a linha para a qual NÃO EXISTE papel exigido faltando. O lado entra na comparação
-- (`(t.level > 0) = (s.level > 0)`) pela mesma razão dos dois índices únicos parciais: um
-- acesso não cobre um bloqueio, nem o contrário. O `expires_at` não entra: nada lê a linha
-- `alpha`, e o prazo do papel é o que vale.
with role_map (min_level, module, target_level) as (
	values
		(1, 'alpha-requester', 1),
		(2, 'alpha-procurement', 1),
		(3, 'alpha-aci', 1),
		(3, 'alpha-admin', 3)
)
delete from access_control.user_permissions s
where s.module = 'alpha'
	and not exists (
		select 1
		from role_map m
		where (s.level <= 0 or s.level >= m.min_level)
			and not exists (
				select 1
				from access_control.user_permissions t
				where t.user_id = s.user_id
					and t.module = m.module
					and (t.level > 0) = (s.level > 0)
					and (s.level <= 0 or t.level >= m.target_level)
					and t.unit_id      is not distinct from s.unit_id
					and t.kitchen_id   is not distinct from s.kitchen_id
					and t.mess_hall_id is not distinct from s.mess_hall_id
			)
	);

-- Mesmo critério para os statements de política (nenhum existe em produção; um criado entre
-- o backfill e esta limpeza cairia aqui).
with role_map (min_level, module, target_level) as (
	values
		(1, 'alpha-requester', 1),
		(2, 'alpha-procurement', 1),
		(3, 'alpha-aci', 1),
		(3, 'alpha-admin', 3)
)
delete from access_control.policy_statement s
where s.module = 'alpha'
	and not exists (
		select 1
		from role_map m
		where (s.level <= 0 or s.level >= m.min_level)
			and not exists (
				select 1
				from access_control.policy_statement t
				where t.policy_id = s.policy_id
					and t.module = m.module
					and (t.level > 0) = (s.level > 0)
					and (s.level <= 0 or t.level >= m.target_level)
					and t.unit_id      is not distinct from s.unit_id
					and t.kitchen_id   is not distinct from s.kitchen_id
					and t.mess_hall_id is not distinct from s.mess_hall_id
			)
	);

-- O que ficou não é erro — é decisão pendente de gente. Aparece no output de quem aplica.
do $$
declare
	v_left_inline integer;
	v_left_policy integer;
begin
	select count(*) into v_left_inline from access_control.user_permissions where module = 'alpha';
	select count(*) into v_left_policy from access_control.policy_statement where module = 'alpha';
	if v_left_inline > 0 or v_left_policy > 0 then
		raise notice 'alpha: % linha(s) inline e % statement(s) de política sem cobertura pelos papéis ficaram — conceda os papéis pela tela de Acessos (ou decida removê-las) e reaplique esta migration', v_left_inline, v_left_policy;
	end if;
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
