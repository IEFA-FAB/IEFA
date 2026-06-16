-- Adiciona a sub_variação "hipismo" ao "5º Uniforme A" (Art. 24, item f) — uso pelas equipes de hipismo.
-- Muda substancialmente o uniforme: culote (ou culote de malha) no lugar de calça/saia, botas de montaria
-- no lugar do sapato, capacete preto (eventual — competição). Sem espadim/espada/meia (não se monta com eles).
-- Modelada como genero feminino/masculino + sub_variacao='hipismo', espelhando os círculos do 5A.
-- Peças novas: culote azul-aeronáutica, culote de malha azul-aeronáutica, botas pretas de montaria, capacete preto.
-- Idempotente; o sub_variacao 'hipismo' é não-nulo, então o on-conflict deduplica corretamente.

insert into rumaer.piece (codigo, nome, slug, tipo) values
	(null, 'culote azul-aeronáutica',          'culote-azul-aeronautica',          'pernas'),
	(null, 'culote de malha azul-aeronáutica', 'culote-de-malha-azul-aeronautica', 'pernas'),
	(null, 'botas pretas de montaria',         'botas-pretas-de-montaria',         'calcado'),
	(null, 'capacete preto',                   'capacete-preto',                   'cabeca')
on conflict (slug) do update set
	nome = excluded.nome,
	tipo = coalesce(excluded.tipo, rumaer.piece.tipo),
	deleted_at = null,
	updated_at = now();

do $$
declare
	u_id uuid;
begin
	select id into u_id from rumaer.uniform
	where numero = 5 and letra = 'A' and deleted_at is null limit 1;

	if u_id is not null then
		insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem) values
			(u_id, 'oficiais',    'feminino',  'hipismo', 13),
			(u_id, 'cadetes',     'feminino',  'hipismo', 14),
			(u_id, 'suboficiais', 'feminino',  'hipismo', 15),
			(u_id, 'sargentos',   'feminino',  'hipismo', 16),
			(u_id, 'alunos',      'feminino',  'hipismo', 17),
			(u_id, 'oficiais',    'masculino', 'hipismo', 18),
			(u_id, 'cadetes',     'masculino', 'hipismo', 19),
			(u_id, 'suboficiais', 'masculino', 'hipismo', 20),
			(u_id, 'sargentos',   'masculino', 'hipismo', 21),
			(u_id, 'alunos',      'masculino', 'hipismo', 22)
		on conflict (uniform_id, circulo, genero, sub_variacao) do nothing;
	end if;
end $$;

with comp(genero, circulo, slug, nivel, ordem, obs) as (
	values
		-- ===================== FEMININO (hipismo) =====================
		('feminino', 'oficiais', 'quepe-feminino',                                'obrigatorio', 0,  'azul-aeronáutica'),
		('feminino', 'oficiais', 'tunica-feminina-azul-aeronautica',              'obrigatorio', 1,  'azul-aeronáutica, com passantes (oficiais, suboficiais, cadetes e alunas dos centros de formação ou de adaptação de oficiais)'),
		('feminino', 'oficiais', 'camisa-feminina-azul-clara-de-mangas-compridas','obrigatorio', 2,  null),
		('feminino', 'oficiais', 'gravata-feminina-preta',                        'obrigatorio', 3,  null),
		('feminino', 'oficiais', 'culote-azul-aeronautica',                       'obrigatorio', 4,  'culote ou culote de malha, azul-aeronáutica'),
		('feminino', 'oficiais', 'culote-de-malha-azul-aeronautica',              'obrigatorio', 5,  'culote ou culote de malha, azul-aeronáutica'),
		('feminino', 'oficiais', 'cinto-azul-aeronautica-branco-ou-preto',        'obrigatorio', 6,  'azul-aeronáutica, com fivela prateada'),
		('feminino', 'oficiais', 'botas-pretas-de-montaria',                      'obrigatorio', 7,  'pretas'),
		('feminino', 'oficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 12, '2ª pele branca'),
		('feminino', 'oficiais', 'colete-azul-aeronautica-com-gola-em-v',         'facultativo', 13, 'gola em "V"'),
		('feminino', 'oficiais', 'capa-de-chuva-azul-aeronautica',                'facultativo', 14, 'azul-aeronáutica'),
		('feminino', 'oficiais', 'sobretudo-feminino-azul-aeronautica',           'facultativo', 15, 'azul-aeronáutica'),
		('feminino', 'oficiais', 'cachecol-branco',                               'facultativo', 16, null),
		('feminino', 'oficiais', 'luva-preta-de-couro',                           'eventual',    20, null),
		('feminino', 'oficiais', 'capacete-preto',                                'eventual',    21, 'preto (competição de hipismo)'),
		('feminino', 'cadetes', 'quepe-feminino',                                 'obrigatorio', 0,  'azul-aeronáutica'),
		('feminino', 'cadetes', 'tunica-feminina-azul-aeronautica',               'obrigatorio', 1,  'azul-aeronáutica, com passantes (oficiais, suboficiais, cadetes e alunas dos centros de formação ou de adaptação de oficiais)'),
		('feminino', 'cadetes', 'camisa-feminina-azul-clara-de-mangas-compridas', 'obrigatorio', 2,  null),
		('feminino', 'cadetes', 'gravata-feminina-preta',                         'obrigatorio', 3,  null),
		('feminino', 'cadetes', 'culote-azul-aeronautica',                        'obrigatorio', 4,  'culote ou culote de malha, azul-aeronáutica'),
		('feminino', 'cadetes', 'culote-de-malha-azul-aeronautica',               'obrigatorio', 5,  'culote ou culote de malha, azul-aeronáutica'),
		('feminino', 'cadetes', 'cinto-azul-aeronautica-branco-ou-preto',         'obrigatorio', 6,  'azul-aeronáutica, com fivela prateada'),
		('feminino', 'cadetes', 'botas-pretas-de-montaria',                       'obrigatorio', 7,  'pretas'),
		('feminino', 'cadetes', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 12, '2ª pele branca'),
		('feminino', 'cadetes', 'colete-azul-aeronautica-com-gola-em-v',          'facultativo', 13, 'gola em "V"'),
		('feminino', 'cadetes', 'capa-de-chuva-azul-aeronautica',                 'facultativo', 14, 'azul-aeronáutica'),
		('feminino', 'cadetes', 'sobretudo-feminino-azul-aeronautica',            'facultativo', 15, 'azul-aeronáutica'),
		('feminino', 'cadetes', 'cachecol-branco',                                'facultativo', 16, null),
		('feminino', 'cadetes', 'luva-preta-de-couro',                            'eventual',    20, null),
		('feminino', 'cadetes', 'capacete-preto',                                 'eventual',    21, 'preto (competição de hipismo)'),
		('feminino', 'suboficiais', 'quepe-feminino',                             'obrigatorio', 0,  'azul-aeronáutica'),
		('feminino', 'suboficiais', 'tunica-feminina-azul-aeronautica',           'obrigatorio', 1,  'azul-aeronáutica, com passantes (oficiais, suboficiais, cadetes e alunas dos centros de formação ou de adaptação de oficiais)'),
		('feminino', 'suboficiais', 'camisa-feminina-azul-clara-de-mangas-compridas','obrigatorio', 2,  null),
		('feminino', 'suboficiais', 'gravata-feminina-preta',                     'obrigatorio', 3,  null),
		('feminino', 'suboficiais', 'culote-azul-aeronautica',                    'obrigatorio', 4,  'culote ou culote de malha, azul-aeronáutica'),
		('feminino', 'suboficiais', 'culote-de-malha-azul-aeronautica',           'obrigatorio', 5,  'culote ou culote de malha, azul-aeronáutica'),
		('feminino', 'suboficiais', 'cinto-azul-aeronautica-branco-ou-preto',     'obrigatorio', 6,  'azul-aeronáutica, com fivela prateada'),
		('feminino', 'suboficiais', 'botas-pretas-de-montaria',                   'obrigatorio', 7,  'pretas'),
		('feminino', 'suboficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 12, '2ª pele branca'),
		('feminino', 'suboficiais', 'colete-azul-aeronautica-com-gola-em-v',      'facultativo', 13, 'gola em "V"'),
		('feminino', 'suboficiais', 'capa-de-chuva-azul-aeronautica',             'facultativo', 14, 'azul-aeronáutica'),
		('feminino', 'suboficiais', 'sobretudo-feminino-azul-aeronautica',        'facultativo', 15, 'azul-aeronáutica'),
		('feminino', 'suboficiais', 'cachecol-branco',                            'facultativo', 16, null),
		('feminino', 'suboficiais', 'luva-preta-de-couro',                        'eventual',    20, null),
		('feminino', 'suboficiais', 'capacete-preto',                             'eventual',    21, 'preto (competição de hipismo)'),
		('feminino', 'sargentos', 'quepe-feminino',                               'obrigatorio', 0,  'azul-aeronáutica'),
		('feminino', 'sargentos', 'tunica-feminina-azul-aeronautica',             'obrigatorio', 1,  'azul-aeronáutica (sargentos e alunas da EEAR)'),
		('feminino', 'sargentos', 'camisa-feminina-azul-clara-de-mangas-compridas','obrigatorio', 2,  null),
		('feminino', 'sargentos', 'gravata-feminina-preta',                       'obrigatorio', 3,  null),
		('feminino', 'sargentos', 'culote-azul-aeronautica',                      'obrigatorio', 4,  'culote ou culote de malha, azul-aeronáutica'),
		('feminino', 'sargentos', 'culote-de-malha-azul-aeronautica',             'obrigatorio', 5,  'culote ou culote de malha, azul-aeronáutica'),
		('feminino', 'sargentos', 'cinto-azul-aeronautica-branco-ou-preto',       'obrigatorio', 6,  'azul-aeronáutica, com fivela prateada'),
		('feminino', 'sargentos', 'botas-pretas-de-montaria',                     'obrigatorio', 7,  'pretas'),
		('feminino', 'sargentos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 12, '2ª pele branca'),
		('feminino', 'sargentos', 'colete-azul-aeronautica-com-gola-em-v',        'facultativo', 13, 'gola em "V"'),
		('feminino', 'sargentos', 'capa-de-chuva-azul-aeronautica',               'facultativo', 14, 'azul-aeronáutica'),
		('feminino', 'sargentos', 'sobretudo-feminino-azul-aeronautica',          'facultativo', 15, 'azul-aeronáutica'),
		('feminino', 'sargentos', 'cachecol-branco',                              'facultativo', 16, null),
		('feminino', 'sargentos', 'luva-preta-de-couro',                          'eventual',    20, null),
		('feminino', 'sargentos', 'capacete-preto',                               'eventual',    21, 'preto (competição de hipismo)'),
		('feminino', 'alunos', 'quepe-feminino',                                  'obrigatorio', 0,  'azul-aeronáutica'),
		('feminino', 'alunos', 'tunica-feminina-azul-aeronautica',                'obrigatorio', 1,  'azul-aeronáutica, com passantes (oficiais, suboficiais, cadetes e alunas dos centros de formação ou de adaptação de oficiais)'),
		('feminino', 'alunos', 'camisa-feminina-azul-clara-de-mangas-compridas',  'obrigatorio', 2,  null),
		('feminino', 'alunos', 'gravata-feminina-preta',                          'obrigatorio', 3,  null),
		('feminino', 'alunos', 'culote-azul-aeronautica',                         'obrigatorio', 4,  'culote ou culote de malha, azul-aeronáutica'),
		('feminino', 'alunos', 'culote-de-malha-azul-aeronautica',                'obrigatorio', 5,  'culote ou culote de malha, azul-aeronáutica'),
		('feminino', 'alunos', 'cinto-azul-aeronautica-branco-ou-preto',          'obrigatorio', 6,  'azul-aeronáutica, com fivela prateada'),
		('feminino', 'alunos', 'botas-pretas-de-montaria',                        'obrigatorio', 7,  'pretas'),
		('feminino', 'alunos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 12, '2ª pele branca'),
		('feminino', 'alunos', 'colete-azul-aeronautica-com-gola-em-v',           'facultativo', 13, 'gola em "V"'),
		('feminino', 'alunos', 'capa-de-chuva-azul-aeronautica',                  'facultativo', 14, 'azul-aeronáutica'),
		('feminino', 'alunos', 'sobretudo-feminino-azul-aeronautica',             'facultativo', 15, 'azul-aeronáutica'),
		('feminino', 'alunos', 'cachecol-branco',                                 'facultativo', 16, null),
		('feminino', 'alunos', 'luva-preta-de-couro',                             'eventual',    20, null),
		('feminino', 'alunos', 'capacete-preto',                                  'eventual',    21, 'preto (competição de hipismo)'),

		-- ===================== MASCULINO (hipismo) =====================
		('masculino', 'oficiais', 'quepe-masculino',                              'obrigatorio', 0,  'azul-aeronáutica'),
		('masculino', 'oficiais', 'tunica-masculina-azul-aeronautica',            'obrigatorio', 1,  'azul-aeronáutica, com passantes (oficiais, suboficiais, cadetes e alunos dos centros de formação ou de adaptação de oficiais)'),
		('masculino', 'oficiais', 'camisa-masculina-azul-clara-de-mangas-compridas','obrigatorio', 2,  null),
		('masculino', 'oficiais', 'gravata-vertical-preta',                       'obrigatorio', 3,  'vertical'),
		('masculino', 'oficiais', 'culote-azul-aeronautica',                      'obrigatorio', 4,  'culote ou culote de malha, azul-aeronáutica'),
		('masculino', 'oficiais', 'culote-de-malha-azul-aeronautica',             'obrigatorio', 5,  'culote ou culote de malha, azul-aeronáutica'),
		('masculino', 'oficiais', 'cinto-azul-aeronautica-branco-ou-preto',       'obrigatorio', 6,  'azul-aeronáutica, com fivela prateada'),
		('masculino', 'oficiais', 'botas-pretas-de-montaria',                     'obrigatorio', 7,  'pretas'),
		('masculino', 'oficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 12, '2ª pele branca'),
		('masculino', 'oficiais', 'colete-azul-aeronautica-com-gola-em-v',        'facultativo', 13, 'gola em "V"'),
		('masculino', 'oficiais', 'capa-de-chuva-azul-aeronautica',               'facultativo', 14, 'azul-aeronáutica'),
		('masculino', 'oficiais', 'sobretudo-masculino-azul-aeronautica',         'facultativo', 15, 'azul-aeronáutica'),
		('masculino', 'oficiais', 'cachecol-branco',                              'facultativo', 16, null),
		('masculino', 'oficiais', 'luva-preta-de-couro',                          'eventual',    20, null),
		('masculino', 'oficiais', 'capacete-preto',                               'eventual',    21, 'preto (competição de hipismo)'),
		('masculino', 'cadetes', 'quepe-masculino',                               'obrigatorio', 0,  'azul-aeronáutica'),
		('masculino', 'cadetes', 'tunica-masculina-azul-aeronautica',             'obrigatorio', 1,  'azul-aeronáutica, com passantes (oficiais, suboficiais, cadetes e alunos dos centros de formação ou de adaptação de oficiais)'),
		('masculino', 'cadetes', 'camisa-masculina-azul-clara-de-mangas-compridas','obrigatorio', 2,  null),
		('masculino', 'cadetes', 'gravata-vertical-preta',                        'obrigatorio', 3,  'vertical'),
		('masculino', 'cadetes', 'culote-azul-aeronautica',                       'obrigatorio', 4,  'culote ou culote de malha, azul-aeronáutica'),
		('masculino', 'cadetes', 'culote-de-malha-azul-aeronautica',              'obrigatorio', 5,  'culote ou culote de malha, azul-aeronáutica'),
		('masculino', 'cadetes', 'cinto-azul-aeronautica-branco-ou-preto',        'obrigatorio', 6,  'azul-aeronáutica, com fivela prateada'),
		('masculino', 'cadetes', 'botas-pretas-de-montaria',                      'obrigatorio', 7,  'pretas'),
		('masculino', 'cadetes', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 12, '2ª pele branca'),
		('masculino', 'cadetes', 'colete-azul-aeronautica-com-gola-em-v',         'facultativo', 13, 'gola em "V"'),
		('masculino', 'cadetes', 'capa-de-chuva-azul-aeronautica',                'facultativo', 14, 'azul-aeronáutica'),
		('masculino', 'cadetes', 'sobretudo-masculino-azul-aeronautica',          'facultativo', 15, 'azul-aeronáutica'),
		('masculino', 'cadetes', 'cachecol-branco',                               'facultativo', 16, null),
		('masculino', 'cadetes', 'luva-preta-de-couro',                           'eventual',    20, null),
		('masculino', 'cadetes', 'capacete-preto',                                'eventual',    21, 'preto (competição de hipismo)'),
		('masculino', 'suboficiais', 'quepe-masculino',                           'obrigatorio', 0,  'azul-aeronáutica'),
		('masculino', 'suboficiais', 'tunica-masculina-azul-aeronautica',         'obrigatorio', 1,  'azul-aeronáutica, com passantes (oficiais, suboficiais, cadetes e alunos dos centros de formação ou de adaptação de oficiais)'),
		('masculino', 'suboficiais', 'camisa-masculina-azul-clara-de-mangas-compridas','obrigatorio', 2,  null),
		('masculino', 'suboficiais', 'gravata-vertical-preta',                    'obrigatorio', 3,  'vertical'),
		('masculino', 'suboficiais', 'culote-azul-aeronautica',                   'obrigatorio', 4,  'culote ou culote de malha, azul-aeronáutica'),
		('masculino', 'suboficiais', 'culote-de-malha-azul-aeronautica',          'obrigatorio', 5,  'culote ou culote de malha, azul-aeronáutica'),
		('masculino', 'suboficiais', 'cinto-azul-aeronautica-branco-ou-preto',    'obrigatorio', 6,  'azul-aeronáutica, com fivela prateada'),
		('masculino', 'suboficiais', 'botas-pretas-de-montaria',                  'obrigatorio', 7,  'pretas'),
		('masculino', 'suboficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 12, '2ª pele branca'),
		('masculino', 'suboficiais', 'colete-azul-aeronautica-com-gola-em-v',     'facultativo', 13, 'gola em "V"'),
		('masculino', 'suboficiais', 'capa-de-chuva-azul-aeronautica',            'facultativo', 14, 'azul-aeronáutica'),
		('masculino', 'suboficiais', 'sobretudo-masculino-azul-aeronautica',      'facultativo', 15, 'azul-aeronáutica'),
		('masculino', 'suboficiais', 'cachecol-branco',                           'facultativo', 16, null),
		('masculino', 'suboficiais', 'luva-preta-de-couro',                       'eventual',    20, null),
		('masculino', 'suboficiais', 'capacete-preto',                            'eventual',    21, 'preto (competição de hipismo)'),
		('masculino', 'sargentos', 'quepe-masculino',                             'obrigatorio', 0,  'azul-aeronáutica'),
		('masculino', 'sargentos', 'tunica-masculina-azul-aeronautica',           'obrigatorio', 1,  'azul-aeronáutica (sargentos e alunos da EEAR)'),
		('masculino', 'sargentos', 'camisa-masculina-azul-clara-de-mangas-compridas','obrigatorio', 2,  null),
		('masculino', 'sargentos', 'gravata-vertical-preta',                      'obrigatorio', 3,  'vertical'),
		('masculino', 'sargentos', 'culote-azul-aeronautica',                     'obrigatorio', 4,  'culote ou culote de malha, azul-aeronáutica'),
		('masculino', 'sargentos', 'culote-de-malha-azul-aeronautica',            'obrigatorio', 5,  'culote ou culote de malha, azul-aeronáutica'),
		('masculino', 'sargentos', 'cinto-azul-aeronautica-branco-ou-preto',      'obrigatorio', 6,  'azul-aeronáutica, com fivela prateada'),
		('masculino', 'sargentos', 'botas-pretas-de-montaria',                    'obrigatorio', 7,  'pretas'),
		('masculino', 'sargentos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 12, '2ª pele branca'),
		('masculino', 'sargentos', 'colete-azul-aeronautica-com-gola-em-v',       'facultativo', 13, 'gola em "V"'),
		('masculino', 'sargentos', 'capa-de-chuva-azul-aeronautica',              'facultativo', 14, 'azul-aeronáutica'),
		('masculino', 'sargentos', 'sobretudo-masculino-azul-aeronautica',        'facultativo', 15, 'azul-aeronáutica'),
		('masculino', 'sargentos', 'cachecol-branco',                             'facultativo', 16, null),
		('masculino', 'sargentos', 'luva-preta-de-couro',                         'eventual',    20, null),
		('masculino', 'sargentos', 'capacete-preto',                              'eventual',    21, 'preto (competição de hipismo)'),
		('masculino', 'alunos', 'quepe-masculino',                                'obrigatorio', 0,  'azul-aeronáutica'),
		('masculino', 'alunos', 'tunica-masculina-azul-aeronautica',              'obrigatorio', 1,  'azul-aeronáutica, com passantes (oficiais, suboficiais, cadetes e alunos dos centros de formação ou de adaptação de oficiais)'),
		('masculino', 'alunos', 'camisa-masculina-azul-clara-de-mangas-compridas','obrigatorio', 2,  null),
		('masculino', 'alunos', 'gravata-vertical-preta',                         'obrigatorio', 3,  'vertical'),
		('masculino', 'alunos', 'culote-azul-aeronautica',                        'obrigatorio', 4,  'culote ou culote de malha, azul-aeronáutica'),
		('masculino', 'alunos', 'culote-de-malha-azul-aeronautica',               'obrigatorio', 5,  'culote ou culote de malha, azul-aeronáutica'),
		('masculino', 'alunos', 'cinto-azul-aeronautica-branco-ou-preto',         'obrigatorio', 6,  'azul-aeronáutica, com fivela prateada'),
		('masculino', 'alunos', 'botas-pretas-de-montaria',                       'obrigatorio', 7,  'pretas'),
		('masculino', 'alunos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 12, '2ª pele branca'),
		('masculino', 'alunos', 'colete-azul-aeronautica-com-gola-em-v',          'facultativo', 13, 'gola em "V"'),
		('masculino', 'alunos', 'capa-de-chuva-azul-aeronautica',                 'facultativo', 14, 'azul-aeronáutica'),
		('masculino', 'alunos', 'sobretudo-masculino-azul-aeronautica',           'facultativo', 15, 'azul-aeronáutica'),
		('masculino', 'alunos', 'cachecol-branco',                                'facultativo', 16, null),
		('masculino', 'alunos', 'luva-preta-de-couro',                            'eventual',    20, null),
		('masculino', 'alunos', 'capacete-preto',                                 'eventual',    21, 'preto (competição de hipismo)')
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from comp c
join rumaer.uniform u on u.numero = 5 and u.letra = 'A' and u.deleted_at is null
join rumaer.uniform_variant uv
	on uv.uniform_id = u.id
	and uv.circulo = c.circulo::rumaer.circulo_hierarquico
	and uv.genero = c.genero::rumaer.genero
	and uv.sub_variacao = 'hipismo'
join rumaer.piece p on p.slug = c.slug and p.deleted_at is null
where not exists (
	select 1 from rumaer.uniform_variant_piece x where x.variant_id = uv.id and x.piece_id = p.id
);
