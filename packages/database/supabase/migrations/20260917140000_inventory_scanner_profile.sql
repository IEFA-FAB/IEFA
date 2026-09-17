-- ============================================================================
-- Perfil calibrado do leitor de código de barras, por usuário × cozinha
-- ============================================================================
-- Leitor USB em modo teclado é o periférico mais barato e o mais traiçoeiro:
-- cada modelo tem um intervalo entre teclas diferente, alguns não enviam
-- terminador nenhum, outros mandam Tab (que move o foco), e o separador GS do
-- GS1-128 chega trocado ou não chega — quando isso acontece, a validade entra
-- dentro do campo de lote e ninguém percebe.
--
-- A calibração é MEDIDA na tela "Testar leitor" e guardada aqui. Não vai para
-- `localStorage` de propósito: chave nova de armazenamento no navegador exige
-- versão nova da Política de Cookies (linha nova em `iefa.legal_documents` +
-- ciência de todos os usuários) por um dado que é preferência de periférico.
-- No banco, o perfil ainda atravessa troca de máquina.
-- ============================================================================

create table inventory.scanner_profile (
  user_id uuid not null references auth.users (id) on delete cascade,
  kitchen_id bigint not null references kitchen.kitchen (id) on delete cascade,
  -- intervalo máximo entre teclas para a sequência ainda ser considerada rajada
  max_key_interval_ms int not null default 80 check (max_key_interval_ms between 10 and 500),
  -- comprimento mínimo de uma leitura (EAN-8 e UPC-E têm 8 caracteres)
  min_length int not null default 8 check (min_length between 4 and 48),
  -- terminador que o leitor envia; 'none' = a leitura fecha por timeout
  terminator text not null default 'enter' check (terminator in ('enter', 'tab', 'none')),
  -- tempo sem novas teclas que fecha a leitura quando não há terminador
  idle_timeout_ms int not null default 120 check (idle_timeout_ms between 30 and 1000),
  prefix text check (length(prefix) <= 8),
  suffix text check (length(suffix) <= 8),
  -- caractere que a estação envia no lugar do separador GS (ASCII 29)
  gs_substitute text check (length(gs_substitute) = 1),
  updated_at timestamptz not null default now(),
  primary key (user_id, kitchen_id)
);

comment on table inventory.scanner_profile is
  'Calibração do leitor de código de barras por usuário × cozinha. Medida na tela "Testar leitor"; fora do navegador para não exigir versão nova da Política de Cookies.';

-- `core.kitchen` é VIEW (o schema foi dividido por domínio); a tabela é
-- `kitchen.kitchen`, e é nela que a FK tem de apontar.
-- DENY-ALL: leitura e escrita passam pelas server fns com PBAC `storage`
alter table inventory.scanner_profile enable row level security;
revoke all on inventory.scanner_profile from anon, authenticated;
