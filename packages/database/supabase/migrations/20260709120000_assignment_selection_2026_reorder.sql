-- Reorder the 2026 assignment-selection candidates by their final grade.
-- Idempotent: re-running produces the same ranking regardless of current order.
-- Two phases avoid transient violations of unique(edition_id, classificacao)
-- while permuting the existing values.

begin;

-- Phase 1: shift current values out of the 1..N range so the final assignment
-- below never collides with a not-yet-updated row.
update assignment_selection.person
set classificacao = classificacao + 1000
where edition_id = '3a83624b-371b-420a-83c5-8a8c2069aeec';

-- Phase 2: final ranking (1 = highest grade) matched by candidate name.
with ranking(nome, rank) as (
	values
		('JULIA', 1),
		('SANDI', 2),
		('MONIZ', 3),
		('PELISSON', 4),
		('GEOVANA', 5),
		('LUÍS PRADO', 6),
		('MYLENA', 7),
		('BORTOLUSSI', 8),
		('PAOLLA', 9),
		('MARIA GABRIELA', 10),
		('CAROLINA', 11),
		('LUSTOZA', 12),
		('ANA CATARINA', 13),
		('HELOÍSA', 14),
		('CAUÂ', 15),
		('BARCELLOS', 16),
		('JHONNY', 17),
		('GIROTO', 18),
		('MOTA', 19),
		('SKIBINA', 20),
		('SAURINE', 21),
		('SARAIVA', 22),
		('BACELAR', 23),
		('FERNANDES', 24),
		('TORRES', 25),
		('MANHÃES', 26),
		('AGUIAR', 27),
		('LINS', 28),
		('MÁXIMO', 29),
		('JULIANA', 30),
		('BANDEIRA', 31),
		('ANA VALÉRIA', 32),
		('BARRETO', 33),
		('BRAMUCCI', 34),
		('ANAIA', 35),
		('GREGORES', 36),
		('FEITOSA', 37),
		('NATHÁLIA', 38),
		('DOMINGUES', 39),
		('CASTRO', 40),
		('LUCAS COELHO', 41),
		('DAHER', 42),
		('NASCIMENTO', 43)
)
update assignment_selection.person p
set classificacao = r.rank
from ranking r
where p.edition_id = '3a83624b-371b-420a-83c5-8a8c2069aeec'
	and upper(btrim(p.nome)) = upper(r.nome);

commit;
