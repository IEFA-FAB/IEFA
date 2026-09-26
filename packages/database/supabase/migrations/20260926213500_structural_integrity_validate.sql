-- Valida as FKs para `auth.users` criadas NOT VALID em 20260926213000_structural_integrity.sql.
--
-- Arquivo separado porque cada migration roda na sua transação: a trava forte em `auth.users`
-- (SHARE ROW EXCLUSIVE, do ADD FOREIGN KEY) terminou no COMMIT da anterior. Aqui o
-- `VALIDATE CONSTRAINT` só pega SHARE UPDATE EXCLUSIVE na tabela filha e ROW SHARE em
-- `auth.users`, que não conflitam com INSERT/UPDATE/DELETE: login e cadastro seguem durante a
-- varredura. Em 2026-09-26 as oito filhas tinham 0 órfãos (12 linhas em
-- `user_policy_attachment`, as outras vazias). Idempotente: constraint já validada fica de fora.

do $$
declare
	c record;
begin
	for c in
		select conrelid::regclass as tbl, conname
		  from pg_constraint
		 where contype = 'f'
		   and not convalidated
		   and (conrelid, conname) in (
			('access_control.user_policy_attachment'::regclass, 'user_policy_attachment_user_id_fkey'),
			('alpha.chat_thread'::regclass, 'chat_thread_user_id_fkey'),
			('alpha.chat_message'::regclass, 'chat_message_user_id_fkey'),
			('alpha.chat_turn_usage'::regclass, 'chat_turn_usage_user_id_fkey'),
			('documents.official_document'::regclass, 'official_document_owner_id_fkey'),
			('documents.chat_message'::regclass, 'chat_message_owner_id_fkey'),
			('documents.writer_profile'::regclass, 'writer_profile_owner_id_fkey'),
			('documents.ai_generation'::regclass, 'ai_generation_owner_id_fkey')
		   )
	loop
		execute format('alter table %s validate constraint %I', c.tbl, c.conname);
	end loop;
end $$;
