-- drop_inert_policies_and_storage_defaults — tira duas portas que hoje estão fechadas só por
-- outra camada.
--
-- ── 1. Policies `using (true)` sem grant ─────────────────────────────────────
--
-- Sete tabelas de `rumaer` e `core.measure_unit` têm policy de SELECT `using (true)` para
-- `anon`/`authenticated`, mas nenhum grant de cliente desde 20260920230000 — o navegador não lê
-- nenhuma delas (o rumaer só usa o cliente do navegador para auth e upload por URL assinada;
-- catálogo e unidades de medida vêm do servidor, com service role, que não passa por RLS) e
-- nenhuma está na publicação `supabase_realtime`. Inertes hoje, viram leitura pública de tabela
-- inteira no primeiro `grant select` que alguém conceder por outro motivo. Sem policy, a RLS
-- nega tudo ao cliente; o servidor continua igual.
--
-- ── 2. Default de privilégios do `postgres` no schema `storage` ──────────────
--
-- `alter default privileges for role postgres in schema storage` concedia tudo (tabelas,
-- sequências) e EXECUTE (funções) a `anon` e `authenticated`: objeto que uma migration nossa
-- criasse em `storage` nasceria aberto à chave publicável. Hoje não há nenhum objeto do
-- `postgres` lá (as tabelas e funções do Storage são do `supabase_storage_admin`, com grants e
-- policies próprios que NÃO mudam aqui), então revogar o default não altera objeto existente nem
-- o funcionamento do Storage — só o que nascer depois.
--
-- O que fica de fora (o `postgres` não pode mudar; ver `.claude/rules/database.md`):
--   * o default do `supabase_admin` em `public` (e em `graphql`/`graphql_public`), que concede
--     tudo e EXECUTE a anon/authenticated em objeto que ELE crie. `alter default privileges for
--     role supabase_admin` exige ser membro desse role, e o `postgres` não é. Só alcança objeto
--     criado pela plataforma (extensões); o que as nossas migrations criam é do `postgres`, cujo
--     default em `public` já não concede a cliente.
--
-- DDL idempotente (reaplicável).

drop policy if exists "public read piece" on rumaer.piece;
drop policy if exists "public read piece_item" on rumaer.piece_item;
drop policy if exists "public read uniform" on rumaer.uniform;
drop policy if exists "public read uniform_category" on rumaer.uniform_category;
drop policy if exists "public read uniform_variant" on rumaer.uniform_variant;
drop policy if exists "public read uniform_variant_image" on rumaer.uniform_variant_image;
drop policy if exists "public read uniform_variant_piece" on rumaer.uniform_variant_piece;
drop policy if exists measure_unit_read on core.measure_unit;

alter default privileges for role postgres in schema storage revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema storage revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema storage revoke all on routines from anon, authenticated;
