-- Efetivo por refeitório: `kitchen.rancho` → `kitchen.mess_hall_workforce` — fase EXPAND.
--
-- Lote 8b da linguagem ubíqua do sisub (`openspec/changes/sisub-ubiquitous-language`, D1 critério 6,
-- D4, D10 e D10.1; decisão 0.4 de 2026-09-27). "Rancho" é ambíguo: conforme a frase, é o
-- refeitório, a cozinha ou a unidade com a sua subsistência. A linha do roster da matriz de
-- efetivo da SDAB ("PLANILHA MATRIZ - GESTORES", 20260827163000) é o REFEITÓRIO visto pelo
-- levantamento de efetivo: 62 das 66 apontam para um refeitório distinto, com a cozinha e a
-- unidade iguais às dele. O mantenedor escolheu o rename, sem mudar o modelo; a fusão em
-- `kitchen.mess_halls` fica para a change `sisub-workforce-by-mess-hall`, que depende do cadastro
-- dos 4 refeitórios que faltam e da decisão sobre o ponto da cozinha dos oficiais da EEAR.
--
--   tabela                                   → tabela
--   kitchen.rancho                           → kitchen.mess_hall_workforce (sequência, PK, FKs e índices junto)
--
--   coluna (tabela fica com o nome)          → coluna
--   kitchen.workforce_submission.rancho_id   → mess_hall_workforce_id (FK, índice e unique próprios)
--
--   views de compatibilidade da promoção do núcleo (20260901120400), sem leitor no código:
--   core.rancho, core.workforce_submission   → ficam até o contract, que as derruba
--
-- ## Por que expand/contract
--
-- O banco é compartilhado e a `main` roda contra ele o tempo todo; a suíte dela tem de continuar
-- verde enquanto o código novo não sobe. Esta migration só ACRESCENTA caminhos (técnica de
-- 20260927060000 e 20260927080000):
--
--   * Tabela renomeada: o nome antigo vira view `security_invoker` de uma tabela só, com as mesmas
--     colunas e defaults. É auto-updatable: o `insert … on conflict (code) do nothing` e o `update`
--     do código da `main` (Drizzle, que manda `default` nas colunas omitidas) passam direto para a
--     tabela. Constraint, índice e sequência: rename direto; o default de `id` segue a sequência
--     pelo OID.
--   * Coluna renomeada em tabela que fica: coluna nova ao lado, backfill, FK, índice e unique
--     próprios, e um trigger BEFORE INSERT OR UPDATE que espelha os dois sentidos e recusa valores
--     divergentes. A ANTIGA fica anulável (o trigger a preenche), para o código novo não precisar
--     citá-la, e mantém a FK, o índice e o unique `(survey_id, rancho_id)` até o contract: o
--     `on conflict (survey_id, rancho_id)` da `main` precisa desse unique como árbitro. A NOVA
--     nasce NOT NULL, conferido depois do trigger.
--     Custo aceito: com dois uniques equivalentes, cada `on conflict` só tem um como árbitro, e
--     dois saves SIMULTÂNEOS da mesma resposta (mesma competência e refeitório) podem terminar em
--     `duplicate key` no outro em vez de `do update`. A tela mostra "Falha ao registrar a resposta"
--     e salvar de novo resolve; a janela dura até o contract.
--   * Nenhuma função, policy, publicação ou job do pg_cron cita os nomes antigos (conferido em
--     `pg_proc`, `pg_policies`, `pg_publication_tables` e `cron.job` em 2026-09-27); os únicos
--     objetos que leem a tabela e a coluna são as duas views do núcleo, que seguem pelo OID. O bloco
--     0 confere tudo de novo na hora de aplicar.
--   * Os grants são por tabela (sem grant de coluna): só `service_role` alcança a tabela, e a view
--     recebe os mesmos.
--
-- Os comentários do banco perdem "rancho" (D10): o do roster, os das colunas, os do efetivo, o do
-- material cautelado do lanche (é o material da COZINHA, lote 8a) e o do schema `kitchen`. Texto
-- livre de usuário (`workforce_note.detail`, `kitchen.opinions`) e o nome de cadastro
-- (`display_name` "EEAR (cozinha central)") ficam (D3).
--
-- O CONTRACT (20260927160000) confere que as colunas não divergem, derruba a view, o espelho, a
-- coluna antiga e as duas views do núcleo, e só pode ser aplicado depois do deploy do código que
-- usa só os nomes novos.

-- ─── 0. Conferência: nada além das views do núcleo cita os nomes antigos ────────────
--
-- plpgsql e SQL resolvem tabela pelo nome, não pelo OID, e não criam dependência de coluna: uma
-- função esquecida passaria pela view de compatibilidade (que não dispara os triggers da tabela) e
-- quebraria no contract, em produção.

do $$
declare
	-- Qualquer "rancho" (caixa ignorada pelo `~*`), menos o nome da função "Fiscal de rancho": ele
	-- pode estar em texto de mensagem e não resolve tabela nenhuma.
	old_names constant text := '(?<![Ff]iscal de )(?<![Ff]iscais de )\m(rancho\w*)\M';
	offenders text;
begin
	select string_agg(p.oid::regprocedure::text, ', ') into offenders
	from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname not in ('pg_catalog', 'information_schema')
		and (
			coalesce(p.prosrc, '') ~* old_names
			or coalesce(pg_get_function_sqlbody(p.oid), '') ~* old_names
		);
	if offenders is not null then
		raise exception 'funções citam os nomes antigos do lote 8b e precisam ser recriadas neste expand: %', offenders;
	end if;

	select string_agg(schemaname || '.' || viewname, ', ') into offenders
	from (
		select schemaname, viewname, definition from pg_views
		union all
		select schemaname, matviewname, definition from pg_matviews
	) v
	where definition ~* old_names
		and (schemaname, viewname) not in (('core', 'rancho'), ('core', 'workforce_submission'));
	if offenders is not null then
		raise exception 'views citam os nomes antigos do lote 8b: %', offenders;
	end if;

	select string_agg(schemaname || '.' || tablename || '.' || policyname, ', ') into offenders
	from pg_policies
	where coalesce(qual, '') || ' ' || coalesce(with_check, '') ~* old_names;
	if offenders is not null then
		raise exception 'policies citam os nomes antigos do lote 8b: %', offenders;
	end if;

	select string_agg(pubname, ', ') into offenders
	from pg_publication_tables
	where schemaname = 'kitchen' and tablename in ('rancho', 'workforce_submission');
	if offenders is not null then
		raise exception 'publicações incluem tabelas do lote 8b: %', offenders;
	end if;

	-- Job do pg_cron também resolve tabela pelo nome, e em texto livre.
	if to_regclass('cron.job') is not null then
		execute 'select string_agg(jobname, '', '') from cron.job where command ~* $1' into offenders using old_names;
		if offenders is not null then
			raise exception 'jobs do pg_cron citam os nomes antigos do lote 8b: %', offenders;
		end if;
	end if;
end;
$$;

-- ─── 1. Tabela, sequência, constraints e índices (só nome) ──────────────────────────

alter table kitchen.rancho rename to mess_hall_workforce;
alter sequence kitchen.rancho_id_seq rename to mess_hall_workforce_id_seq;

alter table kitchen.mess_hall_workforce rename constraint rancho_pkey to mess_hall_workforce_pkey;
alter table kitchen.mess_hall_workforce rename constraint rancho_unit_id_fkey to mess_hall_workforce_unit_id_fkey;
alter table kitchen.mess_hall_workforce rename constraint rancho_kitchen_id_fkey to mess_hall_workforce_kitchen_id_fkey;
alter table kitchen.mess_hall_workforce rename constraint rancho_mess_hall_id_fkey to mess_hall_workforce_mess_hall_id_fkey;

alter index kitchen.rancho_code_uniq rename to mess_hall_workforce_code_uniq;
alter index kitchen.rancho_elo_idx rename to mess_hall_workforce_elo_idx;
alter index kitchen.rancho_kitchen_id_fk_idx rename to mess_hall_workforce_kitchen_id_fk_idx;
alter index kitchen.rancho_mess_hall_idx rename to mess_hall_workforce_mess_hall_idx;
alter index kitchen.rancho_unit_id_fk_idx rename to mess_hall_workforce_unit_id_fk_idx;
alter index kitchen.rancho_unit_idx rename to mess_hall_workforce_unit_idx;

-- ─── 2. kitchen.workforce_submission: a coluna nova e o espelho ──────────────────────

alter table kitchen.workforce_submission add column mess_hall_workforce_id bigint;
update kitchen.workforce_submission set mess_hall_workforce_id = rancho_id;
alter table kitchen.workforce_submission alter column mess_hall_workforce_id set not null;
alter table kitchen.workforce_submission
	add constraint workforce_submission_mess_hall_workforce_id_fkey
	foreign key (mess_hall_workforce_id) references kitchen.mess_hall_workforce (id) on delete restrict;
create index workforce_submission_mess_hall_workforce_idx on kitchen.workforce_submission using btree (mess_hall_workforce_id);
create unique index workforce_submission_mess_hall_workforce_uniq on kitchen.workforce_submission using btree (survey_id, mess_hall_workforce_id);

-- A antiga deixa de ser obrigatória: o trigger a preenche, e o código novo não a cita.
alter table kitchen.workforce_submission alter column rancho_id drop not null;

-- INSERT: aceita qualquer uma das duas e recusa as duas divergentes. UPDATE: vale a que mudou; as
-- duas mudadas para valores diferentes são recusadas. No fim a antiga sempre copia a nova. Nenhuma
-- das duas no INSERT deixa a nova NULL, e o NOT NULL dela recusa a linha, como a antiga recusava.
create function kitchen.mirror_workforce_submission_mess_hall_workforce()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if tg_op = 'INSERT' then
		if new.mess_hall_workforce_id is not null and new.rancho_id is not null and new.mess_hall_workforce_id <> new.rancho_id then
			raise exception using
				errcode = '23514',
				message = format(
					'kitchen.workforce_submission: rancho_id e mess_hall_workforce_id divergem (%s ≠ %s)',
					new.rancho_id,
					new.mess_hall_workforce_id
				);
		end if;
		new.mess_hall_workforce_id := coalesce(new.mess_hall_workforce_id, new.rancho_id);
	elsif new.mess_hall_workforce_id is distinct from old.mess_hall_workforce_id then
		if new.rancho_id is distinct from old.rancho_id and new.rancho_id is distinct from new.mess_hall_workforce_id then
			raise exception using
				errcode = '23514',
				message = format(
					'kitchen.workforce_submission: rancho_id e mess_hall_workforce_id divergem (%s ≠ %s)',
					new.rancho_id,
					new.mess_hall_workforce_id
				);
		end if;
	elsif new.rancho_id is distinct from old.rancho_id then
		new.mess_hall_workforce_id := new.rancho_id;
	end if;
	new.rancho_id := new.mess_hall_workforce_id;
	return new;
end;
$$;

-- `update of` as duas: o `on conflict … do update` da resposta (total declarado, data, autor) não
-- cita nenhuma delas e não tem o que espelhar.
create trigger workforce_submission_mirror_mess_hall_workforce
before insert or update of rancho_id, mess_hall_workforce_id on kitchen.workforce_submission
for each row execute function kitchen.mirror_workforce_submission_mess_hall_workforce();

comment on function kitchen.mirror_workforce_submission_mess_hall_workforce() is
	'Expand de 20260927150000: mantém a coluna antiga igual a mess_hall_workforce_id enquanto o código antigo a escreve. Removida em 20260927160000.';

-- ─── 3. View de compatibilidade com o nome antigo ─────────────────────────────────
--
-- Mesma ordem de colunas da tabela. Os defaults são repetidos na view: o Drizzle da `main` manda
-- `default` nas colunas que não informa, e na view isso vira NULL sem eles.

create view kitchen.rancho
with (security_invoker = true) as
select
	id,
	unit_id,
	elo_code,
	code,
	display_name,
	mess_hall_id,
	kitchen_id,
	produces_own_meals,
	active,
	notes,
	created_at,
	updated_at
from kitchen.mess_hall_workforce;

alter view kitchen.rancho alter column id set default nextval('kitchen.mess_hall_workforce_id_seq'::regclass);
alter view kitchen.rancho alter column produces_own_meals set default true;
alter view kitchen.rancho alter column active set default true;
alter view kitchen.rancho alter column created_at set default now();
alter view kitchen.rancho alter column updated_at set default now();

-- Mesmos grants da tabela: só o servidor (service_role). `authenticated` tem USAGE em `kitchen`
-- (Realtime do sisub), então a revogação é explícita.
revoke all on kitchen.rancho from public, anon, authenticated;
grant all on kitchen.rancho to service_role;

comment on view kitchen.rancho is
	'Compatibilidade do rename 20260927150000 (→ kitchen.mess_hall_workforce) para o código antigo em produção. Removida em 20260927160000.';

-- ─── 4. Comentários ──────────────────────────────────────────────────────────────

comment on table kitchen.mess_hall_workforce is
	'Refeitório no levantamento de efetivo da subsistência (matriz de gestores da SDAB): o ponto que responde pelo efetivo, com o ELO declarado e o vínculo ao refeitório cadastrado. Quase sempre 1:1 com kitchen.mess_halls; a fusão das duas é a change sisub-workforce-by-mess-hall.';
comment on column kitchen.mess_hall_workforce.elo_code is
	'ELO como declarado na matriz de gestores. Quase sempre igual ao code da unidade; difere quando o refeitório se declara ELO próprio (HFAB, BABV) mas está cadastrado sob outra unidade no SISUB.';
comment on column kitchen.mess_hall_workforce.mess_hall_id is
	'Refeitório cadastrado (kitchen.mess_halls) que corresponde a esta linha, quando identificado. Null = o refeitório está na matriz mas não no cadastro — é a ponte para cruzar efetivo com presença (kitchen.meal_presences), e sem ela o indicador de refeições por militar não fecha para ele.';

comment on table kitchen.workforce_submission is
	'Resposta de um refeitório do levantamento numa competência. A ausência da linha é informação: significa que o refeitório NÃO respondeu — 38 dos 66 estavam assim na coleta de agosto/2026.';
comment on column kitchen.workforce_submission.mess_hall_workforce_id is 'Refeitório do levantamento (kitchen.mess_hall_workforce) que respondeu.';
comment on column kitchen.workforce_submission.rancho_id is 'Obsoleta: espelho de mess_hall_workforce_id até o contract 20260927160000.';

comment on table kitchen.workforce_headcount is
	'Quantitativo de um quadro no refeitório, na competência. Categoria sem linha = campo em branco; linha com 0 = o gestor afirmou que não há militar daquele quadro. A planilha instrui a escrever zero, então os dois casos precisam continuar distinguíveis.';
comment on column kitchen.workforce_note.kind is
	'outsourced = civil terceirizado suprindo falta de efetivo; leave = afastamento; reassigned = militar contabilizado no refeitório mas desviado de função; shared = militar que atua em mais de um refeitório; scope = a quem o refeitório atende; change = alteração desde a coleta anterior; counting = critério de contagem declarado pelo gestor.';

comment on table kitchen.snack_request_material is
	'Cautela do material da cozinha entregue com o lanche (7.4.19): garrafas e caixas térmicas voltam à cozinha no fim da missão.';

comment on schema kitchen is
	'Domínio de subsistência — a linha de produção de alimentação. Rendimento, fator de correção, nutrientes, ficha técnica, cozinha, refeitório e o efetivo por refeitório. Não é catálogo genérico: catálogo genérico é core.item.';

comment on view core.rancho is
	'Compatibilidade da promoção do núcleo (20260901120400), sem leitor no código; a tabela é kitchen.mess_hall_workforce. Removida em 20260927160000.';
comment on view core.workforce_submission is
	'Compatibilidade da promoção do núcleo (20260901120400), sem leitor no código; a tabela é kitchen.workforce_submission. Removida em 20260927160000.';

-- ─── 5. Conferência do que este expand criou ──────────────────────────────────────

do $$
declare
	offenders text;
begin
	-- A função nova fixa `search_path` vazio.
	select string_agg(p.oid::regprocedure::text, ', ') into offenders
	from pg_proc p
	where p.oid = 'kitchen.mirror_workforce_submission_mess_hall_workforce()'::regprocedure
		and not coalesce(p.proconfig, '{}') @> array['search_path=""'];
	if offenders is not null then
		raise exception 'função do lote 8b sem search_path vazio: %', offenders;
	end if;

	-- O backfill cobriu todas as linhas e o espelho começa sem divergência.
	if exists (select 1 from kitchen.workforce_submission where mess_hall_workforce_id is distinct from rancho_id) then
		raise exception 'kitchen.workforce_submission: rancho_id e mess_hall_workforce_id divergem depois do backfill';
	end if;

	-- A view de compatibilidade não é alcançável pelo cliente.
	if has_table_privilege('anon', 'kitchen.rancho', 'select')
		or has_table_privilege('authenticated', 'kitchen.rancho', 'select') then
		raise exception 'kitchen.rancho (compatibilidade) ficou legível por anon/authenticated';
	end if;
end;
$$;
