-- Carga da matriz de gestores de agosto/2026 (66 ranchos, 32 respondidos).
--
-- Gerado a partir de "PLANILHA MATRIZ - GESTORES.xlsx (coleta SDAB)". A planilha em si não entra no repositório: ela
-- nomeia militares e cita condição de saúde, dado pessoal sensível que não tem por que
-- circular versionado. As observações abaixo já vêm despersonalizadas.
--
-- Idempotente: roda de novo sem duplicar. O rancho casa por 'code', a competência por
-- 'reference_date' e a resposta por (survey, rancho).
--
-- Ranchos sem mess_hall correspondente ficam com mess_hall_id null de propósito — quatro
-- deles (EEAR cozinha dos oficiais, NuHANT, II COMAR, ICIA) não têm refeitório cadastrado.
-- Inventar o vínculo faria o indicador de comensais por militar mentir para esses ranchos.

begin;

-- ── Roster dos ranchos ───────────────────────────────────────────────────────

insert into core.rancho (unit_id, elo_code, code, display_name, mess_hall_id, kitchen_id)
select u.id, v.elo_code, v.code, v.display_name, m.id, m.kitchen_id
from (values
	('GAP-RJ', 'GAP-RJ', 'hca', 'HCA', 'HCA'),
	('GAP-RJ', 'GAP-RJ', 'gap-sede', 'GAP SEDE', 'GAP SEDE'),
	('GAP-RJ', 'GAP-RJ', 'garagem', 'GARAGEM', 'GARAGEM'),
	('GAP-RJ', 'GAP-RJ', 'pame', 'PAME', 'PAME'),
	('GAP-GL', 'GAP-GL', 'gap-bagl', 'GAP (BAGL)', 'GAP-GL'),
	('GAP-GL', 'GAP-GL', 'cgabeg', 'CGABEG', 'CGABEG'),
	('GAP-GL', 'GAP-GL', 'hfag', 'HFAG', 'HFAG'),
	('GAP-GL', 'GAP-GL', 'cemal', 'CEMAL', 'CEMAL'),
	('GAP-GL', 'GAP-GL', 'pamb', 'PAMB', 'PAMB'),
	('DIRAD', 'DIRAD', 'dirad', 'DIRAD', 'DIRAD'),
	('GAP-AF', 'GAP-AF', 'baaf-gap-af', 'BAAF (GAP-AF)', 'BAAF'),
	('GAP-AF', 'GAP-AF', 'cpa-af', 'CPA- AF', 'CPA-AF'),
	('GAP-AF', 'GAP-AF', 'haaf', 'HAAF', 'HAAF'),
	('GAP-AF', 'GAP-AF', 'unifa', 'UNIFA', 'UNIFA'),
	('BASC', 'BASC', 'basc', 'BASC', 'BASC'),
	('GAP-SP', 'GAP-SP', 'basp', 'BASP', 'BASP'),
	('GAP-SP', 'GAP-SP', 'pama-sp', 'PAMA-SP', 'PAMA-SP'),
	('GAP-SP', 'GAP-SP', 'gap-sp', 'GAP-SP', 'GAP-SP'),
	('GAP-SP', 'GAP-SP', 'hfasp', 'HFASP', 'HFASP'),
	('GAP-SP', 'GAP-SP', 'bast', 'BAST', 'BAST'),
	('GAP-SP', 'GAP-SP', 'comgap', 'COMGAP', 'COMGAP'),
	('AFA', 'AFA', 'fays', 'FAYS', 'FAYS'),
	('AFA', 'AFA', 'afa', 'AFA', 'AFA'),
	('EEAR', 'EEAR', 'gsau-gw-hospital', 'GSAU-GW HOSPITAL', 'GSAU-GW'),
	('EEAR', 'EEAR', 'eear-cozinha-oficiais', 'EEAR (cozinha oficiais)', null),  -- cozinha própria dos oficiais; sem refeitório equivalente cadastrado
	('EEAR', 'EEAR', 'eear-cozinha-central', 'EEAR (cozinha central)', 'Rancho'),  -- inferido: 'Rancho' é o único refeitório geral da EEAR
	('GAP-SJ', 'GAP-SJ', 'ieav', 'IEAV', 'IEAV'),
	('GAP-SJ', 'GAP-SJ', 'gap-sj', 'GAP-SJ', 'GAP-SJ'),
	('EPCAR', 'EPCAR', 'epcar', 'EPCAR', 'EPCAR'),
	('GAP-LS', 'GAP-LS', 'ciaar', 'CIAAR', 'CIAAR'),
	('GAP-LS', 'GAP-LS', 'pama-ls', 'PAMA-LS', 'PAMA-LS'),
	('GAP-LS', 'GAP-LS', 'esquadrao-de-saude-de-ls', 'ESQUADRAO DE SAUDE DE LS', 'ESQUADRAO DE SAUDE DE LS'),
	('BASM', 'BASM', 'basm', 'BASM', 'BASM'),
	('GAP-CO', 'GAP-CO', 'gap-co-leste', 'GAP-CO LESTE', 'BACO'),  -- a própria matriz declara: o rancho Leste atende à BACO
	('GAP-CO', 'GAP-CO', 'gap-co-oeste', 'GAP-CO OESTE', 'GAP-CO'),  -- a própria matriz declara: o rancho Oeste atende ao V COMAR
	('GAP-CO', 'GAP-CO', 'haco', 'HACO', 'HACO'),
	('BAFL', 'BAFL', 'bafl', 'BAFL', 'BAFL'),
	('CINDACTA 2', 'CINDACTA 2', 'cindacta-ii', 'CINDACTA II', 'CINDACTA II'),
	('GAP-BE', 'GAP-BE', 'babe', 'BABE', 'BABE'),
	('GAP-BE', 'GAP-BE', 'gap-be-i-comar', 'GAP-BE (I COMAR)', 'I COMAR'),
	('GAP-BE', 'GAP-BE', 'comara', 'COMARA', 'COMARA'),
	('GAP-BE', 'GAP-BE', 'habe', 'HABE', 'HABE'),
	('GAP-MN', 'GAP-MN', 'daco-mn', 'DACO-MN', 'DACO-MN'),
	('GAP-MN', 'GAP-MN', 'gap-mn', 'GAP-MN', 'GAP-MN'),
	('GAP-MN', 'GAP-MN', 'cindacta-iv', 'CINDACTA IV', 'CINDACTA IV'),
	('GAP-MN', 'GAP-MN', 'hamn', 'HAMN', 'HAMN'),
	('BAPV', 'BABV', 'babv', 'BABV', 'BABV'),  -- ELO próprio na matriz; o refeitório está sob BAPV no SISUB (divergência conhecida)
	('BAPV', 'BAPV', 'bapv', 'BAPV', 'BAPV'),
	('CLA', 'CLA', 'cla-ak', 'CLA- AK', 'CLA-AK'),
	('BAFZ', 'BAFZ', 'bafz', 'BAFZ', 'BAFZ'),
	('BANT', 'BANT', 'bant', 'BANT', 'BANT'),
	('BANT', 'BANT', 'clbi', 'CLBI', 'CLBI'),
	('BANT', 'BANT', 'nuhant', 'NuHANT', null),  -- sem refeitório correspondente cadastrado
	('GAP-RF', 'GAP-RF', 'ii-comar', 'II COMAR', null),  -- sem refeitório correspondente cadastrado (BARF não é o mesmo rancho)
	('GAP-RF', 'GAP-RF', 'harf', 'HARF', 'HARF'),
	('GAP-RF', 'GAP-RF', 'gap-rf-sede-cpa', 'GAP-RF (SEDE CPA)', 'GAP-RF'),
	('BASV', 'BASV', 'basv', 'BASV', 'BASV'),
	('BASV', 'BASV', 'cemcoha', 'CEMCOHA', 'CEMCOHA'),
	('GAP-DF', 'GAP-DF', 'babr-sul', 'BABR- SUL', 'BABR-SUL'),
	('GAP-DF', 'GAP-DF', 'cachimbo-cpbv', 'CACHIMBO- CPBV', 'CACHIMBO-CPBV'),
	('GAP-DF', 'GAP-DF', 'gap-df-norte', 'GAP DF – NORTE', 'GAP DF – NORTE'),
	('GAP-DF', 'HFAB', 'hfab', 'HFAB', 'HFAB'),  -- ELO próprio na matriz; o refeitório vive sob GAP-DF no SISUB
	('GAP-BR', 'GAP-BR', 'gap-br', 'GAP-BR', 'GAP BR'),
	('GAP-BR', 'GAP-BR', 'icia', 'ICIA', null),  -- sem refeitório correspondente cadastrado
	('BAAN', 'BAAN', 'baan', 'BAAN', 'BAAN'),
	('BACG', 'BACG', 'bacg', 'BACG', 'BACG')
) as v(unit_code, elo_code, code, display_name, mess_hall_code)
join core.units u on u.code = v.unit_code and not u.is_training
left join core.mess_halls m on m.code = v.mess_hall_code and m.unit_id = u.id and not m.is_training
on conflict (code) do nothing;

-- Vínculo declarado mas não resolvido = code de refeitório que mudou ou unidade errada.
-- Falhar aqui é melhor do que seguir com o rancho órfão e o indicador quebrado depois.
do $$
declare missing text;
begin
	select string_agg(v.code, ', ') into missing
	from (values
		('hca', 'HCA'),
		('gap-sede', 'GAP SEDE'),
		('garagem', 'GARAGEM'),
		('pame', 'PAME'),
		('gap-bagl', 'GAP-GL'),
		('cgabeg', 'CGABEG'),
		('hfag', 'HFAG'),
		('cemal', 'CEMAL'),
		('pamb', 'PAMB'),
		('dirad', 'DIRAD'),
		('baaf-gap-af', 'BAAF'),
		('cpa-af', 'CPA-AF'),
		('haaf', 'HAAF'),
		('unifa', 'UNIFA'),
		('basc', 'BASC'),
		('basp', 'BASP'),
		('pama-sp', 'PAMA-SP'),
		('gap-sp', 'GAP-SP'),
		('hfasp', 'HFASP'),
		('bast', 'BAST'),
		('comgap', 'COMGAP'),
		('fays', 'FAYS'),
		('afa', 'AFA'),
		('gsau-gw-hospital', 'GSAU-GW'),
		('eear-cozinha-central', 'Rancho'),
		('ieav', 'IEAV'),
		('gap-sj', 'GAP-SJ'),
		('epcar', 'EPCAR'),
		('ciaar', 'CIAAR'),
		('pama-ls', 'PAMA-LS'),
		('esquadrao-de-saude-de-ls', 'ESQUADRAO DE SAUDE DE LS'),
		('basm', 'BASM'),
		('gap-co-leste', 'BACO'),
		('gap-co-oeste', 'GAP-CO'),
		('haco', 'HACO'),
		('bafl', 'BAFL'),
		('cindacta-ii', 'CINDACTA II'),
		('babe', 'BABE'),
		('gap-be-i-comar', 'I COMAR'),
		('comara', 'COMARA'),
		('habe', 'HABE'),
		('daco-mn', 'DACO-MN'),
		('gap-mn', 'GAP-MN'),
		('cindacta-iv', 'CINDACTA IV'),
		('hamn', 'HAMN'),
		('babv', 'BABV'),
		('bapv', 'BAPV'),
		('cla-ak', 'CLA-AK'),
		('bafz', 'BAFZ'),
		('bant', 'BANT'),
		('clbi', 'CLBI'),
		('harf', 'HARF'),
		('gap-rf-sede-cpa', 'GAP-RF'),
		('basv', 'BASV'),
		('cemcoha', 'CEMCOHA'),
		('babr-sul', 'BABR-SUL'),
		('cachimbo-cpbv', 'CACHIMBO-CPBV'),
		('gap-df-norte', 'GAP DF – NORTE'),
		('hfab', 'HFAB'),
		('gap-br', 'GAP BR'),
		('baan', 'BAAN'),
		('bacg', 'BACG')
	) as v(code, mess_hall_code)
	join core.rancho r on r.code = v.code
	where r.mess_hall_id is null;
	if missing is not null then
		raise exception 'ranchos com refeitório declarado mas não resolvido: %', missing;
	end if;
end $$;

-- ── Competência ──────────────────────────────────────────────────────────────

insert into core.workforce_survey (reference_date, title, status, source, closed_at)
values ('2026-08-01', 'Matriz de efetivo dos ranchos — agosto/2026', 'closed', 'PLANILHA MATRIZ - GESTORES.xlsx (coleta SDAB)', now())
on conflict (reference_date) do nothing;

-- ── Respostas ────────────────────────────────────────────────────────────────

insert into core.workforce_submission (survey_id, rancho_id, declared_total, submitted_at)
select s.id, r.id, v.declared_total, now()
from (values
	('hfag', 20::integer),  -- total declarado diverge da soma das parcelas (22)
	('dirad', null::integer),
	('basc', 56::integer),
	('pama-sp', 47::integer),
	('fays', 3::integer),
	('afa', 92::integer),
	('gsau-gw-hospital', 3::integer),
	('eear-cozinha-oficiais', 9::integer),
	('eear-cozinha-central', 89::integer),
	('gap-sj', 97::integer),
	('epcar', 83::integer),
	('ciaar', null::integer),
	('pama-ls', null::integer),
	('esquadrao-de-saude-de-ls', null::integer),
	('gap-co-leste', 55::integer),
	('gap-co-oeste', 27::integer),
	('haco', 9::integer),
	('babe', 52::integer),
	('gap-be-i-comar', 60::integer),
	('comara', 23::integer),
	('daco-mn', 0::integer),
	('gap-mn', 5::integer),
	('cindacta-iv', 28::integer),
	('hamn', 4::integer),
	('babv', 35::integer),
	('bapv', 42::integer),
	('bafz', 37::integer),
	('basv', 29::integer),
	('hfab', 38::integer),
	('gap-br', null::integer),
	('baan', null::integer),
	('bacg', 55::integer)
) as v(rancho_code, declared_total)
join core.rancho r on r.code = v.rancho_code
cross join core.workforce_survey s
where s.reference_date = '2026-08-01'
on conflict (survey_id, rancho_id) do nothing;

insert into core.workforce_headcount (submission_id, category_id, headcount)
select sub.id, c.id, v.headcount
from (values
	('hfag', 'nut_qocon', 1),
	('hfag', 'tnd_qscon', 0),
	('hfag', 'qta', 14),
	('hfag', 'qscon', 0),
	('hfag', 'qcbcon', 1),
	('hfag', 'qsd', 6),
	('dirad', 'nut_qocon', 1),
	('dirad', 'tnd_qscon', 1),
	('dirad', 'qscon', 0),
	('dirad', 'qcbcon', 3),
	('basc', 'nut_qocon', 1),
	('basc', 'tnd_qscon', 1),
	('basc', 'qta', 30),
	('basc', 'qscon', 0),
	('basc', 'qcbcon', 0),
	('basc', 'qsd', 24),
	('pama-sp', 'nut_qocon', 2),
	('pama-sp', 'tnd_qscon', 2),
	('pama-sp', 'qta', 20),
	('pama-sp', 'qscon', 3),
	('pama-sp', 'qcbcon', 1),
	('pama-sp', 'qsd', 19),
	('fays', 'nut_qocon', 0),
	('fays', 'tnd_qscon', 0),
	('fays', 'qta', 2),
	('fays', 'qscon', 0),
	('fays', 'qcbcon', 0),
	('fays', 'qsd', 1),
	('afa', 'nut_qocon', 2),
	('afa', 'tnd_qscon', 2),
	('afa', 'qta', 49),
	('afa', 'qscon', 0),
	('afa', 'qcbcon', 2),
	('afa', 'qsd', 37),
	('gsau-gw-hospital', 'nut_qocon', 0),
	('gsau-gw-hospital', 'tnd_qscon', 0),
	('gsau-gw-hospital', 'qta', 3),
	('gsau-gw-hospital', 'qscon', 0),
	('gsau-gw-hospital', 'qcbcon', 0),
	('gsau-gw-hospital', 'qsd', 0),
	('eear-cozinha-oficiais', 'nut_qocon', 1),
	('eear-cozinha-oficiais', 'tnd_qscon', 0),
	('eear-cozinha-oficiais', 'qta', 7),
	('eear-cozinha-oficiais', 'qscon', 0),
	('eear-cozinha-oficiais', 'qcbcon', 0),
	('eear-cozinha-oficiais', 'qsd', 1),
	('eear-cozinha-central', 'nut_qocon', 1),
	('eear-cozinha-central', 'tnd_qscon', 2),
	('eear-cozinha-central', 'qta', 44),
	('eear-cozinha-central', 'qscon', 1),
	('eear-cozinha-central', 'qcbcon', 7),
	('eear-cozinha-central', 'qsd', 34),
	('gap-sj', 'nut_qocon', 3),
	('gap-sj', 'tnd_qscon', 4),
	('gap-sj', 'qta', 50),
	('gap-sj', 'qscon', 5),
	('gap-sj', 'qcbcon', 3),
	('gap-sj', 'qsd', 32),
	('epcar', 'nut_qocon', 1),
	('epcar', 'tnd_qscon', 2),
	('epcar', 'qta', 41),
	('epcar', 'qscon', 2),
	('epcar', 'qcbcon', 13),
	('epcar', 'qsd', 24),
	('ciaar', 'nut_qocon', 1),
	('ciaar', 'tnd_qscon', 1),
	('pama-ls', 'nut_qocon', 1),
	('pama-ls', 'tnd_qscon', 0),
	('esquadrao-de-saude-de-ls', 'nut_qocon', 0),
	('esquadrao-de-saude-de-ls', 'tnd_qscon', 0),
	('gap-co-leste', 'nut_qocon', 0),
	('gap-co-leste', 'tnd_qscon', 1),
	('gap-co-leste', 'qta', 24),
	('gap-co-leste', 'qscon', 1),
	('gap-co-leste', 'qcbcon', 6),
	('gap-co-leste', 'qsd', 23),
	('gap-co-oeste', 'nut_qocon', 1),
	('gap-co-oeste', 'tnd_qscon', 0),
	('gap-co-oeste', 'qta', 11),
	('gap-co-oeste', 'qscon', 2),
	('gap-co-oeste', 'qcbcon', 3),
	('gap-co-oeste', 'qsd', 10),
	('haco', 'nut_qocon', 1),
	('haco', 'tnd_qscon', 0),
	('haco', 'qta', 4),
	('haco', 'qscon', 0),
	('haco', 'qcbcon', 3),
	('haco', 'qsd', 1),
	('babe', 'nut_qocon', 1),
	('babe', 'tnd_qscon', 1),
	('babe', 'qta', 18),
	('babe', 'qscon', 2),
	('babe', 'qcbcon', 7),
	('babe', 'qsd', 23),
	('gap-be-i-comar', 'nut_qocon', 1),
	('gap-be-i-comar', 'tnd_qscon', 0),
	('gap-be-i-comar', 'qta', 31),
	('gap-be-i-comar', 'qscon', 0),
	('gap-be-i-comar', 'qcbcon', 4),
	('gap-be-i-comar', 'qsd', 24),
	('comara', 'nut_qocon', 1),
	('comara', 'tnd_qscon', 0),
	('comara', 'qta', 9),
	('comara', 'qscon', 0),
	('comara', 'qcbcon', 2),
	('comara', 'qsd', 11),
	('daco-mn', 'nut_qocon', 0),
	('daco-mn', 'tnd_qscon', 0),
	('daco-mn', 'qta', 0),
	('daco-mn', 'qscon', 0),
	('daco-mn', 'qcbcon', 0),
	('daco-mn', 'qsd', 0),
	('gap-mn', 'nut_qocon', 2),
	('gap-mn', 'tnd_qscon', 3),
	('cindacta-iv', 'nut_qocon', 1),
	('cindacta-iv', 'tnd_qscon', 1),
	('cindacta-iv', 'qta', 4),
	('cindacta-iv', 'qscon', 3),
	('cindacta-iv', 'qcbcon', 7),
	('cindacta-iv', 'qsd', 12),
	('hamn', 'nut_qocon', 2),
	('hamn', 'tnd_qscon', 0),
	('hamn', 'qta', 0),
	('hamn', 'qscon', 0),
	('hamn', 'qcbcon', 2),
	('babv', 'nut_qocon', 1),
	('babv', 'tnd_qscon', 2),
	('babv', 'qta', 23),
	('babv', 'qscon', 0),
	('babv', 'qcbcon', 1),
	('babv', 'qsd', 8),
	('bapv', 'nut_qocon', 1),
	('bapv', 'tnd_qscon', 1),
	('bapv', 'qta', 17),
	('bapv', 'qscon', 1),
	('bapv', 'qcbcon', 1),
	('bapv', 'qsd', 21),
	('bafz', 'nut_qocon', 1),
	('bafz', 'tnd_qscon', 2),
	('bafz', 'qta', 8),
	('bafz', 'qscon', 0),
	('bafz', 'qcbcon', 12),
	('bafz', 'qsd', 14),
	('basv', 'nut_qocon', 1),
	('basv', 'tnd_qscon', 0),
	('basv', 'qta', 12),
	('basv', 'qscon', 0),
	('basv', 'qcbcon', 2),
	('basv', 'qsd', 14),
	('hfab', 'nut_qocon', 2),
	('hfab', 'tnd_qscon', 0),
	('hfab', 'qta', 5),
	('hfab', 'qscon', 0),
	('hfab', 'qcbcon', 22),
	('hfab', 'qsd', 9),
	('gap-br', 'nut_qocon', 2),
	('gap-br', 'tnd_qscon', 1),
	('baan', 'nut_qocon', 1),
	('baan', 'tnd_qscon', 0),
	('baan', 'qscon', 1),
	('baan', 'qcbcon', 6),
	('bacg', 'nut_qocon', 1),
	('bacg', 'tnd_qscon', 0),
	('bacg', 'qta', 16),
	('bacg', 'qscon', 0),
	('bacg', 'qcbcon', 6),
	('bacg', 'qsd', 32)
) as v(rancho_code, category_code, headcount)
join core.rancho r on r.code = v.rancho_code
join core.workforce_survey s on s.reference_date = '2026-08-01'
join core.workforce_submission sub on sub.survey_id = s.id and sub.rancho_id = r.id
join core.workforce_category c on c.code = v.category_code
on conflict (submission_id, category_id) do nothing;

-- ── Observações, tipadas e despersonalizadas ─────────────────────────────────

insert into core.workforce_note (submission_id, kind, quantity, detail)
select sub.id, v.kind, v.quantity, v.detail
from (values
	('hfag', 'outsourced', 9::integer, 'Civis terceirizados cedidos pelo HFAG prestam serviço no rancho, por falta de efetivo.'),
	('basc', 'counting', 2::integer, 'Contabilizados em QTA: 1 SO QSS SEL (Manutenção) e 1 2S QESA BEP (Secretaria).'),
	('basc', 'change', 2::integer, 'Redução de 2 desde o redimensionamento: licenciamento de 1 militar de carreira e baixa de 1 soldado no mês.'),
	('pama-sp', 'leave', 2::integer, '1 NUT QOCON e 1 NUT QSCON afastadas por licença-maternidade.'),
	('afa', 'counting', 4::integer, 'Contabilizados em QTA: 1 1S QSS BET (manutenção), 1 2S QESA SAD (material carga), 1 3S QESA SOB (manutenção, PTTC) e 1 3S QESA SGS (cozinha, PTTC).'),
	('gsau-gw-hospital', 'shared', 2::integer, 'As 2 NUT QOCON atuam de forma coordenada em todos os ranchos apoiados pela EEAR; não são alocadas isoladamente à cozinha dos oficiais, à cozinha central ou ao GSAU-GW.'),
	('eear-cozinha-central', 'counting', 1::integer, 'Contabilizado em QTA: 1 Sgt QSS BSP, do armazém.'),
	('eear-cozinha-central', 'counting', null::integer, 'Em QCBCON foram contabilizados TCZ e TRR.'),
	('eear-cozinha-central', 'counting', 7::integer, 'Em QSD foram contabilizados 7 cabos oriundos de soldados, conforme orientação da matriz.'),
	('gap-sj', 'change', null::integer, 'Efetivo alterado desde o dimensionamento: chegada de novos soldados, cozinheiros QSCON e técnicas em nutrição.'),
	('gap-sj', 'scope', null::integer, 'Efetivo QTA/QSCON distribuído entre cozinha central, cozinha do comando, confeitaria, cozinha dietética, açougue, garde-manger, quatro refeitórios, padaria, armazém, apoio a eventos, serviços externos nas OM apoiadas, transporte de refeições ao IEAV, manutenção, depósito de utensílios e atividades administrativas.'),
	('gap-co-leste', 'leave', 2::integer, '1 NUT QOCON e 1 QSCON afastadas por necessidade gestacional.'),
	('gap-co-leste', 'counting', 2::integer, '2 sargentos (SEF e SEL) que executam apenas manutenção predial foram contabilizados como QTA, conforme orientação.'),
	('gap-co-leste', 'scope', null::integer, 'Atende à BACO e às unidades nela sediadas.'),
	('gap-co-leste', 'change', null::integer, 'Efetivo alterado desde o preenchimento anterior.'),
	('gap-co-oeste', 'reassigned', 2::integer, '2 SGT TAR atuam como motoristas no transporte de alimento do rancho Leste para o Oeste; não trabalham como arrumadores.'),
	('gap-co-oeste', 'scope', null::integer, 'Atende ao V COMAR e às unidades nele sediadas, incluído o efetivo do HACO.'),
	('gap-co-oeste', 'change', null::integer, 'Efetivo alterado desde o preenchimento anterior.'),
	('haco', 'scope', null::integer, 'Efetivo atende à Seção de Nutrição e Dietética do hospital, produzindo alimentação apenas para pacientes internados. A produção ocorre nas dependências da OSA e não tem relação com o GAP-CO.'),
	('bapv', 'reassigned', 1::integer, '1 SGT QESA contabilizado em QTA atua na Secretaria da SSUB.'),
	('bapv', 'leave', 1::integer, '1 SGT QTA TAR afastado para acompanhar tratamento médico de dependente; completa um ano de afastamento em setembro de 2026, sem previsão de alta.'),
	('basv', 'counting', 3::integer, 'Contabilizados em QTA: 2 QESA e 1 QSS SAD.'),
	('basv', 'reassigned', 3::integer, '3 QTA deslocados para funções administrativas: 2 estoquistas e 1 comissário/secretário.'),
	('hfab', 'scope', null::integer, 'Efetivo atende à OM e à copa dietética (pacientes e acompanhantes). A produção ocorre nas dependências do HFAB e não tem relação com o GAP-DF.'),
	('hfab', 'counting', 2::integer, 'Contabilizados em QTA: 2 suboficiais R1.'),
	('hfab', 'change', null::integer, 'Efetivo alterado desde o preenchimento anterior.'),
	('bacg', 'leave', 1::integer, '1 militar QTA em junta médica há mais de dez anos.'),
	('bacg', 'reassigned', 1::integer, '1 militar QSD cedido à copa do comando.')
) as v(rancho_code, kind, quantity, detail)
join core.rancho r on r.code = v.rancho_code
join core.workforce_survey s on s.reference_date = '2026-08-01'
join core.workforce_submission sub on sub.survey_id = s.id and sub.rancho_id = r.id
where not exists (
	select 1 from core.workforce_note n where n.submission_id = sub.id and n.detail = v.detail
);

commit;

