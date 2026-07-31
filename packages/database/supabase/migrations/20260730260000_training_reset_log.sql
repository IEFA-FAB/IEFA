-- Auditoria do reset do ambiente de treino.
--
-- O reset apaga, em transação única, todos os dados operacionais pendurados nos escopos de
-- treino. É irreversível, então a execução precisa deixar rastro: quem, quando, quanto tempo
-- e quantas linhas por tabela.
--
-- A falha também é registrada — e FORA da transação de dados, para persistir apesar do
-- rollback. Um reset que falhou pela metade e não deixou registro é o pior dos mundos.
--
-- DDL idempotente (reaplicável por db:push ou MCP apply_migration).

create table if not exists core.training_reset_log (
	id             uuid primary key default gen_random_uuid(),
	actor_id       uuid not null,
	started_at     timestamptz not null default now(),
	finished_at    timestamptz,
	duration_ms    integer,
	-- { "kitchen.daily_menu": 12, "kitchen.recipes": 3, ... } — contagem por tabela, na
	-- ordem topológica em que o reset apagou.
	deleted_counts jsonb not null default '{}'::jsonb,
	status         text not null default 'running',
	error_message  text,
	constraint training_reset_log_status_check
		check (status in ('running', 'succeeded', 'failed'))
);

create index if not exists training_reset_log_started_idx
	on core.training_reset_log (started_at desc);

alter table core.training_reset_log enable row level security;

comment on table core.training_reset_log is
	'Histórico das execuções de reset do ambiente de treino. RLS ligada sem policy: acesso exclusivo via service key.';
