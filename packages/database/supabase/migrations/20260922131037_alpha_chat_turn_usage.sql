-- ============================================================================
-- Projeto α — chat sobre documento: teto que sobrevive ao apagar, e resposta
-- pareada pela pergunta.
--
-- Dois achados do `/code-review` do PR #405/#406 (2026-09-22):
--
-- 1. O teto diário (`ALPHA_CHAT_MAX_TURNS_PER_DAY`) contava as perguntas em
--    `chat_message`, e elas caem em cascata quando a conversa é apagada. Quem
--    batia no teto apagava a conversa e ganhava outras 60 perguntas, sem fim —
--    o freio de custo virava enfeite. `chat_turn_usage` guarda UM registro por
--    pergunta, sem FK para a conversa: apagar a conversa não o alcança. Só
--    `user_id` e a hora, nada do conteúdo; a rotina diária de expurgo apaga o
--    que passou de 48 horas (a janela do teto é de 24).
--
-- 2. O histórico reenviado ao modelo pareava cada pergunta com a mensagem
--    SEGUINTE. Dois turnos simultâneos na mesma conversa (duas abas) gravavam
--    [P1, P2, R1, R2], e o turno seguinte mostrava ao modelo P2 respondida por
--    R1. `reply_to` liga a resposta à pergunta que ela responde.
--
-- As tabelas do chat estavam vazias em produção quando esta migration foi
-- escrita, então não há backfill de `reply_to`.
-- ============================================================================

create table alpha.chat_turn_usage (
	id         uuid primary key default gen_random_uuid(),
	user_id    uuid not null,
	created_at timestamptz not null default now()
);

create index chat_turn_usage_user_ix on alpha.chat_turn_usage (user_id, created_at desc);

comment on table alpha.chat_turn_usage is
	'Uma linha por pergunta ao chat do contrate, para o teto diário por pessoa. Sem FK para a conversa: apagar a conversa não zera o teto. Expurgada após 48 h.';

alter table alpha.chat_turn_usage enable row level security;
grant all on alpha.chat_turn_usage to service_role;

alter table alpha.chat_message
	add column reply_to uuid references alpha.chat_message(id) on delete cascade;

comment on column alpha.chat_message.reply_to is
	'Na resposta do assistente, a pergunta que ela responde. NULL nas perguntas.';

create index chat_message_reply_to_ix on alpha.chat_message (reply_to) where reply_to is not null;

-- O teto passou a ler `chat_turn_usage`; este índice só servia a ele.
drop index alpha.chat_message_user_turns_ix;
