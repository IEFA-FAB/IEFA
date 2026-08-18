-- Aplicada em prod em 2026-08-18 via MCP `apply_migration` (versão remota 20260818190949).
-- O arquivo foi renomeado de 20260818160000 para casar com a versão que o MCP registrou e
-- evitar que um `db:push` futuro tente reaplicar (seria inócuo — o backfill é idempotente).
--
-- Split do módulo `global` (SDAB) em `global` (catálogo) + `admin` (administração de
-- plataforma). As telas de permissões, avaliação, sincronização e ambiente de treino
-- passaram a exigir o módulo `admin`; os guards de domínio/rotas já foram trocados no código.
--
-- Backfill único: todo principal que HOJE tem `global` recebe um grant/statement `admin`
-- EQUIVALENTE (mesmo nível, mesmo escopo). Sem isto, quem administra hoje perderia o acesso
-- às quatro telas no deploy. Os grants de `admin` futuros são atribuídos separadamente (o
-- vínculo com `global` não é recriado depois desta migração).
--
-- `module` é `text` sem CHECK nas duas tabelas — nenhuma alteração de schema é necessária,
-- só dados. Idempotente (NOT EXISTS): reaplicar por db:push/MCP não duplica nem sobrescreve
-- um `admin` já existente (preserva ajustes manuais posteriores).

-- ─── Inline policy: access_control.user_permissions ──────────────────────────
-- Dedup por (user_id, escopo): a tabela tem no máximo um grant por módulo+escopo, então o
-- nível vem da linha `global` correspondente. `is not distinct from` casa os escopos nulos.
insert into access_control.user_permissions (user_id, module, level, mess_hall_id, kitchen_id, unit_id)
select g.user_id, 'admin', g.level, g.mess_hall_id, g.kitchen_id, g.unit_id
from access_control.user_permissions g
where g.module = 'global'
  and not exists (
    select 1
    from access_control.user_permissions a
    where a.user_id = g.user_id
      and a.module = 'admin'
      and a.mess_hall_id is not distinct from g.mess_hall_id
      and a.kitchen_id   is not distinct from g.kitchen_id
      and a.unit_id      is not distinct from g.unit_id
  );

-- ─── Managed policy: access_control.policy_statement ─────────────────────────
-- Uma política pode ter vários statements `global` (níveis/escopos diferentes); espelha cada
-- um como `admin`. Dedup inclui o nível porque não há UNIQUE aqui (várias linhas por política).
insert into access_control.policy_statement (policy_id, module, level, unit_id, kitchen_id, mess_hall_id)
select s.policy_id, 'admin', s.level, s.unit_id, s.kitchen_id, s.mess_hall_id
from access_control.policy_statement s
where s.module = 'global'
  and not exists (
    select 1
    from access_control.policy_statement a
    where a.policy_id = s.policy_id
      and a.module = 'admin'
      and a.level = s.level
      and a.unit_id      is not distinct from s.unit_id
      and a.kitchen_id   is not distinct from s.kitchen_id
      and a.mess_hall_id is not distinct from s.mess_hall_id
  );
