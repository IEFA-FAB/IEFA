-- Bloqueio do telão: enquanto `locked`, o painel cobre o conteúdo com uma tela de
-- espera (fundo desfocado + brasão do IEFA). Fica na edição, não em memória do
-- cliente, para que qualquer telão conectado entre e saia do bloqueio junto.
alter table assignment_selection.edition
	add column locked boolean not null default false;

-- O hook do telão já escuta `edition` (troca de edição ativa), mas a tabela não
-- estava na publicação — sem isso, o bloqueio só chegaria pelo poll de 2s.
alter table assignment_selection.edition replica identity full;
alter publication supabase_realtime add table assignment_selection.edition;
