-- ============================================================================
-- Projeto α — chat: uma resposta por pergunta.
--
-- A gravação da resposta do assistente tenta duas vezes (uma pergunta sem
-- resposta trava a conversa como "turno em andamento" até o teto de um turno).
-- Se o primeiro insert comitou e a resposta se perdeu no caminho, a segunda
-- tentativa duplicaria a resposta na tela. O índice único torna a nova
-- tentativa segura: o α trata o 23505 como "já gravada" (achado do
-- `/code-review` do #405, 2026-09-22).
--
-- APLICADA em 2026-09-22, antes do merge (tabelas do chat vazias).
-- ============================================================================

drop index if exists alpha.chat_message_reply_to_ix;
create unique index chat_message_reply_to_uniq on alpha.chat_message (reply_to) where reply_to is not null;
