-- APLICADA em prod em 2026-09-17 via MCP `apply_migration` (versão remota 20260917144339), antes do
-- deploy do α — o arquivo foi renomeado para casar com a versão registrada.
--
-- Projeto α passa a autorizar pelo PBAC (`@iefa/pbac`), como sisub, rumaer e sucont.
--
-- Antes: o perfil era `auth.users.raw_app_meta_data->>'role'` (`app_requisitante`,
-- `app_licitacoes`, `app_aci`) — um texto único por usuário, gravado por SQL, sem prazo,
-- sem negação, sem registro e sem tela. Depois: módulos `alpha` e `alpha-admin` em
-- `access_control.user_permissions`, resolvidos pelo α a cada request.
--
-- Os perfis são aninhados e viram nível do módulo `alpha`:
--   app_requisitante → alpha 1
--   app_licitacoes   → alpha 2  (fila e processos de todos)
--   app_aci          → alpha 3  (triagem, parecer, curadoria de regras e fontes)
-- e quem era ACI também recebe `alpha-admin` 3 — hoje não há tela para conceder perfil,
-- e sem esse grant ninguém administraria os acessos do α quando ela existir.
--
-- Precisa rodar ANTES do deploy do α: a partir dele nada lê `app_metadata.role`, e o
-- container novo subindo sem o backfill rebaixaria todo ACI a "sem perfil".
--
-- `app_metadata.role` NÃO é apagado aqui. O código novo não o lê, e mantê-lo é o que faz
-- um rollback do deploy devolver o acesso. A limpeza é um passo separado, depois que a
-- versão nova assentar.
--
-- `module` é `text` sem CHECK — só dados. Idempotente (NOT EXISTS): reaplicar não
-- duplica nem sobrescreve um grant ajustado depois.

insert into access_control.user_permissions (user_id, module, level)
select u.id,
       'alpha',
       case u.raw_app_meta_data->>'role'
         when 'app_aci' then 3
         when 'app_licitacoes' then 2
         when 'app_requisitante' then 1
       end
from auth.users u
where u.raw_app_meta_data->>'role' in ('app_aci', 'app_licitacoes', 'app_requisitante')
  and not exists (
    select 1
    from access_control.user_permissions t
    where t.user_id = u.id
      and t.module = 'alpha'
      and t.mess_hall_id is null
      and t.kitchen_id is null
      and t.unit_id is null
  );

insert into access_control.user_permissions (user_id, module, level)
select u.id, 'alpha-admin', 3
from auth.users u
where u.raw_app_meta_data->>'role' = 'app_aci'
  and not exists (
    select 1
    from access_control.user_permissions t
    where t.user_id = u.id
      and t.module = 'alpha-admin'
      and t.mess_hall_id is null
      and t.kitchen_id is null
      and t.unit_id is null
  );
