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
--    parcial), nenhuma execução nova depois que a submissão tem parecer, e parecer só
--    sobre a execução mais recente e sem outra em andamento (gatilhos, serializados pela
--    linha da submissão).
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
 * O α confere antes (409 legível); aqui a regra roda dentro do insert. A trava na linha da
 * submissão (`for no key update`, que não briga com as FKs) serializa este gatilho com o do
 * parecer abaixo: sem ela, em READ COMMITTED, cada um conferia o outro antes de ele gravar e
 * os dois passavam.
 */
create function alpha.compliance_run_frozen_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	perform 1 from alpha.submission where id = new.submission_id for no key update;

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

/**
 * Parecer só sobre a execução MAIS RECENTE da submissão, e sem outra em andamento.
 *
 * O chat e a etapa do processo leem a execução mais recente; um parecer sobre uma anterior
 * (ou emitido enquanto outra roda e vai virar a mais recente) ficaria gravado contradizendo
 * o que a tela mostra. Mesma trava de linha do gatilho acima. O α confere antes (409).
 */
create function alpha.compliance_review_run_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
	v_submission_id uuid;
	v_started_at    timestamptz;
begin
	select r.submission_id, r.started_at into v_submission_id, v_started_at
	from alpha.compliance_run r
	where r.id = new.run_id;

	if v_submission_id is null then
		return new; -- a FK recusa a execução inexistente
	end if;

	perform 1 from alpha.submission where id = v_submission_id for no key update;

	if exists (select 1 from alpha.compliance_run r where r.submission_id = v_submission_id and r.status = 'running') then
		raise exception 'RUN_IN_PROGRESS' using errcode = 'check_violation', detail = 'há uma verificação em andamento nesta submissão — aguarde o fim para emitir o parecer';
	end if;

	if exists (
		select 1 from alpha.compliance_run r
		where r.submission_id = v_submission_id and r.id <> new.run_id and r.started_at > v_started_at
	) then
		raise exception 'RUN_NOT_LATEST' using errcode = 'check_violation', detail = 'o parecer só cabe sobre a execução mais recente da submissão';
	end if;

	return new;
end;
$$;

create trigger compliance_review_run_guard
	before insert on alpha.compliance_review
	for each row execute function alpha.compliance_review_run_guard();

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

/**
 * Expurgo das sessões que nunca receberam pergunta. `POST /sessions` grava uma linha por
 * chamada; sem isto, sessão vazia (aba aberta e fechada, ou script) ficava para sempre. A
 * rotina diária do α chama com o corte de 24 h. Sessão com pergunta segue a retenção do
 * `query_log`.
 */
create function alpha.purge_empty_rada_sessions(p_before timestamptz)
returns integer
language sql
set search_path = ''
as $$
	with purged as (
		delete from alpha.rada_session s
		where s.created_at < p_before
			and not exists (select 1 from alpha.query_log q where q.session_id = s.id)
		returning 1
	)
	select count(*)::integer from purged;
$$;

insert into alpha.rada_session (id, user_id, created_at)
select q.session_id, (array_agg(q.user_id order by q.created_at))[1], min(q.created_at)
from alpha.query_log q
where q.user_id is not null
group by q.session_id
on conflict (id) do nothing;
