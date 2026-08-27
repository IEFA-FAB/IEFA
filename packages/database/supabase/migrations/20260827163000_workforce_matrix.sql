-- Matriz de efetivo dos ranchos ("PLANILHA MATRIZ - GESTORES").
--
-- O problema: a SDAB coleta, por planilha, o quantitativo de militares que guarnece cada
-- rancho da FAB, por quadro/especialidade. A planilha responde perguntas que o SISUB hoje
-- não sabe responder — "quais ranchos operam sem nutricionista?", "quantos comensais por
-- militar de cozinha?", "onde a guarnição é majoritariamente temporária?" — e morre a cada
-- rodada de coleta: a competência nova sobrescreve a anterior e a série histórica não existe.
-- Metade das observações da própria planilha diz "houve alteração no efetivo desde o último
-- preenchimento", sem que exista o "último preenchimento" com o qual comparar.
--
-- Três coisas que a planilha expôs e que o modelo precisa acomodar:
--
--   1. GRÃO. A matriz lista 66 RANCHOS; o SISUB modela 30 cozinhas (uma por unidade) e 68
--      refeitórios. Os três grãos não coincidem. A EEAR aparece na matriz como três ranchos
--      (cozinha central, cozinha dos oficiais, GSAU-GW) que no SISUB apontam todos para a
--      mesma `core.kitchen`; o GAP-CO tem rancho Leste e Oeste; HACO e HFAB declaram
--      explicitamente que produzem dentro do hospital e "não guardam qualquer relação" com o
--      GAP. `core.rancho` é esse grão que faltava: o ponto de produção/serviço real.
--
--   2. ELO ≠ UNIDADE. A matriz agrupa por ELO. Quase todo ELO é uma `core.units`, mas HFAB e
--      BABV aparecem como ELO próprio enquanto seus refeitórios vivem sob GAP-DF e BAPV no
--      SISUB. `elo_code` guarda o que o gestor declarou, sem forçar a criação de unidades que
--      não existem e sem esconder a divergência (no caso do BABV, ela é bug de cadastro:
--      BABV é Boa Vista, BAPV é Porto Velho).
--
--   3. TOTAL DECLARADO ≠ SOMA. O rancho HFAG informa 1+0+14+0+1+6 = 22 militares e declara
--      total 20. Guardar `declared_total` ao lado das parcelas é o que permite a tela apontar
--      a divergência em vez de escolher em silêncio qual dos dois números está certo.
--
-- Uma competência é uma linha NOVA de `workforce_survey`, nunca um UPDATE — mesma regra dos
-- documentos legais, e pelo mesmo motivo: reescrever a competência anterior destrói a prova
-- do que foi declarado naquela data.
--
-- Ausência ≠ zero: rancho que não respondeu não tem `workforce_submission`; categoria não
-- preenchida não tem linha em `workforce_headcount`. A instrução da planilha manda escrever
-- 0 quando não há militar do quadro, então o zero explícito é informação e precisa sobreviver
-- distinguível do branco.
--
-- Acesso: RLS ligada SEM policy, mesma postura das tabelas de equipamento e do fluxo de
-- produção. Nenhum cliente toca estas tabelas direto; todo caminho passa por server fn com a
-- service key, e a autorização mora no PBAC (`local-analytics`/`unit` por unidade, `analytics`
-- para a visão de rede).

begin;

-- ── Hierarquia que faltava em core.units ─────────────────────────────────────

alter table core.units
	add column if not exists parent_unit_id bigint references core.units(id);

create index if not exists units_parent_unit_idx
	on core.units (parent_unit_id) where parent_unit_id is not null;

comment on column core.units.parent_unit_id is
	'Unidade superior (ELO → COMAR → FAB). Null = raiz. Sem isso não existe rollup regional: core.units era uma lista plana e toda agregação acima da unidade tinha de ser feita fora do sistema.';

-- ── Taxonomia dos quadros/especialidades ─────────────────────────────────────

create table if not exists core.workforce_category (
	id           uuid primary key default gen_random_uuid(),
	code         text not null,                       -- slug estável citado por seed e import
	name         text not null,                       -- rótulo em pt-BR, como aparece na matriz
	description  text,
	sort_order   integer not null default 100,        -- ordem das colunas na matriz
	is_career    boolean not null default false,      -- quadro de CARREIRA (a matriz só marca assim o QTA)
	is_technical boolean not null default false,      -- formação técnica em nutrição (NUT, TND)
	created_at   timestamptz not null default now(),
	deleted_at   timestamptz
);
create unique index if not exists workforce_category_code_uniq
	on core.workforce_category (code);

comment on table core.workforce_category is
	'Quadro/especialidade contabilizado na matriz de efetivo (NUT QOCON, TND, QTA, QSCON, QCBCON, QSD). Taxonomia global — é por ela que as colunas da matriz falam.';
comment on column core.workforce_category.is_career is
	'Quadro de carreira. A matriz só rotula assim a coluna QTA, e manda contabilizar nela qualquer outro quadro de carreira (QESA, QSS…). É a flag que separa guarnição permanente de temporária no indicador de rotatividade.';

-- ── O rancho: o ponto de produção/serviço que faltava ────────────────────────

create table if not exists core.rancho (
	id                 bigserial primary key,
	unit_id            bigint not null references core.units(id),
	elo_code           text not null,                 -- ELO como declarado na matriz
	code               text not null,                 -- slug estável, chave natural de import
	display_name       text not null,                 -- rótulo como o gestor escreve
	mess_hall_id       bigint references core.mess_halls(id),
	kitchen_id         bigint references core.kitchen(id),
	produces_own_meals boolean not null default true,
	active             boolean not null default true,
	notes              text,
	created_at         timestamptz not null default now(),
	updated_at         timestamptz not null default now()
);
create unique index if not exists rancho_code_uniq on core.rancho (code);
create index if not exists rancho_unit_idx on core.rancho (unit_id) where active;
create index if not exists rancho_elo_idx on core.rancho (elo_code) where active;
create index if not exists rancho_mess_hall_idx on core.rancho (mess_hall_id) where mess_hall_id is not null;

comment on table core.rancho is
	'Ponto de produção/serviço de alimentação — o grão em que a gestão de subsistência realmente fala. Não é core.kitchen (uma por unidade) nem core.mess_halls (refeitório): a EEAR tem três ranchos apontando para a mesma cozinha, e o GAP-CO tem dois.';
comment on column core.rancho.elo_code is
	'ELO como declarado na matriz de gestores. Quase sempre igual ao code da unidade; difere quando o rancho se declara ELO próprio (HFAB, BABV) mas seu refeitório está cadastrado sob outra unidade no SISUB.';
comment on column core.rancho.mess_hall_id is
	'Refeitório servido por este rancho, quando identificado. Null = o rancho existe na matriz mas não tem refeitório correspondente cadastrado — é a ponte para cruzar efetivo com presença (kitchen.meal_presences), e sem ela o indicador de comensais por militar não fecha para aquele rancho.';
comment on column core.rancho.produces_own_meals is
	'Falso = só distribui, recebe pronto de uma cozinha central. A matriz pede a estrutura real justamente porque essa distinção não cabia nas colunas dela.';

-- ── Competência da coleta ────────────────────────────────────────────────────

create table if not exists core.workforce_survey (
	id             uuid primary key default gen_random_uuid(),
	reference_date date not null,                     -- competência (mês de referência)
	title          text not null,
	status         text not null default 'open',
	source         text,                              -- de onde veio (planilha, preenchimento no sistema…)
	opened_at      timestamptz not null default now(),
	closed_at      timestamptz,
	created_by     uuid references auth.users(id),
	created_at     timestamptz not null default now(),
	constraint workforce_survey_status_check check (status in ('draft', 'open', 'closed'))
);
create unique index if not exists workforce_survey_reference_date_uniq
	on core.workforce_survey (reference_date);

comment on table core.workforce_survey is
	'Competência da matriz de efetivo. Competência nova é linha NOVA, nunca UPDATE da anterior — é o que transforma a planilha em série histórica e permite responder "o que mudou desde a última coleta", pergunta que metade das observações da matriz faz sem ter como responder.';

-- ── Resposta de um rancho numa competência ───────────────────────────────────

create table if not exists core.workforce_submission (
	id             uuid primary key default gen_random_uuid(),
	survey_id      uuid not null references core.workforce_survey(id) on delete restrict,
	rancho_id      bigint not null references core.rancho(id) on delete restrict,
	declared_total integer,                           -- total que o gestor escreveu, MESMO divergindo da soma
	submitted_at   timestamptz,
	submitted_by   uuid references auth.users(id),
	created_at     timestamptz not null default now(),
	updated_at     timestamptz not null default now(),
	constraint workforce_submission_declared_total_check check (declared_total is null or declared_total >= 0)
);
create unique index if not exists workforce_submission_uniq
	on core.workforce_submission (survey_id, rancho_id);
create index if not exists workforce_submission_rancho_idx
	on core.workforce_submission (rancho_id);

comment on table core.workforce_submission is
	'Resposta de um rancho numa competência. A ausência da linha é informação: significa que o rancho NÃO respondeu — 38 dos 66 estavam assim na coleta de agosto/2026.';
comment on column core.workforce_submission.declared_total is
	'Total escrito pelo gestor, preservado ainda que divirja da soma das parcelas. O HFAG declarou 20 com parcelas somando 22; guardar os dois é o que deixa a tela apontar a divergência em vez de escolher em silêncio.';

create table if not exists core.workforce_headcount (
	id            uuid primary key default gen_random_uuid(),
	submission_id uuid not null references core.workforce_submission(id) on delete cascade,
	category_id   uuid not null references core.workforce_category(id) on delete restrict,
	headcount     integer not null,
	created_at    timestamptz not null default now(),
	updated_at    timestamptz not null default now(),
	constraint workforce_headcount_nonnegative check (headcount >= 0)
);
create unique index if not exists workforce_headcount_uniq
	on core.workforce_headcount (submission_id, category_id);

comment on table core.workforce_headcount is
	'Quantitativo de um quadro no rancho, na competência. Categoria sem linha = campo em branco; linha com 0 = o gestor afirmou que não há militar daquele quadro. A planilha instrui a escrever zero, então os dois casos precisam continuar distinguíveis.';

-- ── As observações, tipadas ──────────────────────────────────────────────────

create table if not exists core.workforce_note (
	id            uuid primary key default gen_random_uuid(),
	submission_id uuid not null references core.workforce_submission(id) on delete cascade,
	kind          text not null,
	quantity      integer,                            -- militares/civis afetados, quando o gestor informa
	detail        text not null,
	created_at    timestamptz not null default now(),
	constraint workforce_note_kind_check check (kind in ('outsourced', 'leave', 'reassigned', 'shared', 'scope', 'change', 'counting', 'other')),
	constraint workforce_note_quantity_check check (quantity is null or quantity >= 0)
);
create index if not exists workforce_note_submission_idx
	on core.workforce_note (submission_id);

comment on table core.workforce_note is
	'Observação do gestor, tipada. Na planilha isso é uma célula de texto livre onde convivem terceirizados, afastamentos, desvios de função e critério de contagem — tudo ilegível para qualquer agregação. Tipar é o que permite calcular efetivo DISPONÍVEL (nominal − afastado − desviado) em vez de só efetivo nominal.';
comment on column core.workforce_note.kind is
	'outsourced = civil terceirizado suprindo falta de efetivo; leave = afastamento; reassigned = militar contabilizado no rancho mas desviado de função; shared = militar que atua em mais de um rancho; scope = a quem o rancho atende; change = alteração desde a coleta anterior; counting = critério de contagem declarado pelo gestor.';
comment on column core.workforce_note.detail is
	'Texto do gestor, SEM identificação nominal. A matriz original nomeia militares e cita condição de saúde (dado pessoal sensível, art. 5º II da LGPD); a importação despersonaliza — "1 militar QTA em junta médica" preserva o fato gerencial e descarta o identificador.';

-- ── Seed da taxonomia ────────────────────────────────────────────────────────

insert into core.workforce_category (code, name, description, sort_order, is_career, is_technical) values
	('nut_qocon', 'Nutricionista (QOCON)',                    'Nutricionista do Quadro de Oficiais Convocados.',                                                  10, false, true),
	('tnd_qscon', 'Técnico em Nutrição e Dietética (QSCON)',  'Técnico em Nutrição e Dietética.',                                                                 20, false, true),
	('qta',       'QTA e demais quadros de carreira',         'Especialidade QTA e qualquer outro quadro de carreira (QESA, QSS…), conforme instrução da matriz.', 30, true,  false),
	('qscon',     'QSCON',                                    'Quadro de Sargentos Convocados, exceto os técnicos em nutrição, contados à parte.',                 40, false, false),
	('qcbcon',    'QCBCON',                                   'Quadro de Cabos Convocados.',                                                                      50, false, false),
	('qsd',       'QSD',                                      'Quadro de Soldados, incluídos os Cabos oriundos de Soldado (QCB), conforme instrução da matriz.',   60, false, false)
on conflict (code) do nothing;

-- ── Trancamento ──────────────────────────────────────────────────────────────

alter table core.workforce_category   enable row level security;
alter table core.rancho               enable row level security;
alter table core.workforce_survey     enable row level security;
alter table core.workforce_submission enable row level security;
alter table core.workforce_headcount  enable row level security;
alter table core.workforce_note       enable row level security;

commit;
