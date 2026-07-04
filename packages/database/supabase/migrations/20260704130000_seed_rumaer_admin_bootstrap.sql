-- Bootstrap inicial dos administradores do módulo `rumaer`.
--
-- Contexto: antes, QUALQUER usuário @fab.mil.br logado podia editar os uniformes
-- do RUMAER. A partir da migração para PBAC (módulo `rumaer` em
-- access_control.user_permissions), a edição passa a exigir grant `rumaer` nível 2
-- e a gestão de acessos, nível 3. Sem um admin inicial, ninguém conseguiria
-- delegar acesso pela tela /admin/permissoes do rumaer.
--
-- Estratégia de bootstrap: concede `rumaer` nível 3 (admin) aos administradores
-- globais do sisub (module='global', level>=2) — dando continuidade a quem já
-- administra o ERP. A partir daí, novos acessos de editor/admin do rumaer são
-- concedidos exclusivamente pela tela /admin/permissoes (cada app se autogerencia).
--
-- Idempotente: só insere quando ainda não existe grant `rumaer` para o usuário.
-- Ajuste manualmente após o deploy se a lista inicial de admins do rumaer for outra.

-- Não listamos mess_hall_id/kitchen_id/unit_id: são nullable e default NULL (grant
-- unscoped). Listá-las com `null` puro no SELECT faz o Postgres inferir tipo `text`
-- e recusar o INSERT na coluna bigint (42804).
insert into access_control.user_permissions (user_id, module, level)
select distinct up.user_id, 'rumaer', 3
from access_control.user_permissions up
where up.module = 'global'
  and up.level >= 2
  and not exists (
    select 1
    from access_control.user_permissions existing
    where existing.user_id = up.user_id
      and existing.module = 'rumaer'
  );
