-- Garante no máximo UM grant `rumaer` unscoped (global) por usuário.
--
-- Fecha a corrida do grantRumaerPermissionFn (update-first → insert → retry 23505):
-- sem este índice, dois admins concedendo acesso ao mesmo usuário ao mesmo tempo
-- poderiam ambos ver "não existe" e inserir duas linhas idênticas.
--
-- Escopado a module = 'rumaer' de propósito — NÃO impõe invariante às linhas de
-- outros apps (sisub) na tabela compartilhada access_control.user_permissions.
--
-- Índice PARCIAL (mess_hall_id/kitchen_id/unit_id is null) porque os grants do rumaer
-- são sempre unscoped; um índice único comum sobre as colunas de escopo não deduplicaria
-- (o Postgres trata NULL como distinto, então NULL != NULL não viola o unique).

create unique index if not exists user_permissions_rumaer_global_uniq
on access_control.user_permissions (user_id)
where module = 'rumaer'
  and mess_hall_id is null
  and kitchen_id is null
  and unit_id is null;
