-- legacy_access_profiles
--
-- Duas sobras de modelos antigos de acesso e de perfil, achadas na auditoria de 2026-09-26.
--
-- ── 1. access_control.profiles_admin → legacy_access.profiles_admin (arquivada) ──
--
-- Modelo de papéis anterior ao PBAC (`user`/`admin`/`superadmin`, enum public."userLevels").
-- Ninguém mais lê nem escreve: no código só restavam tipos (removidos no mesmo PR); no banco,
-- nenhuma função, view, policy ou FK de entrada; última escrita em 2026-02-18. Duplica o e-mail
-- de core.user_data (42 de 43) e o SARAM (37 de 43 = nrOrdem), e um papel `superadmin` numa
-- tabela de `access_control` engana quem lê o schema procurando quem tem acesso a quê.
--
-- Arquiva em vez de apagar: vai para `legacy_access`, schema fora de `pgrst.db_schemas` e sem
-- USAGE nem privilégio de tabela para anon, authenticated ou service_role — só o dono (postgres)
-- a lê. O DROP (tabela, enum e schema) fica para migration própria a partir de 2026-12-26, se
-- ninguém tiver precisado dela até lá. A FK para auth.users (ON DELETE CASCADE) continua: quem
-- é apagado do Auth sai também do arquivo.
--
-- `profiles_admin` NÃO é tabela vigiada (não tem o trigger enforce_audited_access_change) e
-- nada aqui escreve linha nela: `SET SCHEMA` é DDL, não dispara trigger de linha. Sem bypass.
--
-- ── 2. journal.user_profiles deixa de nascer no cadastro do Auth ──
--
-- O trigger `on_auth_user_created` (auth.users → public.handle_new_user) criava um perfil
-- `author` do journal para TODA conta do Auth, de qualquer app, com o nome tirado do começo do
-- e-mail: 1435 perfis para 1 artigo. Dado pessoal gravado para quem nunca usou o journal
-- (LGPD, art. 6º, III — necessidade). O perfil passa a nascer quando a pessoa usa o journal: o
-- portal já mostra o "Complete seu perfil" a quem não tem, e o formulário grava por
-- `journal.save_user_profile` (modo `upsert`), a função auditada, com o papel `author` do
-- default da coluna.
--
-- Remover o trigger exige ser dono de auth.users (supabase_auth_admin); a migration roda como
-- postgres, que tem TRIGGER mas não é dono. Por isso a função vira no-op ANTES, e a remoção do
-- trigger (e da função) é tentada num bloco que, sem o privilégio, só avisa: nos dois desfechos
-- o cadastro deixa de criar perfil.
--
-- Os perfis que já existem ficam: apagar dado pessoal é decisão do mantenedor (LGPD.md,
-- exclusão manual). A proposta, com a query de contagem, está no PR.
--
-- ── 3. journal.editorial_dashboard: LEFT JOIN no perfil ──
--
-- A view fazia INNER JOIN com user_profiles: submissão de quem não tem perfil sumia do painel
-- editorial. Com o perfil sob demanda isso passa a ser possível; a linha aparece com
-- `submitter_name` nulo. Mesmas colunas, mesmo `security_invoker`.
--
-- Compatível com o código da main: nada lê profiles_admin; o portal já trata perfil
-- inexistente (maybeSingle + onboarding). Idempotente (reaplicável).

-- ── 1 ───────────────────────────────────────────────────────────────────────

-- Trava: se alguém passou a depender da tabela desde a auditoria, para aqui em vez de quebrar.
do $$
declare
	v_refs text;
begin
	select string_agg(ref, '; ') into v_refs
	from (
		select format('função %s', p.oid::regprocedure) as ref
			from pg_proc p
			join pg_namespace n on n.oid = p.pronamespace
			where p.prosrc ilike '%profiles_admin%'
				and n.nspname not in ('pg_catalog', 'information_schema')
		union all
		select format('view %I.%I', schemaname, viewname) from pg_views where definition ilike '%profiles_admin%'
		union all
		select format('view materializada %I.%I', schemaname, matviewname) from pg_matviews where definition ilike '%profiles_admin%'
		union all
		select format('policy %s em %I.%I', policyname, schemaname, tablename)
			from pg_policies
			where qual ilike '%profiles_admin%' or with_check ilike '%profiles_admin%'
		union all
		select format('FK %s de %s', conname, conrelid::regclass)
			from pg_constraint
			where contype = 'f' and confrelid = to_regclass('access_control.profiles_admin')
	) refs;
	if v_refs is not null then
		raise exception 'PROFILES_ADMIN_STILL_REFERENCED'
			using errcode = '55000',
				detail = v_refs,
				hint = 'access_control.profiles_admin voltou a ser usada; revise antes de arquivar (20260926218000).';
	end if;
end $$;

create schema if not exists legacy_access;
comment on schema legacy_access is
	'Arquivo de tabelas de modelos de acesso aposentados. Fora de pgrst.db_schemas, sem USAGE para anon, authenticated ou service_role: só o dono lê. Cada tabela diz no comentário quando pode ser apagada. Ver 20260926218000.';
revoke all on schema legacy_access from public, anon, authenticated, service_role;

alter table if exists access_control.profiles_admin set schema legacy_access;

do $$
begin
	if to_regtype('public."userLevels"') is not null then
		alter type public."userLevels" set schema legacy_access;
	end if;
end $$;

revoke all on table legacy_access.profiles_admin from public, anon, authenticated, service_role;

comment on table legacy_access.profiles_admin is
	'ARQUIVADA em 2026-09-26 (20260926218000), vinda de access_control. Papéis do modelo anterior ao PBAC (user/admin/superadmin): NÃO concede nada, nenhum app lê. Última escrita em 2026-02-18. DROP (com o enum legacy_access."userLevels") a partir de 2026-12-26.';
comment on type legacy_access."userLevels" is
	'Papéis do modelo anterior ao PBAC; usado só por legacy_access.profiles_admin. Sai junto com ela (a partir de 2026-12-26).';

-- ── 2 ───────────────────────────────────────────────────────────────────────

-- No-op primeiro: se o trigger não puder ser removido abaixo, o cadastro já não cria perfil.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
	-- Não cria mais o perfil do journal: ele nasce no primeiro uso, por
	-- journal.save_user_profile (20260926218000).
	return new;
end;
$$;

comment on function public.handle_new_user() is
	'No-op desde 20260926218000: o perfil do journal deixou de nascer no cadastro do Auth. Só existe enquanto o trigger on_auth_user_created não puder ser removido por quem não é dono de auth.users.';

do $$
begin
	begin
		drop trigger if exists on_auth_user_created on auth.users;
		drop function if exists public.handle_new_user();
	exception
		when insufficient_privilege then
			raise notice 'on_auth_user_created mantido (sem ser dono de auth.users): public.handle_new_user() virou no-op e o cadastro não cria mais perfil. Remova-o como supabase_auth_admin.';
	end;
end $$;

-- ── 3 ───────────────────────────────────────────────────────────────────────

create or replace view journal.editorial_dashboard
with (security_invoker = on)
as
select
	a.id,
	a.submission_number,
	a.title_en,
	a.status,
	a.article_type,
	a.subject_area,
	a.submitted_at,
	extract(day from (now() - a.submitted_at)) as days_since_submission,
	up.full_name as submitter_name,
	(
		select count(*)
		from journal.review_assignments ra
		where ra.article_id = a.id and ra.status = 'completed'
	) as completed_reviews,
	(
		select count(*)
		from journal.review_assignments ra
		where ra.article_id = a.id and ra.status = any (array['invited', 'accepted'])
	) as pending_reviews
from journal.articles a
left join journal.user_profiles up on up.id = a.submitter_id
where a.status <> 'published' and a.deleted_at is null
order by a.submitted_at desc;

comment on view journal.editorial_dashboard is
	'Fila do painel editorial. LEFT JOIN no perfil (20260926218000): submissão de quem ainda não tem perfil aparece com submitter_name nulo.';
