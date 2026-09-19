-- ============================================================================
-- `admin` e `global` não aceitam escopo
-- ============================================================================
-- Achado da auditoria de 2026-09-19 (rodada 2). Toda checagem de `admin` e de
-- `global` é SEM escopo, e `hasPermission` com consulta sem escopo aceita
-- qualquer grant escopado do módulo. Um `admin` concedido "só para a unidade 5"
-- passaria, então, como administrador pleno — o escopo não recortava nada.
--
-- O código já recusa na concessão (sisub-domain: `CreateUserPermissionSchema`,
-- `PolicyStatementInputSchema`, `createUserPermission`, `updateUserPermission`,
-- `addPolicyStatement`/`updatePolicyStatement`, `attachPolicy`). Isto é a
-- barreira no banco para qualquer outro caminho.
--
-- Criada NOT VALID e validada logo em seguida: o split `global` → `admin`
-- (20260818190949) espelhou grants `global` com o escopo que tivessem, e o VALIDATE
-- é o que prova que nenhum era escopado. Conferido em produção em 2026-09-19: zero
-- linhas violando nas duas tabelas (consultas no fim). Se o VALIDATE falhar num
-- banco com linha antiga escopada, a migration inteira volta — corrigir a linha
-- (com registro) antes de reaplicar.
-- ============================================================================

alter table access_control.user_permissions
  add constraint user_permissions_admin_global_unscoped
  check (module not in ('admin', 'global') or (unit_id is null and kitchen_id is null and mess_hall_id is null))
  not valid;

alter table access_control.policy_statement
  add constraint policy_statement_admin_global_unscoped
  check (module not in ('admin', 'global') or (unit_id is null and kitchen_id is null and mess_hall_id is null))
  not valid;

comment on constraint user_permissions_admin_global_unscoped on access_control.user_permissions is
  'admin/global valem para a FAB inteira: consulta sem escopo aceita grant escopado, então escopo aqui só enganaria quem concede.';
comment on constraint policy_statement_admin_global_unscoped on access_control.policy_statement is
  'Mesma regra do grant inline (user_permissions_admin_global_unscoped).';

alter table access_control.user_permissions validate constraint user_permissions_admin_global_unscoped;
alter table access_control.policy_statement validate constraint policy_statement_admin_global_unscoped;

-- Linhas que violam (esperado: zero):
-- select id, user_id, module, level, unit_id, kitchen_id, mess_hall_id
--   from access_control.user_permissions
--  where module in ('admin', 'global') and (unit_id is not null or kitchen_id is not null or mess_hall_id is not null);
--
-- select id, policy_id, module, level, unit_id, kitchen_id, mess_hall_id
--   from access_control.policy_statement
--  where module in ('admin', 'global') and (unit_id is not null or kitchen_id is not null or mess_hall_id is not null);
