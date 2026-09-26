-- Versão 20260917120001, e não 20260917120000 como nasceu no #348: o #355 criou
-- 20260917120000_inventory_phase0_hardening.sql no mesmo timestamp, e versão duplicada quebra o
-- `supabase db push`/`db reset` (a chave de `supabase_migrations.schema_migrations` é a versão).
-- O histórico remoto já tinha 20260917120000 = inventory_phase0_hardening, então quem mudou de
-- número foi esta. O conteúdo é o mesmo e é idempotente; o efeito já estava em produção.

-- Portal suite (iefa.apps):
--  1) Documentação saiu do Fly (iefa-docs.fly.dev) para docs.iefa.com.br.
--  2) Adiciona os apps publicados depois do último seed: PDF (BentoPDF),
--     Formulários, Programa VETOR 5S e Escolha de Vagas (CPAINT).
-- A Plataforma ACI e o console /alpha ficam de fora de propósito: exigem perfil
-- concedido pela administração do Projeto α e não são navegação pública.
-- Idempotent: safe to re-run.

-- 1) Documentação — domínio novo
update iefa.apps
set href = 'https://docs.iefa.com.br'
where href = 'https://iefa-docs.fly.dev/';

-- 2) PDF — BentoPDF
insert into iefa.apps (title, description, href, to_path, icon_key, external, badges)
select
	'PDF',
	'Ferramentas de PDF no navegador — mesclar, dividir, comprimir, girar, converter e OCR. O arquivo não sai do seu computador.',
	'https://pdf.iefa.com.br',
	null,
	'page',
	false,
	array['Sem upload', 'OCR']::text[]
where not exists (
	select 1 from iefa.apps where href = 'https://pdf.iefa.com.br'
);

-- 3) Formulários
insert into iefa.apps (title, description, href, to_path, icon_key, external, badges)
select
	'Formulários IEFA',
	'Questionários e pesquisas internas — criação, envio e acompanhamento das respostas.',
	'https://forms.iefa.com.br',
	null,
	'clipboard-check',
	false,
	array['Pesquisas', 'Questionários']::text[]
where not exists (
	select 1 from iefa.apps where href = 'https://forms.iefa.com.br'
);

-- 4) Programa VETOR 5S (tenant cinco-s do forms)
insert into iefa.apps (title, description, href, to_path, icon_key, external, badges)
select
	'Programa VETOR 5S',
	'Programa VETOR 5S da SEFA — melhoria contínua: fases de implantação, questionários e acompanhamento.',
	'https://5s.iefa.com.br',
	null,
	'check-circle',
	false,
	array['5S', 'Melhoria contínua']::text[]
where not exists (
	select 1 from iefa.apps where href = 'https://5s.iefa.com.br'
);

-- 5) Escolha de Vagas — CPAINT
insert into iefa.apps (title, description, href, to_path, icon_key, external, badges)
select
	'Escolha de Vagas — CPAINT',
	'Painel de escolha de vagas por ordem de classificação: telão para o público e controlador para a condução da sessão.',
	'https://escolha.iefa.com.br',
	null,
	'group',
	false,
	array['CPAINT', 'Telão']::text[]
where not exists (
	select 1 from iefa.apps where href = 'https://escolha.iefa.com.br'
);
