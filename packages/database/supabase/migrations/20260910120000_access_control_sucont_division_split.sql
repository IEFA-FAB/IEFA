-- Split do módulo `sucont` (hub único) nos quatro módulos que o app passa a usar:
--   `sucont-1`, `sucont-3`, `sucont-4` — as três divisões da SUCONT que o hub reúne;
--   `sucont-admin`                     — governança dos acessos do próprio SUCONT.
--
-- Antes, um grant `sucont` único abria as ferramentas das TRÊS divisões e, no nível 3,
-- também a tela de acessos. Quem entrava para trabalhar na SUCONT-3 abria o auditor da
-- SUCONT-4 e o SAC-DGC da SUCONT-1 pelo mesmo grant. As divisões viram MÓDULOS, e não
-- escopos, porque o escopo do PBAC é um id numérico de unidade/cozinha/refeitório —
-- divisão da SUCONT não é nenhum dos três. É o mesmo recorte que `global` × `admin`
-- (20260818190949).
--
-- Backfill único, e conservador: ninguém perde acesso no deploy.
--   - todo grant `sucont` de nível 1 ou 2 vira o MESMO nível nas três divisões — é
--     exatamente o que ele alcançava até aqui;
--   - grant `sucont` de nível 3 vira nível 2 nas três divisões (o teto de escrita das
--     divisões) MAIS `sucont-admin` nível 3, que é a administração de acessos que ele
--     tinha. Sem essa segunda linha, os administradores de hoje perderiam a tela de
--     acessos no deploy — e não haveria caminho de volta pela interface.
--
-- As linhas `module = 'sucont'` NÃO são apagadas. Nenhum código as lê depois desta
-- migração (`AppModule` deixou de ter o valor), e mantê-las é o que faz um rollback do
-- deploy devolver o acesso de todo mundo em vez de deixar a base trancada para fora.
-- A limpeza é um passo separado, depois que a versão nova assentar.
--
-- `module` é `text` sem CHECK nas duas tabelas — nenhuma alteração de schema é
-- necessária, só dados. Idempotente (NOT EXISTS): reaplicar não duplica nem sobrescreve
-- um grant já ajustado à mão depois do split.

-- ─── Inline: access_control.user_permissions ─────────────────────────────────
-- Grants do sucont são sempre globais (escopo nulo), mas o `is not distinct from`
-- fica para o caso de alguém ter gravado um escopado à mão — dedup por escopo, não
-- por usuário.
insert into access_control.user_permissions (user_id, module, level, mess_hall_id, kitchen_id, unit_id)
select s.user_id, d.module, least(s.level, 2), s.mess_hall_id, s.kitchen_id, s.unit_id
from access_control.user_permissions s
cross join (values ('sucont-1'), ('sucont-3'), ('sucont-4')) as d(module)
where s.module = 'sucont'
  and not exists (
    select 1
    from access_control.user_permissions t
    where t.user_id = s.user_id
      and t.module = d.module
      and t.mess_hall_id is not distinct from s.mess_hall_id
      and t.kitchen_id   is not distinct from s.kitchen_id
      and t.unit_id      is not distinct from s.unit_id
  );

-- A administração de acessos, só para quem tinha nível 3. O nível é preservado: é o
-- que `requireSucontAdmin` cobra, antes e depois.
insert into access_control.user_permissions (user_id, module, level, mess_hall_id, kitchen_id, unit_id)
select s.user_id, 'sucont-admin', s.level, s.mess_hall_id, s.kitchen_id, s.unit_id
from access_control.user_permissions s
where s.module = 'sucont'
  and s.level >= 3
  and not exists (
    select 1
    from access_control.user_permissions t
    where t.user_id = s.user_id
      and t.module = 'sucont-admin'
      and t.mess_hall_id is not distinct from s.mess_hall_id
      and t.kitchen_id   is not distinct from s.kitchen_id
      and t.unit_id      is not distinct from s.unit_id
  );

-- ─── Managed policy: access_control.policy_statement ─────────────────────────
-- Nenhuma política empresta `sucont` hoje, mas o espelho vai junto: uma política criada
-- entre o merge e o deploy não pode virar um acesso que some. Dedup inclui o nível
-- porque não há UNIQUE aqui (várias linhas por política).
insert into access_control.policy_statement (policy_id, module, level, unit_id, kitchen_id, mess_hall_id)
select s.policy_id, d.module, least(s.level, 2), s.unit_id, s.kitchen_id, s.mess_hall_id
from access_control.policy_statement s
cross join (values ('sucont-1'), ('sucont-3'), ('sucont-4')) as d(module)
where s.module = 'sucont'
  and not exists (
    select 1
    from access_control.policy_statement t
    where t.policy_id = s.policy_id
      and t.module = d.module
      and t.level = least(s.level, 2)
      and t.unit_id      is not distinct from s.unit_id
      and t.kitchen_id   is not distinct from s.kitchen_id
      and t.mess_hall_id is not distinct from s.mess_hall_id
  );

insert into access_control.policy_statement (policy_id, module, level, unit_id, kitchen_id, mess_hall_id)
select s.policy_id, 'sucont-admin', s.level, s.unit_id, s.kitchen_id, s.mess_hall_id
from access_control.policy_statement s
where s.module = 'sucont'
  and s.level >= 3
  and not exists (
    select 1
    from access_control.policy_statement t
    where t.policy_id = s.policy_id
      and t.module = 'sucont-admin'
      and t.level = s.level
      and t.unit_id      is not distinct from s.unit_id
      and t.kitchen_id   is not distinct from s.kitchen_id
      and t.mess_hall_id is not distinct from s.mess_hall_id
  );
