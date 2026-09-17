-- Contrate (contrate.iefa.com.br) — a interface do Projeto α fora do portal.
--
-- APLICAR SÓ DEPOIS DO SITE NO AR: o card da suíte aponta para o domínio novo, e
-- publicá-lo antes do DNS e do deploy leva quem clica a um host que não responde.
-- Idempotente.

-- 1) Um grant global por (usuário, módulo) nos módulos do α.
--
-- `grantUnscopedModulePermission` (@iefa/pbac) faz update → insert → retry em 23505, e
-- esse 23505 só existe com o índice único parcial: sem ele, dois administradores
-- concedendo ao mesmo tempo gravam duas linhas, e a revogação de uma deixa a outra de pé.
-- É o mesmo desenho de `user_permissions_rumaer_global_uniq`, com `module` na chave
-- porque aqui são dois módulos.
create unique index if not exists user_permissions_alpha_global_uniq
on access_control.user_permissions (user_id, module)
where module in ('alpha', 'alpha-admin')
  and mess_hall_id is null
  and kitchen_id is null
  and unit_id is null;

-- 2) Card na suíte do portal.
insert into iefa.apps (title, description, href, to_path, icon_key, external, badges)
select
	'Contrate',
	'Copiloto de aquisições da FAB — verificação de ETP e TR contra a Lei 14.133/21, Plataforma ACI e Facilidades do Pregoeiro.',
	'https://contrate.iefa.com.br',
	null,
	'clipboard-check',
	false,
	array['Lei 14.133', 'ACI', 'Pregão']::text[]
where not exists (
	select 1 from iefa.apps where href = 'https://contrate.iefa.com.br'
);
