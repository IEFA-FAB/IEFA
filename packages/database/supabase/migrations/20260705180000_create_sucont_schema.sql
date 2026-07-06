-- create_sucont_schema
-- App: sucont — HUB SUCONT-4 (Divisão de Acompanhamento Patrimonial / DIREF-COMAER).
-- Unifica várias ferramentas antes isoladas (Google AI Studio) num único app
-- TanStack Start. Este schema persiste o que antes vivia só em localStorage/memória:
--   • Dados de referência das Unidades Gestoras (código → nome → operador da seção),
--     hoje duplicados em ~7 arquivos hardcoded — consolidados aqui.
--   • Área de trabalho da seção (checklist mensal, avisos, nota livre) — antes por-browser.
--   • Relatórios salvos (links) — antes localStorage.
--   • Documentos gerados por IA (ofícios/relatórios) — antes transientes.
--   • Trilha de análises e mensagens SIAFI geradas (numeração compartilhada por sequência).
--
-- Autorização: PBAC via access_control.user_permissions, módulo 'sucont'
--   (level 1 = acesso; 2 = edição da seção; 3 = admin de grants). O gate é aplicado
--   nas server functions (service role); RLS permite leitura a autenticados.

create schema if not exists sucont;
grant usage on schema sucont to anon, authenticated, service_role;

-- ── Helper: trigger updated_at ────────────────────────────────────────────────
create or replace function sucont.set_updated_at()
returns trigger
language plpgsql
as $$
begin
	new.updated_at = now();
	return new;
end;
$$;

-- ── Referência: Unidades Gestoras ─────────────────────────────────────────────
-- Fonte única de verdade do mapeamento UG → nome reduzido → operador responsável
-- da SUCONT-4. Consolida `unitResponsibilities` (lib/data.ts) e as várias cópias
-- de UG_INFO/CONFERENTES espalhadas pelos analisadores.
create table sucont.unidade_gestora (
	codigo text primary key,
	nome text not null,
	operador text,
	ods text,
	orgao_superior text,
	is_setorial boolean not null default false,
	is_stn boolean not null default false,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
create trigger unidade_gestora_updated_at before update on sucont.unidade_gestora
	for each row execute function sucont.set_updated_at();

-- ── Área de trabalho: checklist mensal da seção ───────────────────────────────
create table sucont.checklist_item (
	id uuid primary key default gen_random_uuid(),
	task text not null,
	deadline text,
	description text,
	responsible text,
	path text,
	done boolean not null default false,
	sort_order integer not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
create trigger checklist_item_updated_at before update on sucont.checklist_item
	for each row execute function sucont.set_updated_at();

-- ── Área de trabalho: avisos ──────────────────────────────────────────────────
create table sucont.notice (
	id uuid primary key default gen_random_uuid(),
	content text not null,
	date text,
	type text not null default 'info' check (type in ('info', 'alert')),
	created_at timestamptz not null default now()
);

-- ── Área de trabalho: nota livre (singleton) ──────────────────────────────────
create table sucont.workspace_note (
	id integer primary key default 1 check (id = 1),
	content text not null default '',
	updated_by uuid,
	updated_at timestamptz not null default now()
);
create trigger workspace_note_updated_at before update on sucont.workspace_note
	for each row execute function sucont.set_updated_at();
insert into sucont.workspace_note (id, content) values (1, '') on conflict (id) do nothing;

-- ── Relatórios salvos (links) ─────────────────────────────────────────────────
create table sucont.report (
	id uuid primary key default gen_random_uuid(),
	title text not null,
	url text not null,
	description text,
	icon text,
	category text,
	created_by uuid,
	created_at timestamptz not null default now()
);

-- ── Documentos gerados por IA (Plataforma de Documentação) ────────────────────
create table sucont.document (
	id uuid primary key default gen_random_uuid(),
	type text not null check (type in ('FAB_OFFICE', 'DATA_ANALYSIS')),
	title text,
	draft text not null,
	generated jsonb,
	created_by uuid,
	created_at timestamptz not null default now()
);
create index document_created_at_idx on sucont.document (created_at desc);

-- ── Trilha de análises (uploads processados pelos analisadores) ───────────────
create table sucont.analysis_run (
	id uuid primary key default gen_random_uuid(),
	tool text not null,
	period text,
	filename text,
	records_count integer,
	summary jsonb,
	created_by uuid,
	created_at timestamptz not null default now()
);
create index analysis_run_tool_idx on sucont.analysis_run (tool, created_at desc);

-- ── Mensagens SIAFI geradas (numeração sequencial compartilhada) ──────────────
-- A numeração das mensagens institucionais precisa ser contínua e compartilhada
-- entre operadores — antes era um contador em memória por sessão. Sequência real.
create sequence sucont.message_number_seq;
create table sucont.generated_message (
	id uuid primary key default gen_random_uuid(),
	number bigint not null default nextval('sucont.message_number_seq'),
	tool text not null,
	ug_codigo text,
	tipo text,
	corpo text not null,
	analysis_run_id uuid references sucont.analysis_run (id) on delete set null,
	created_by uuid,
	created_at timestamptz not null default now()
);
create index generated_message_tool_idx on sucont.generated_message (tool, created_at desc);

-- ── RLS: leitura a autenticados; escrita só service_role (via server functions) ──
alter table sucont.unidade_gestora enable row level security;
alter table sucont.checklist_item  enable row level security;
alter table sucont.notice          enable row level security;
alter table sucont.workspace_note  enable row level security;
alter table sucont.report          enable row level security;
alter table sucont.document        enable row level security;
alter table sucont.analysis_run    enable row level security;
alter table sucont.generated_message enable row level security;

create policy "auth read unidade_gestora"   on sucont.unidade_gestora   for select to authenticated using (true);
create policy "auth read checklist_item"     on sucont.checklist_item     for select to authenticated using (true);
create policy "auth read notice"             on sucont.notice             for select to authenticated using (true);
create policy "auth read workspace_note"     on sucont.workspace_note     for select to authenticated using (true);
create policy "auth read report"             on sucont.report             for select to authenticated using (true);
create policy "auth read document"           on sucont.document           for select to authenticated using (true);
create policy "auth read analysis_run"       on sucont.analysis_run       for select to authenticated using (true);
create policy "auth read generated_message"  on sucont.generated_message  for select to authenticated using (true);

-- ── Grants (gate a nível de tabela; RLS a nível de linha; PBAC nas server fns) ──
grant select on all tables in schema sucont to authenticated;
grant all    on all tables in schema sucont to service_role;
grant usage, select on all sequences in schema sucont to service_role;
alter default privileges in schema sucont grant select on tables to authenticated;
alter default privileges in schema sucont grant all    on tables to service_role;
alter default privileges in schema sucont grant usage, select on sequences to service_role;

-- ── Seed: Unidades Gestoras (de unitResponsibilities) ─────────────────────────
insert into sucont.unidade_gestora (codigo, nome, operador) values
	('120005', 'PABR', '3S VANESSA'), ('120007', 'PARF', '3S VANESSA'), ('120013', 'CLA', '3S VANESSA'),
	('120014', 'BAFZ', '3S VANESSA'), ('120019', 'HARF', '3S VANESSA'), ('120029', 'BAAF', '3S VANESSA'),
	('120030', 'BAGL', '3S VANESSA'), ('120049', 'PAMA GL', '3S VANESSA'), ('120062', 'BASP', '3S VANESSA'),
	('120065', 'FAYS', '3S VANESSA'), ('120069', 'CRCEA-SE', '3S VANESSA'), ('120071', 'CELOG', '3S VANESSA'),
	('120075', 'BACO', '3S VANESSA'), ('120077', 'HACO', '3S VANESSA'), ('120087', 'BABE', '3S VANESSA'),
	('120091', 'CABE', '3S VANESSA'), ('120094', 'CINDACTA IV', '3S VANESSA'), ('120096', 'HFAB', '3S VANESSA'),
	('120108', 'COPAC', '3S VANESSA'), ('120195', 'CAE', '3S VANESSA'), ('120260', 'SERINFRA BR', '3S VANESSA'),
	('120623', 'GAP AF', '3S VANESSA'), ('120624', 'BAAN', '3S VANESSA'), ('120630', 'GAP MN', '3S VANESSA'),
	('120636', 'GAP LS', '3S VANESSA'), ('120637', 'BABV', '3S VANESSA'), ('120641', 'BAPV', '3S VANESSA'),
	('120645', 'GAP GL', '3S VANESSA'),
	('120001', 'GABAER', 'SGT KLEBSON'), ('120006', 'GAP BR', 'SGT KLEBSON'), ('120008', 'CINDACTA I', 'SGT KLEBSON'),
	('120015', 'CLBI', 'SGT KLEBSON'), ('120039', 'GAP RJ', 'SGT KLEBSON'), ('120040', 'HCA', 'SGT KLEBSON'),
	('120045', 'PAGL', 'SGT KLEBSON'), ('120047', 'PAMB RJ', 'SGT KLEBSON'), ('120048', 'PAME RJ', 'SGT KLEBSON'),
	('120066', 'HFASP', 'SGT KLEBSON'), ('120068', 'PAMA SP', 'SGT KLEBSON'), ('120072', 'CINDACTA II', 'SGT KLEBSON'),
	('120073', 'BAFL', 'SGT KLEBSON'), ('120082', 'BAMN', 'SGT KLEBSON'), ('120154', 'HAMN', 'SGT KLEBSON'),
	('120225', 'SERINFRA SJ', 'SGT KLEBSON'), ('120255', 'SERINFRA BE', 'SGT KLEBSON'), ('120259', 'SERINFRA CO', 'SGT KLEBSON'),
	('120261', 'SERINFRA MN', 'SGT KLEBSON'), ('120512', 'PASJ', 'SGT KLEBSON'), ('120628', 'GAP BE', 'SGT KLEBSON'),
	('120631', 'BANT', 'SGT KLEBSON'), ('120638', 'BACG', 'SGT KLEBSON'), ('120643', 'BASM', 'SGT KLEBSON'),
	('120004', 'BABR', '3S TALITA'), ('120016', 'GAP SJ', '3S TALITA'), ('120021', 'CINDACTA III', '3S TALITA'),
	('120023', 'BASV', '3S TALITA'), ('120025', 'EPCAR', '3S TALITA'), ('120026', 'PAMA LS', '3S TALITA'),
	('120041', 'HAAF', '3S TALITA'), ('120042', 'HFAG', '3S TALITA'), ('120053', 'PAAF', '3S TALITA'),
	('120060', 'AFA', '3S TALITA'), ('120061', 'BAST', '3S TALITA'), ('120064', 'EEAR', '3S TALITA'),
	('120088', 'COMARA', '3S TALITA'), ('120089', 'HABE', '3S TALITA'), ('120090', 'CABW', '3S TALITA'),
	('120097', 'PASP', '3S TALITA'), ('120099', 'DIRINFRA', '3S TALITA'), ('120100', 'SDAB', '3S TALITA'),
	('120127', 'CISCEA', '3S TALITA'), ('120152', 'CPBV', '3S TALITA'), ('120257', 'SERINFRA RJ', '3S TALITA'),
	('120265', 'SERINFRA NT', '3S TALITA'), ('120625', 'GAP DF', '3S TALITA'), ('120629', 'GAP CO', '3S TALITA'),
	('120632', 'GAP RF', '3S TALITA'), ('120633', 'GAP SP', '3S TALITA'), ('120669', 'BASC', '3S TALITA')
on conflict (codigo) do nothing;

-- ── Seed: checklist mensal (de initialChecklist) ──────────────────────────────
insert into sucont.checklist_item (task, deadline, description, responsible, path, sort_order) values
	('Verificação de Carga de XML de Depreciação', '2º dia útil do mês',
	 'Confirmar se cada UG realizou a carga do arquivo XML de depreciação e baixa de bens. Cobrar as UGs que não cumpriram o prazo.',
	 'Cada Responsável', 'Tesouro Gerencial: Sucont-4.1 > Monitoramento das UG > Acomp. registro da depreciação e amortização mensal por UG', 1),
	('Relatório Depreciação > Bem', '4° dia útil do mês',
	 'Comparar o saldo de depreciação acumulada com o saldo do bem no SIAFI. Identificar e reportar UGs com saldo de depreciação superior ao valor contábil do bem.',
	 'Cada Responsável', 'Tesouro Gerencial: Sucont-4.1 > Monitoramento das UG > CONSOLIDADA - COMP BENS MÓVEIS E DEP ACUM', 2),
	('Prestação de Contas', '4° dia útil do mês', 'Acompanhamento do fechamento SIAFI.', 'Vanessa', null, 3),
	('Relatório Restrição Contábil', '4° dia útil do mês', 'Pós fechamento SIAFI e Relatório de Depreciação.', 'Klebson', null, 4),
	('Conciliação Mensal de Contas de Trânsito', 'Mensal',
	 'Verificar discrepâncias entre Conta de trânsito (1.2.3.1.1.99.05) e Conta de controle (899920202).',
	 'Cada Responsável', 'Tesouro Gerencial: Sucont-4 > Relatórios para Consultas por UG EXEC Parciais > Auditor de documento - compatibilidade controle x transito de BMP', 5),
	('Acompanhamento Pós-Prestação de Contas', '1x por semana',
	 'Priorizar análise das UGs com maiores diferenças contábeis e solicitar ajustes formais.', 'Cada Responsável', null, 6),
	('Monitoramento de Contas Conciliadas (TCU)', '1x por semana',
	 'Verificar mensalmente as contas 1.2.3.1.1.01.15, 1.2.3.1.1.02.01, 1.2.3.1.1.05.03, 1.2.3.1.1.05.05, 1.2.3.1.1.05.06.',
	 'SGT KLEBSON, 3S VANESSA, SGT IARA', null, 7);

-- ── Seed: avisos (de initialNotices) ──────────────────────────────────────────
insert into sucont.notice (content, date, type) values
	('Reunião de alinhamento mensal agendada para o 1º dia útil.', '01/03/2026', 'info'),
	('Lembrete: Prazo final para carga de XML de depreciação se aproxima.', '02/03/2026', 'alert');

-- ── Seed: relatórios (de reportTools) ─────────────────────────────────────────
insert into sucont.report (title, url, description, icon, category) values
	('Saldos Patrimoniais SILOMS', 'http://siloms.servicos.ccarj.intraer/siloms-prestacao/faces/patSaldosComaerExec.xhtml',
	 'Consulta de saldos executivos no SILOMS.', 'Database', 'Relatórios'),
	('Saldos Patrimoniais SIAFI', 'https://tesourogerencial.tesouro.gov.br/tg/servlet/mstrWeb',
	 'Consulta de saldos no Tesouro Gerencial/SIAFI.', 'FileBarChart', 'Relatórios');

-- ── Expor schema no PostgREST (append à lista existente) ───────────────────────
alter role authenticator set pgrst.db_schemas to 'public, graphql_public, sisub, iefa, journal, forms, rumaer, core, access_control, kitchen, procurement, finance, compras_gov_integration, inventory, siafi_integration, gs1_integration, nutrition_reference, assignment_selection, sucont';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
