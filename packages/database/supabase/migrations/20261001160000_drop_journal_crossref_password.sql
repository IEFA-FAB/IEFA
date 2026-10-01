-- Remove `journal.journal_settings.crossref_password`.
--
-- A coluna guardava a senha do depósito no Crossref em texto puro, numa tabela que o portal
-- lê com service role e devolve ao editor inteira (`updateJournalSettingsFn` faz
-- `select()` de tudo). Nenhum código usa a senha: o portal só gera o XML de depósito para
-- download (`apps/portal/src/lib/journal/metadata-xml.ts`), sem chamar a API do Crossref, e
-- nenhuma função ou view do banco a referencia. Em 2026-10-01 a única linha da tabela tinha a
-- coluna NULL. Credencial de integração, quando o depósito automático existir, mora em
-- variável de ambiente do servidor, não em linha que a tela de configuração lê e grava.
--
-- `crossref_username` fica: não é segredo e identifica o depositante no XML, se vier a ser usado.
--
-- Defesa: se alguém tiver gravado uma senha entre a conferência e a aplicação, a migration
-- aborta em vez de apagar a credencial em silêncio.

do $$
begin
	if exists (select 1 from journal.journal_settings where coalesce(crossref_password, '') <> '') then
		raise exception 'journal.journal_settings.crossref_password tem valor: mova a credencial para variável de ambiente do servidor antes de remover a coluna.';
	end if;
end
$$;

alter table journal.journal_settings drop column crossref_password;
