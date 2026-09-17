-- Contrate (contrate.iefa.com.br) — a interface do Projeto α fora do portal.
--
-- APLICADA em prod em 2026-09-17, depois do DNS e do deploy, via MCP `apply_migration`
-- (versão remota 20260917194310) — o arquivo nasceu como 20260917200000 e foi renomeado
-- para casar com a versão registrada; senão o próximo `db push` tentaria reaplicá-la.
--
-- A ordem importava: o card da suíte aponta para o domínio novo, e publicá-lo antes do DNS
-- levaria quem clica a um host que não responde. Idempotente.
--
-- A unicidade dos grants `alpha`/`alpha-admin` NÃO mora aqui: ela virou regra geral de
-- `user_permissions` (índice único sobre usuário + módulo + escopo, com `nulls not
-- distinct`) em `20260917183328_access_control_user_permission_grant_uniq`.

-- Card na suíte do portal.
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
