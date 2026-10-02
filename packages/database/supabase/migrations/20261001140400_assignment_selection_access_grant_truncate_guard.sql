-- Trava de TRUNCATE em `assignment_selection.access_grant`.
--
-- A tabela entrou no regime de mudança de acesso auditada em 20261001150000 (concessão do
-- controlador da escolha de vagas), depois de 20261001140100 ter posto a trava de TRUNCATE
-- nas demais tabelas vigiadas. Sem ela, o `audit:rls` acusa `access_truncate_unguarded`:
-- o trigger por linha não dispara em TRUNCATE, e um `truncate` revogaria o acesso sem log.

drop trigger if exists enforce_audited_truncate on assignment_selection.access_grant;
create trigger enforce_audited_truncate
	before truncate on assignment_selection.access_grant
	for each statement execute function access_control.refuse_unaudited_truncate();
