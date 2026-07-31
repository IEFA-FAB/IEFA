-- Quadro de vagas definitivo da edição 2026 do CPAINT (43 vagas), substituindo a
-- projeção proporcional do seed anterior (20260709120000).
--
-- Mudanças em relação ao seed:
--   * Saem: GAP LS, PAGL, BANT, BACG, BAFL.
--   * Entram: GAP RF, GAP CO, BASV, EPCAR, CLA.
--   * BAPV volta para Rondônia (o seed 2025 trazia "Rio Grande do Sul", incorreto —
--     Base Aérea de Porto Velho fica em Porto Velho/RO).
--
-- Distribuição por ODS (não modelada no schema, registrada aqui para rastreio):
--   SEFA    — GAP DF 4, GAP SP 1, GAP BR 1, GAP RJ 4, GAP GL 3, GAP AF 4,
--             GAP MN 4, GAP BE 5, GAP RF 2, GAP CO 2   (30)
--   COMPREP — BAAN 1, BASM 2, BASC 2, BAPV 2, BABV 2, BASV 1   (10)
--   COMGEP  — EPCAR 1   (1)
--   DCTA    — CLA 2   (2)

delete from assignment_selection.vacancy
where edition_id = (select id from assignment_selection.edition where name = '2026');

insert into assignment_selection.vacancy (edition_id, om, total_vagas, estado)
select (select id from assignment_selection.edition where name = '2026'), v.om, v.total_vagas, v.estado
from (values
        -- SEFA
        ('GAP DF', 4, 'Distrito Federal'),
        ('GAP SP', 1, 'São Paulo'),
        ('GAP BR', 1, 'Distrito Federal'),
        ('GAP RJ', 4, 'Rio de Janeiro'),
        ('GAP GL', 3, 'Rio de Janeiro'),
        ('GAP AF', 4, 'Rio de Janeiro'),
        ('GAP MN', 4, 'Amazonas'),
        ('GAP BE', 5, 'Pará'),
        ('GAP RF', 2, 'Pernambuco'),
        ('GAP CO', 2, 'Rio Grande do Sul'),
        -- COMPREP
        ('BAAN',   1, 'Goiás'),
        ('BASM',   2, 'Rio Grande do Sul'),
        ('BASC',   2, 'Rio de Janeiro'),
        ('BAPV',   2, 'Rondônia'),
        ('BABV',   2, 'Roraima'),
        ('BASV',   1, 'Bahia'),
        -- COMGEP
        ('EPCAR',  1, 'Minas Gerais'),
        -- DCTA
        ('CLA',    2, 'Maranhão')
) as v(om, total_vagas, estado);

-- A rodada registrada na edição 2026 usou o quadro antigo (43/43 preenchidas), que
-- deixa de valer com o quadro definitivo. Zera as escolhas e o estado de telão.
update assignment_selection.person
set localidade = null, estado = null, show_card = false, show_om = false, hide_card = false
where edition_id = (select id from assignment_selection.edition where name = '2026');
