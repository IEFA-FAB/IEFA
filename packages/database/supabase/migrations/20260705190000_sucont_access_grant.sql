-- sucont_access_grant
-- Controle de acesso (PBAC) do módulo `sucont` na tabela compartilhada
-- access_control.user_permissions. Grants do sucont são sempre globais/unscoped:
--   level 1 = acessar o hub; 2 = editar dados da seção; 3 = gerenciar grants.
--
-- Garante um único grant global por usuário para o módulo (evita duplicatas no
-- update-first→insert das server functions de gestão), espelhando o rumaer.

create unique index if not exists user_permissions_sucont_global_uniq
on access_control.user_permissions (user_id)
where module = 'sucont' and mess_hall_id is null and kitchen_id is null and unit_id is null;

-- Bootstrap: concede `sucont` nível 3 (admin) ao usuário de testes/administrador
-- inicial. A partir daí, novos acessos são concedidos pela própria app.
-- Idempotente: resolve o UUID pelo e-mail em auth.users; não faz nada se ausente.
-- Não lista mess_hall_id/kitchen_id/unit_id: nullable/default NULL. Listá-las como
-- `null` puro no SELECT faz o Postgres inferir `text` e recusar o INSERT (42804).
insert into access_control.user_permissions (user_id, module, level)
select u.id, 'sucont', 3
from auth.users u
where u.email = 'nannijpsn@fab.mil.br'
  and not exists (
    select 1 from access_control.user_permissions existing
    where existing.user_id = u.id and existing.module = 'sucont'
  );
