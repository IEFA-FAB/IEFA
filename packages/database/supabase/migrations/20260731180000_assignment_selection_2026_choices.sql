-- Escolhas da edição 2026 (1ª opção de cada militar, por ordem de classificação).
-- O estado sai do próprio quadro de vagas, para não duplicar o mapa OM → UF.
--
-- Os flags de telão (show_card/show_om/hide_card) continuam falsos: a escolha fica
-- carregada, e a revelação de cada card segue pelo controlador durante a sessão.
--
-- Corrige também a classificação de CAUÃ, gravada como 1015 (a 15ª posição estava
-- vaga e a foto do painel é servida por /pessoas/2026/{classificacao}.jpg).

update assignment_selection.person
set classificacao = 15
where edition_id = (select id from assignment_selection.edition where name = '2026')
	and classificacao = 1015
	and nome = 'CAUÃ';

update assignment_selection.person p
set localidade = c.om,
    estado = v.estado
from (values
        (1,  'GAP CO'), (2,  'GAP RJ'), (3,  'GAP RJ'), (4,  'GAP BR'),
        (5,  'GAP RJ'), (6,  'GAP DF'), (7,  'GAP CO'), (8,  'BASM'),
        (9,  'GAP DF'), (10, 'GAP SP'), (11, 'GAP RF'), (12, 'CLA'),
        (13, 'GAP DF'), (14, 'GAP MN'), (15, 'GAP AF'), (16, 'BABV'),
        (17, 'GAP AF'), (18, 'GAP RF'), (19, 'BAAN'),   (20, 'BAPV'),
        (21, 'GAP RJ'), (22, 'EPCAR'),  (23, 'GAP DF'), (24, 'CLA'),
        (25, 'GAP GL'), (26, 'GAP GL'), (27, 'GAP AF'), (28, 'BAPV'),
        (29, 'BASM'),   (30, 'GAP GL'), (31, 'GAP MN'), (32, 'BASV'),
        (33, 'BABV'),   (34, 'GAP AF'), (35, 'GAP BE'), (36, 'BASC'),
        (37, 'GAP BE'), (38, 'GAP MN'), (39, 'GAP BE'), (40, 'BASC'),
        (41, 'GAP BE'), (42, 'GAP BE'), (43, 'GAP MN')
) as c(classificacao, om)
join assignment_selection.vacancy v
	on v.om = c.om
	and v.edition_id = (select id from assignment_selection.edition where name = '2026')
where p.edition_id = (select id from assignment_selection.edition where name = '2026')
	and p.classificacao = c.classificacao;
