-- Edição 2026 do CPAINT (43 pessoas, vagas proporcionais à turma 2025).
-- Proporção: 43/39 ≈ 1.103×. Resto de Hamilton distribui +4 vagas para
-- GAP MN (+1), GAP SP (+1), GAP AF (+1) e GAP BE (+1).

-- 2026 entra ativa: o telão passa a segui-la. Desativa as demais (só uma ativa por vez).
update assignment_selection.edition set active = false where active;

insert into assignment_selection.edition (name, active)
values ('2026', true);

insert into assignment_selection.vacancy (id, edition_id, om, total_vagas, estado, created_at)
select v.id, (select id from assignment_selection.edition where name = '2026'), v.om, v.total_vagas, v.estado, v.created_at::timestamptz
from (values
        (19, 'GAP AF', 4, 'Rio de Janeiro',      '2026-07-09 12:00:00+00'),
        (20, 'GAP BE', 4, 'Pará',                '2026-07-09 12:00:00+00'),
        (21, 'GAP BR', 3, 'Distrito Federal',     '2026-07-09 12:00:00+00'),
        (22, 'GAP DF', 3, 'Distrito Federal',     '2026-07-09 12:00:00+00'),
        (23, 'GAP GL', 2, 'Rio de Janeiro',       '2026-07-09 12:00:00+00'),
        (24, 'GAP LS', 2, 'Minas Gerais',         '2026-07-09 12:00:00+00'),
        (25, 'GAP MN', 5, 'Amazonas',             '2026-07-09 12:00:00+00'),
        (26, 'GAP RJ', 1, 'Rio de Janeiro',       '2026-07-09 12:00:00+00'),
        (27, 'GAP SP', 5, 'São Paulo',            '2026-07-09 12:00:00+00'),
        (28, 'PAGL',   1, 'Rio de Janeiro',       '2026-07-09 12:00:00+00'),
        (29, 'BAPV',   2, 'Rio Grande do Sul',    '2026-07-09 12:00:00+00'),
        (30, 'BABV',   2, 'Roraima',              '2026-07-09 12:00:00+00'),
        (31, 'BAAN',   2, 'Goiás',                '2026-07-09 12:00:00+00'),
        (32, 'BANT',   1, 'Rio Grande do Norte',  '2026-07-09 12:00:00+00'),
        (33, 'BACG',   2, 'Mato Grosso do Sul',   '2026-07-09 12:00:00+00'),
        (34, 'BASC',   2, 'Rio de Janeiro',       '2026-07-09 12:00:00+00'),
        (35, 'BASM',   1, 'Rio Grande do Sul',    '2026-07-09 12:00:00+00'),
        (36, 'BAFL',   1, 'Santa Catarina',       '2026-07-09 12:00:00+00')
) as v(id, om, total_vagas, estado, created_at);

insert into assignment_selection.person (id, edition_id, classificacao, nome, localidade, estado, show_card, show_om, hide_card, created_at)
select p.id, (select id from assignment_selection.edition where name = '2026'), p.classificacao, p.nome, null, null, false, false, false, '2026-07-09 12:00:00+00'::timestamptz
from (values
        (41,  1, 'JULIA'),
        (42,  2, 'MONIZ'),
        (43,  3, 'MYLENA'),
        (44,  4, 'SANDI'),
        (45,  5, 'PELISSON'),
        (46,  6, 'GEOVANA'),
        (47,  7, 'BORTOLUSSI'),
        (48,  8, 'LUÍS PRADO'),
        (49,  9, 'PAOLLA'),
        (50, 10, 'MARIA GABRIELA'),
        (51, 11, 'CAROLINA'),
        (52, 12, 'LUSTOZA'),
        (53, 13, 'ANA CATARINA'),
        (54, 14, 'CAUÂ'),
        (55, 15, 'HELOÍSA'),
        (56, 16, 'GIROTO'),
        (57, 17, 'BARCELLOS'),
        (58, 18, 'JHONNY'),
        (59, 19, 'MOTA'),
        (60, 20, 'SKIBINA'),
        (61, 21, 'SAURINE'),
        (62, 22, 'SARAIVA'),
        (63, 23, 'BACELAR'),
        (64, 24, 'FERNANDES'),
        (65, 25, 'MANHÃES'),
        (66, 26, 'TORRES'),
        (67, 27, 'AGUIAR'),
        (68, 28, 'LINS'),
        (69, 29, 'MÁXIMO'),
        (70, 30, 'JULIANA'),
        (71, 31, 'ANA VALÉRIA'),
        (72, 32, 'BANDEIRA'),
        (73, 33, 'BRAMUCCI'),
        (74, 34, 'BARRETO'),
        (75, 35, 'FEITOSA'),
        (76, 36, 'NATHÁLIA'),
        (77, 37, 'GREGORES'),
        (78, 38, 'ANAIA'),
        (79, 39, 'DOMINGUES'),
        (80, 40, 'CASTRO'),
        (81, 41, 'LUCAS COELHO'),
        (82, 42, 'DAHER'),
        (83, 43, 'NASCIMENTO')
) as p(id, classificacao, nome);

-- Atualiza sequences após inserts com id explícito.
select setval(pg_get_serial_sequence('assignment_selection.person',  'id'), (select max(id) from assignment_selection.person));
select setval(pg_get_serial_sequence('assignment_selection.vacancy', 'id'), (select max(id) from assignment_selection.vacancy));
