-- Portal suite (iefa.apps):
--  1) SISUB is no longer forecast-only — broaden its name/description and point
--     it to the new domain sisub.iefa.com.br (was app.previsaosisub.com.br).
--  2) Add the RUMAER and SUCONT apps that shipped after the suite was seeded.
-- Idempotent: safe to re-run.

-- 1) SISUB — Sistema de Subsistência (full ERP, not just forecasting)
update iefa.apps
set
	title       = 'SISUB — Sistema de Subsistência',
	description  = 'Sistema de Subsistência da FAB — cardápios, receitas, planejamento, compras e analytics do rancho. Muito além da previsão.',
	href         = 'https://sisub.iefa.com.br'
where href = 'https://app.previsaosisub.com.br'
	or title ilike '%sisub%'
	or title ilike '%rancho%'
	or title ilike '%previs%';

-- 2) RUMAER — uniformes FAB
insert into iefa.apps (title, description, href, to_path, icon_key, external, badges)
select
	'RUMAER',
	'Regulamento de Uniformes da Aeronáutica — consulta interativa de uniformes, peças e composições por perfil militar.',
	'https://rumaer.iefa.com.br',
	null,
	'medal',
	false,
	array[]::text[]
where not exists (
	select 1 from iefa.apps where title = 'RUMAER' or href = 'https://rumaer.iefa.com.br'
);

-- 3) SUCONT — contabilidade (HUB SUCONT-4)
insert into iefa.apps (title, description, href, to_path, icon_key, external, badges)
select
	'SUCONT',
	'HUB SUCONT-4 — contabilidade da FAB: workspace, relatórios e assistente de IA para a atividade contábil.',
	'https://sucont.iefa.com.br',
	null,
	'database',
	false,
	array[]::text[]
where not exists (
	select 1 from iefa.apps where title = 'SUCONT' or href = 'https://sucont.iefa.com.br'
);
