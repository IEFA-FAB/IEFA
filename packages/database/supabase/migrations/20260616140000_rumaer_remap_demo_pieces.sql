-- Remapeia a composição dos uniformes 5 e 7, que ainda referenciavam peças
-- genéricas de placeholder já soft-deletadas (sem código FAB, fora do catálogo),
-- para as peças canônicas do catálogo MCA 168-2. O alvo depende do gênero da
-- variante (genero NULL no mapeamento = qualquer gênero).
--
-- Itens "gestante" sem equivalente ativo no catálogo caem no equivalente
-- não-gestante; a observação da linha ("modelo gestante") preserva a intenção.

with mapping(legacy_nome, genero, new_codigo) as (
	values
		-- dependentes de gênero
		('Quepe',                'masculino', 'FAB-V-082'),   -- quepe masculino
		('Túnica',               'masculino', 'FAB-V-095'),   -- túnica masculina azul-aeronáutica
		('Túnica',               'feminino',  'FAB-V-093'),   -- túnica feminina azul-aeronáutica
		('Camisa de manga longa','masculino', 'FAB-V-039'),   -- camisa masc azul-clara mangas compridas
		('Camisa de manga longa','feminino',  'FAB-V-034'),   -- camisa fem azul-clara mangas compridas
		('Camisa de manga curta','masculino', 'FAB-V-115'),   -- camisas masc azuis-claras mangas curtas
		('Camisa de manga curta','feminino',  'FAB-V-114'),   -- camisas fem azuis-claras mangas curtas
		('Sapato',               'masculino', 'FAB-CAL-003'), -- sapato masculino preto tipo 2
		('Sapato',               'feminino',  'FAB-CAL-004'), -- sapato feminino sem salto
		-- independentes de gênero
		('Cobertura feminina',              null, 'FAB-V-081'),   -- quepe feminino
		('Calça Azul aeronáutica',          null, 'FAB-V-024'),   -- calça masculina azul-aeronáutica
		('Saia',                            null, 'FAB-V-083'),   -- saia azul-aeronáutica
		('Meia',                            null, 'FAB-V-078'),   -- meia preta/branca de nylon
		('Cinto',                           null, 'FAB-V-047'),   -- cinto azul-aeronáutica, branco ou preto
		('Platina',                         null, 'FAB-IID-020'), -- platina azul-aeronáutica
		('Tarjeta de identificação',        null, 'FAB-IID-023'), -- tarjeta de acrílico
		('Luvas',                           null, 'FAB-AE-033'),  -- luva de lã preta (clima frio)
		('Distintivo de organização',       null, 'FAB-IID-032'), -- Distintivo de Organização Militar
		('Jaqueta feminina azul-aeronáutica',null,'FAB-AG-022')   -- jaqueta fem azul-aero c/ forro removível
)
update rumaer.uniform_variant_piece uvp
set piece_id = newp.id
from rumaer.uniform_variant uv
join mapping m on true
join rumaer.piece oldp on oldp.nome = m.legacy_nome and oldp.codigo is null and oldp.deleted_at is not null
join rumaer.piece newp on newp.codigo = m.new_codigo and newp.deleted_at is null
where uvp.variant_id = uv.id
  and uvp.piece_id = oldp.id
  and (m.genero is null or m.genero = uv.genero::text);
