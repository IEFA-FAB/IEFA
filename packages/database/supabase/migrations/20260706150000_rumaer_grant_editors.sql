-- Concede acesso `rumaer` a uma lista nominal de editores/admins.
--
-- Contexto: a edição dos uniformes do RUMAER exige grant `rumaer` nível 2 e a gestão
-- de acessos, nível 3 (ver 20260704130000_seed_rumaer_admin_bootstrap.sql). Esta
-- migração concede acesso pleno de edição aos usuários abaixo; três deles também
-- recebem nível 3 para poderem conceder acesso a outros pela tela /admin/permissoes.
--
--   nível 3 (editar + administrar grants):
--     arethaarjl@fab.mil.br, jesuejjfn@fab.mil.br, santiagoacs@fab.mil.br
--   nível 2 (editar uniformes):
--     debsrsd@fab.mil.br, tp.higorhas@fab.mil.br,
--     tp.douglasmarquesdmgs@fab.mil.br, avnerslasf@fab.mil.br
--
-- Idempotente: `on conflict do update` reaplica o nível desejado sobre o índice
-- único parcial `user_permissions_rumaer_global_uniq` (20260704140000). Grants do
-- rumaer são sempre unscoped, então mess_hall_id/kitchen_id/unit_id ficam NULL
-- (default). Não listamos essas colunas de propósito: com `null` puro o Postgres
-- infere `text` e recusa o INSERT na coluna bigint (42804).
--
-- O join com auth.users resolve email -> user_id. Se algum email ainda não existir
-- em auth.users (usuário nunca logou), a linha é simplesmente ignorada — reaplique
-- esta migração ou conceda pela tela /admin/permissoes após o primeiro login.

with grants (email, level) as (
	values
		('arethaarjl@fab.mil.br', 3),
		('jesuejjfn@fab.mil.br', 3),
		('santiagoacs@fab.mil.br', 3),
		('debsrsd@fab.mil.br', 2),
		('tp.higorhas@fab.mil.br', 2),
		('tp.douglasmarquesdmgs@fab.mil.br', 2),
		('avnerslasf@fab.mil.br', 2)
)
insert into access_control.user_permissions (user_id, module, level)
select u.id, 'rumaer', g.level
from grants g
join auth.users u on lower(u.email) = lower(g.email)
on conflict (user_id) where module = 'rumaer'
	and mess_hall_id is null
	and kitchen_id is null
	and unit_id is null
do update set level = excluded.level;
