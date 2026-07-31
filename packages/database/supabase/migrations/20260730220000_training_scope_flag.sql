-- Escopo de treino: uma unidade, uma cozinha, um refeitório descartáveis.
--
-- A marcação vive na PRÓPRIA tabela, não numa estrutura paralela. O `unit_id`/`kitchen_id`
-- já circula em 24 tabelas, nos grants de PBAC e em todo server function; um escopo
-- paralelo obrigaria a bifurcar cada query escopada e cada guard, e a permissão de treino
-- não poderia ser expressa com o mesmo (module, level, scope) que o resto do sistema usa.
--
-- O índice único PARCIAL é a trava de segurança: o reset é destrutivo por linhagem de FK em
-- ~20 tabelas, e a pior falha imaginável é `is_training` marcado por engano numa unidade
-- real. Com ele, um UPDATE em massa não consegue marcar uma segunda linha.
--
-- DDL idempotente (reaplicável por db:push ou MCP apply_migration).

alter table core.units      add column if not exists is_training boolean not null default false;
alter table core.kitchen    add column if not exists is_training boolean not null default false;
alter table core.mess_halls add column if not exists is_training boolean not null default false;

create unique index if not exists units_single_training_idx
	on core.units (is_training)
	where is_training;

create unique index if not exists kitchen_single_training_idx
	on core.kitchen (is_training)
	where is_training;

create unique index if not exists mess_halls_single_training_idx
	on core.mess_halls (is_training)
	where is_training;

comment on column core.units.is_training is
	'Unidade do ambiente de treino. Índice único parcial garante no máximo uma. Excluída das listagens de produção e dos indicadores.';
comment on column core.kitchen.is_training is
	'Cozinha do ambiente de treino. Índice único parcial garante no máximo uma.';
comment on column core.mess_halls.is_training is
	'Refeitório do ambiente de treino. Índice único parcial garante no máximo um.';
