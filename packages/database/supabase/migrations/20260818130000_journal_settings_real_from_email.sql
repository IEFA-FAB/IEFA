-- journal.journal_settings.from_email apontava para `journal@iefa.edu.br`, semeado em
-- 20241215_create_journal_schema.sql. O domínio `iefa.edu.br` não existe — não é nosso e
-- nunca foi. O IEFA usa `fab.mil.br` para correio e `iefa.com.br` para os deploys.
--
-- Não é um campo decorativo: `metadata-xml.ts` o emite como <email_address> do
-- <depositor> no XML de depósito da Crossref. Todo DOI registrado até aqui levou um
-- contato morto — e é justamente para esse endereço que a Crossref escreve quando um
-- depósito falha, então a falha chegaria a ninguém.
--
-- Só corrige a linha que ainda carrega o valor semeado: se alguém já configurou um
-- endereço pela tela de settings, essa escolha é preservada.

update journal.journal_settings
set from_email = 'iefa@fab.mil.br',
    updated_at = now()
where from_email = 'journal@iefa.edu.br';
