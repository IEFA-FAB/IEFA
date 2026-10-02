-- `analytics` passa a não aceitar escopo, como `admin` e `global` (20260921160420).
--
-- O módulo é a visão de TODAS as OMs: o assistente roda `sisub.execute_analytics_query` como
-- `analytics_reader` (BYPASSRLS, 20260921160000) e as telas do módulo (rede, equipamentos,
-- planejamento de compras) leem a FAB inteira. Toda checagem dele é sem escopo, e
-- `hasPermission` com consulta sem escopo aceita grant escopado: um `analytics` concedido "só
-- para a unidade 5" abriria o banco inteiro ao assistente como se fosse pleno. O escopo não
-- recortaria nada, só enganaria quem concede. A visão escopada por OM é o `local-analytics`.
--
-- O código já recusa na concessão (`UNSCOPED_ONLY_MODULES` em `@iefa/sisub-domain`), e o
-- endpoint do assistente exige allow sem escopo. Isto é a barreira no banco para qualquer outro
-- caminho.
--
-- CHECK novo, ao lado do de admin/global (que fica como está, com o nome que o código e os
-- comentários citam). Conferido em produção em 2026-10-01: zero grants inline e zero statements
-- de política de `analytics` com escopo (19 e 1, todos sem escopo). NOT VALID + VALIDATE: se
-- aparecer linha escopada até a aplicação, a migration inteira volta; corrija a linha (com
-- registro, por função auditada) antes de reaplicar.

alter table access_control.user_permissions
	add constraint user_permissions_analytics_unscoped
	check (module <> 'analytics' or (unit_id is null and kitchen_id is null and mess_hall_id is null))
	not valid;

alter table access_control.policy_statement
	add constraint policy_statement_analytics_unscoped
	check (module <> 'analytics' or (unit_id is null and kitchen_id is null and mess_hall_id is null))
	not valid;

comment on constraint user_permissions_analytics_unscoped on access_control.user_permissions is
	'analytics é a visão de todas as OMs (o assistente lê com BYPASSRLS): escopo aqui só enganaria quem concede. Visão por OM é local-analytics.';
comment on constraint policy_statement_analytics_unscoped on access_control.policy_statement is
	'Mesma regra do grant inline (user_permissions_analytics_unscoped).';

alter table access_control.user_permissions validate constraint user_permissions_analytics_unscoped;
alter table access_control.policy_statement validate constraint policy_statement_analytics_unscoped;

-- Linhas que violam (esperado: zero):
-- select id, user_id, level, unit_id, kitchen_id, mess_hall_id
--   from access_control.user_permissions
--  where module = 'analytics' and (unit_id is not null or kitchen_id is not null or mess_hall_id is not null);
--
-- select id, policy_id, level, unit_id, kitchen_id, mess_hall_id
--   from access_control.policy_statement
--  where module = 'analytics' and (unit_id is not null or kitchen_id is not null or mess_hall_id is not null);
