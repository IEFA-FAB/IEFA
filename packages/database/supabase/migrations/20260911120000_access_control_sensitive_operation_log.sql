-- access_control_sensitive_operation_log
-- Registro apenas-inserção das operações sensíveis do ERP.
--
-- ── Por que esta tabela existe ───────────────────────────────────────────────
--
-- Hoje não há registro NENHUM de quem concedeu qual permissão, de quem empenhou
-- recurso público ou de quem exportou dado nominal. Segundo fator reduz a chance
-- de a conta ser tomada; só a auditoria responde "o que foi feito com ela".
-- O incidente #288 (dado pessoal de 68k militares servido anonimamente por mais
-- de oito meses) foi descoberto por leitura de código, não por registro — e o log
-- do ALB, único rastro que havia, só guarda 30 dias.
--
-- ── Por que `on delete restrict` em `actor_id` ───────────────────────────────
--
-- Prova de ação não pode sumir junto com quem agiu. Com `cascade`, apagar o
-- usuário apagaria exatamente as linhas que o incriminam — o adversário que
-- alcança a remoção de conta limparia o próprio rastro, e a auditoria mais
-- importante seria a primeira a desaparecer. Com `set null` sobra a linha sem
-- ator, que não responde à única pergunta que o log existe para responder.
-- `restrict` inverte o ônus: quem quiser apagar a conta tem que decidir, de
-- forma explícita e consciente, o que fazer com o histórico dela. É a mesma
-- razão pela qual `iefa.user_legal_acceptances.document_id` é `restrict`
-- (LGPD.md): destruir a prova é pior do que reter a linha.
--
-- ── Por que `assurance` é texto com check, e não enum ────────────────────────
--
-- O grau exigido é vocabulário da APLICAÇÃO (o registro de classificação em
-- código), não do banco. `text` + `check` deixa acrescentar grau novo numa
-- migration comum; `alter type ... add value` de enum não roda dentro de
-- transação e complicaria `db push` sem nenhum ganho.
--
-- ── Por que `target` é jsonb anulável ────────────────────────────────────────
--
-- O alvo muda de forma por operação: `{ userId, module }` numa concessão de
-- permissão, `{ empenhoId }` numa liquidação. Uma coluna por tipo de alvo seria
-- migration a cada operação classificada nova. Anulável porque existe operação
-- sensível sem alvo além do próprio ator (gerar códigos de recuperação, p. ex.).
--
-- DDL idempotente (reaplicável por db:push ou MCP apply_migration).

create table if not exists access_control.sensitive_operation_log (
	id         uuid primary key default gen_random_uuid(),
	-- Quem executou. Sempre a sessão real; nunca um id vindo do input do cliente.
	actor_id   uuid not null references auth.users(id) on delete restrict,
	-- Nome da server function classificada (ex.: 'createUserPermissionFn').
	operation  text not null,
	-- Grau de garantia de identidade exigido na execução.
	assurance  text not null,
	-- Identificação do alvo: ids e escopo, no formato de cada operação.
	target     jsonb,
	created_at timestamptz not null default now(),
	constraint sensitive_operation_log_assurance_check
		check (assurance in ('session', 'fresh'))
);

-- "O que este usuário fez" é a consulta da tela de auditoria: filtra por ator e
-- pagina do mais recente para o mais antigo. O índice composto atende as duas
-- metades de uma vez.
create index if not exists sensitive_operation_log_actor_created_idx
	on access_control.sensitive_operation_log (actor_id, created_at desc);

-- "O que aconteceu no período" — varredura sem ator, para o painel geral.
create index if not exists sensitive_operation_log_created_idx
	on access_control.sensitive_operation_log (created_at desc);

-- RLS ligada SEM policy nenhuma: o acesso é exclusivo por service key, e a
-- autorização de leitura (`admin` nível 3) mora na server function, no PBAC.
-- Policy de leitura aqui não protegeria o caminho real — service role ignora
-- RLS — e abriria uma segunda superfície para manter em dia. Sem policy e sem
-- grant, `anon` e `authenticated` leem zero linha e não enumeram a tabela no
-- `/rest/v1/` (ver 20260825160953, que também zerou os default privileges do
-- schema: tabela nova nasce sem grant).
alter table access_control.sensitive_operation_log enable row level security;

comment on table access_control.sensitive_operation_log is
	'Registro apenas-inserção das operações classificadas como sensíveis. Acesso exclusivo via service key; leitura exige `admin` nível 3 no PBAC. Nenhum caminho de aplicação atualiza ou remove linhas — `actor_id` é `on delete restrict` para que a prova não seja apagada junto com o usuário.';
