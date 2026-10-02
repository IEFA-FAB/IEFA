-- ============================================================================
-- Projeto α — freios de custo e de abuso (revisão de segurança de 2026-10-01).
--
-- 1. Teto diário por pessoa em TODA rota que chama modelo (e no envio de arquivo).
--    O teto existia só no chat do contrate, sobre `chat_turn_usage`. O ChatRADA, a
--    extração, a verificação de conformidade, a avaliação de regra e a coleta de fonte
--    chamavam o modelo sem limite nenhum: qualquer JWT válido pagava Bedrock à vontade.
--    `chat_turn_usage` vira o livro de uso de todas elas, com a coluna `kind`; o nome
--    da tabela fica (renomear quebraria o α em produção entre a aplicação e o deploy).
--
--    `claim_usage` confere e registra NA MESMA transação, sob advisory lock por
--    (pessoa, tipo). A versão anterior lia e depois gravava: um script com cem
--    requisições em paralelo passava inteiro pela leitura antes da primeira gravação.
--
-- 2. Conformidade: no máximo UMA execução `running` por submissão (índice único
--    parcial), e nenhuma execução nova depois que a submissão tem parecer (gatilho).
--    Sem isto, cada clique em "verificar" disparava uma chamada de modelo por regra
--    ativa, quatro em paralelo, quantas vezes se quisesse — e, como o chat e a etapa
--    leem só a execução mais recente, reexecutar até sair um resultado limpo apagava
--    da vista o resultado anterior.
--
-- 3. Sessão do ChatRADA com dono desde a criação. A sessão não tinha tabela: o dono
--    saía da primeira linha de `query_log`, gravada só no FIM do turno, e sessão sem
--    linha era aceita para qualquer autenticado. `rada_session` grava o dono em
--    `POST /sessions`; sessão sem linha passa a ser recusada.
--
--    Backfill: em 2026-10-01 eram 17 sessões em `query_log`, todas com um único dono
--    (nenhuma com dois `user_id`, nenhuma com `user_id` nulo). Os 8 threads do
--    checkpointer sem linha em `query_log` são de usuários que não existem mais em
--    `auth.users` (testes de 2026-09-10): ficam sem dono e, portanto, inacessíveis.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Livro de uso
-- ----------------------------------------------------------------------------
alter table alpha.chat_turn_usage
	add column kind text not null default 'chat',
	add constraint chat_turn_usage_kind_check check (kind in ('chat', 'rada', 'extraction', 'compliance', 'upload', 'rule_evaluation', 'source_refresh'));

create index chat_turn_usage_user_kind_ix on alpha.chat_turn_usage (user_id, kind, created_at desc);
drop index alpha.chat_turn_usage_user_ix;

comment on table alpha.chat_turn_usage is
	'Livro de uso do α para os tetos diários por pessoa: uma linha por chamada cobrada (pergunta do chat, turno do ChatRADA, extração, verificação, envio de arquivo...). Sem FK para conversa ou submissão: apagar o objeto não zera o teto. Expurgada após 48 h.';
comment on column alpha.chat_turn_usage.kind is
	'Que teto a linha consome. O nome da tabela é histórico (nasceu só para o chat).';

/**
 * Confere o teto e, se couber, registra o uso — atômico por (pessoa, tipo).
 *
 * Janela deslizante de 24 h, a mesma regra de `apps/alpha/src/chat/daily-limit.ts`: com
 * `p_max` usos na janela, recusa e devolve quando a MAIS ANTIGA delas sai da janela.
 */
create function alpha.claim_usage(p_user_id uuid, p_kind text, p_max integer)
returns table (allowed boolean, retry_at timestamptz)
language plpgsql
set search_path = ''
as $$
declare
	v_count  integer;
	v_oldest timestamptz;
begin
	if p_user_id is null or p_kind is null or p_max is null or p_max < 1 then
		raise exception 'claim_usage: argumentos inválidos' using errcode = 'invalid_parameter_value';
	end if;

	-- Serializa só a mesma pessoa no mesmo teto; os demais seguem em paralelo.
	perform pg_advisory_xact_lock(hashtextextended('alpha.claim_usage:' || p_user_id::text || ':' || p_kind, 0));

	select count(*), min(recent.created_at)
	into v_count, v_oldest
	from (
		select u.created_at
		from alpha.chat_turn_usage u
		where u.user_id = p_user_id
			and u.kind = p_kind
			and u.created_at > now() - interval '24 hours'
		order by u.created_at desc
		limit p_max
	) recent;

	if v_count >= p_max then
		return query select false, v_oldest + interval '24 hours';
		return;
	end if;

	insert into alpha.chat_turn_usage (user_id, kind) values (p_user_id, p_kind);
	return query select true, null::timestamptz;
end;
$$;

comment on function alpha.claim_usage(uuid, text, integer) is
	'Teto diário do α: confere e registra o uso na mesma transação (advisory lock por pessoa e tipo). Só service_role executa.';

-- ----------------------------------------------------------------------------
-- 2. Conformidade: uma execução em andamento por submissão; nada depois do parecer
-- ----------------------------------------------------------------------------
create unique index compliance_run_one_running_ix on alpha.compliance_run (submission_id) where status = 'running';

/**
 * Parecer congela a submissão: nenhuma execução nova depois dele.
 *
 * O α confere antes (409 legível); aqui a regra roda dentro do insert, para que uma
 * emissão de parecer concorrente não deixe passar uma execução que a contradiz.
 */
create function alpha.compliance_run_frozen_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if exists (
		select 1
		from alpha.compliance_review v
		join alpha.compliance_run r on r.id = v.run_id
		where r.submission_id = new.submission_id
	) then
		raise exception 'COMPLIANCE_FROZEN' using errcode = 'check_violation', detail = 'a submissão já tem parecer; a verificação não se repete';
	end if;
	return new;
end;
$$;

create trigger compliance_run_frozen_guard
	before insert on alpha.compliance_run
	for each row execute function alpha.compliance_run_frozen_guard();

-- ----------------------------------------------------------------------------
-- 3. Sessão do ChatRADA com dono
-- ----------------------------------------------------------------------------
create table alpha.rada_session (
	id         uuid primary key,
	user_id    uuid not null,
	created_at timestamptz not null default now()
);

create index rada_session_user_ix on alpha.rada_session (user_id, created_at desc);

comment on table alpha.rada_session is
	'Sessão do ChatRADA e o dono dela, gravado em POST /api/v1/sessions. Sessão sem linha aqui é recusada.';

alter table alpha.rada_session enable row level security;
grant all on alpha.rada_session to service_role;

insert into alpha.rada_session (id, user_id, created_at)
select q.session_id, (array_agg(q.user_id order by q.created_at))[1], min(q.created_at)
from alpha.query_log q
where q.user_id is not null
group by q.session_id
on conflict (id) do nothing;
