-- alpha_drop_legacy_module
-- Limpeza do Projeto α depois do escopo por OM (20260918123000): o módulo `alpha` de nível
-- único é CONVERTIDO nos papéis e some, e a OM da submissão passa a ser obrigatória no banco.
--
-- DECLARADA, NÃO APLICADA. Ordem: aplicar ANTES do merge do PR que tira `"alpha"` do
-- `AppModule` — o código novo trata `submission.unit_id` como sempre preenchido. O código
-- antigo segue funcionando depois dela: nada lê as linhas `alpha`, e o α já exige a OM no
-- envio desde o #383.
--
-- ## 1. As linhas `module = 'alpha'`: converter, depois apagar
--
-- O backfill de 20260918123000 espelhou cada linha `alpha` nos papéis que o nível dela
-- alcançava e deixou a original de pé para o rollback do α. Mas a tela antiga do contrate
-- continuou gravando `alpha` até o deploy do contrate novo — e uma linha gravada DEPOIS do
-- backfill nunca foi convertida. O α novo não lê `alpha`: quem a recebeu PERDEU, em silêncio,
-- o acesso que ela concedia no modelo antigo (nível 3 era ACI).
--
-- Por isso esta migration primeiro REFAZ o backfill, com a mesma regra de 20260918123000, para
-- toda linha `alpha` que ainda não esteja coberta — é conversão do sistema, por migration, do
-- que já tinha sido concedido; não é concessão nova:
--
--   alpha 1       → alpha-requester 1
--   alpha 2       → alpha-requester 1 + alpha-procurement 1
--   alpha 3       → alpha-requester 1 + alpha-procurement 1 + alpha-aci 1 + alpha-admin 3
--   alpha <= 0    → bloqueio nos quatro
--
-- Mesmo escopo e mesmo `expires_at` da linha de origem (copiar sem o prazo transformaria um
-- acesso temporário em permanente). O `not exists` separa allow de deny — a mesma partição dos
-- dois índices únicos parciais: um allow novo não é barrado por um deny existente na chave,
-- nem o contrário; e um papel que já existe no lado certo não é tocado.
--
-- Só DEPOIS o DELETE, que continua CONDICIONADO À COBERTURA, como o do `sucont`
-- (20260910191735): sai a linha cujo titular tem TODOS os papéis que o nível dela alcançava,
-- no mesmo escopo e no mesmo lado. Depois da conversão isso é toda linha — a guarda fica para
-- o caso que a conversão não resolve (um papel já existente com nível abaixo do exigido), em
-- que apagar a linha seria perder acesso sem caminho de volta pela interface.
--
-- Em produção (consulta de 2026-09-19): 3 linhas `alpha`, todas nível 3 e globais; duas já
-- cobertas, uma gravada depois do backfill e convertida aqui. O aviso no fim lista o que foi
-- convertido e o que, se algo, ficou.
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
-- Idempotente: reaplicar não converte duas vezes nem apaga mais do que a cobertura permite, e
-- `set not null` sobre coluna já NOT NULL não faz nada.

begin;

-- ─── 1a. Conversão das linhas `alpha` ainda não cobertas ─────────────────────
-- A mesma regra de 20260918123000, em `user_permissions` e em `policy_statement`. O que foi
-- inserido vai para uma tabela temporária, só para o aviso do fim.
create temporary table alpha_legacy_converted (
	source text,
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
		(3, 'alpha-aci', 1),
		(3, 'alpha-admin', 3)
),
inserted as (
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
		)
	returning user_id, module, level, unit_id, kitchen_id, mess_hall_id
)
insert into alpha_legacy_converted
select 'inline', user_id, module, level, unit_id, kitchen_id, mess_hall_id from inserted;

-- Sem UNIQUE em `policy_statement` (várias linhas por política): o dedup inclui o nível.
with role_map (min_level, module, target_level) as (
	values
		(1, 'alpha-requester', 1),
		(2, 'alpha-procurement', 1),
		(3, 'alpha-aci', 1),
		(3, 'alpha-admin', 3)
),
inserted as (
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
		)
	returning policy_id, module, level, unit_id, kitchen_id, mess_hall_id
)
insert into alpha_legacy_converted
select 'policy', policy_id, module, level, unit_id, kitchen_id, mess_hall_id from inserted;

-- ─── 1b. Linhas `alpha` cobertas pelos papéis saem ───────────────────────────
-- Sai a linha para a qual NÃO EXISTE papel exigido faltando. O lado entra na comparação
-- (`(t.level > 0) = (s.level > 0)`) pela mesma razão dos dois índices únicos parciais: um
-- acesso não cobre um bloqueio, nem o contrário. O `expires_at` não entra: a conversão acima
-- copiou o prazo, e nada lê a linha `alpha`.
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

-- O que foi convertido — e o que, se algo, ficou — aparece no output de quem aplica.
do $$
declare
	v_converted   text;
	v_left_inline integer;
	v_left_policy integer;
begin
	select string_agg(format('%s %s → %s %s (%s)', c.source, c.owner_id, c.module, c.level,
			coalesce('OM ' || c.unit_id, 'cozinha ' || c.kitchen_id, 'refeitório ' || c.mess_hall_id, 'global')), '; ' order by c.source, c.owner_id, c.module)
		into v_converted
		from alpha_legacy_converted c;
	raise notice 'alpha: convertido nesta aplicação: %', coalesce(v_converted, 'nada');

	select count(*) into v_left_inline from access_control.user_permissions where module = 'alpha';
	select count(*) into v_left_policy from access_control.policy_statement where module = 'alpha';
	if v_left_inline > 0 or v_left_policy > 0 then
		raise notice 'alpha: % linha(s) inline e % statement(s) de política NÃO saíram — um papel da conversão já existia com nível abaixo do exigido; confira e reaplique', v_left_inline, v_left_policy;
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
