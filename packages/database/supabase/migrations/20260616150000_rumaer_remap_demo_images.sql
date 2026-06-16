-- Remapeia imagens de variante (uniform_variant_image) que ainda apontavam para
-- peças genéricas de placeholder já soft-deletadas, usando o mesmo mapeamento da
-- composição (migration 20260616140000). Defensiva: em base limpa não há match.

with mapping(legacy_nome, genero, new_codigo) as (
	values
		('Quepe',                'masculino', 'FAB-V-082'),
		('Túnica',               'masculino', 'FAB-V-095'),
		('Túnica',               'feminino',  'FAB-V-093'),
		('Camisa de manga longa','masculino', 'FAB-V-039'),
		('Camisa de manga longa','feminino',  'FAB-V-034'),
		('Camisa de manga curta','masculino', 'FAB-V-115'),
		('Camisa de manga curta','feminino',  'FAB-V-114'),
		('Sapato',               'masculino', 'FAB-CAL-003'),
		('Sapato',               'feminino',  'FAB-CAL-004'),
		('Cobertura feminina',              null, 'FAB-V-081'),
		('Calça Azul aeronáutica',          null, 'FAB-V-024'),
		('Saia',                            null, 'FAB-V-083'),
		('Meia',                            null, 'FAB-V-078'),
		('Cinto',                           null, 'FAB-V-047'),
		('Platina',                         null, 'FAB-IID-020'),
		('Tarjeta de identificação',        null, 'FAB-IID-023'),
		('Luvas',                           null, 'FAB-AE-033'),
		('Distintivo de organização',       null, 'FAB-IID-032'),
		('Jaqueta feminina azul-aeronáutica',null,'FAB-AG-022')
)
update rumaer.uniform_variant_image uvi
set piece_id = newp.id
from rumaer.uniform_variant uv
join mapping m on true
join rumaer.piece oldp on oldp.nome = m.legacy_nome and oldp.codigo is null and oldp.deleted_at is not null
join rumaer.piece newp on newp.codigo = m.new_codigo and newp.deleted_at is null
where uvi.variant_id = uv.id
  and uvi.piece_id = oldp.id
  and (m.genero is null or m.genero = uv.genero::text);
