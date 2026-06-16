-- Cria e preenche o "Uniforme histórico de guarda cerimonial" (Art. 15 do RUMAER), grupo historicos.
-- Uso exclusivo do Elemento de Honras Militares do GSD-BR (VI COMAR) e GSD-RJ (III COMAR).
-- Históricos não têm numero/letra. Uma única peça de catálogo, com variantes por (círculo × gênero).
-- O círculo_hierarquico não distingue cabos/soldados → ambos mapeados para 'pracas'.
--   feminino  → oficiais, suboficiais, sargentos, praças (cabos)
--   masculino → oficiais, suboficiais, sargentos, praças (cabos e soldados)
-- Composição (espelha a redação do artigo):
--   túnica de desfile azul-aeronáutica, meia asa prateada; passadeiras apenas para oficiais
--   espada → obrigatória só para oficiais
--   2ª pele branca → facultativa em todos os círculos
--   porta-sabre → eventual; feminino: suboficiais/sargentos · masculino: suboficiais/sargentos/praças
-- Idempotente: do-block cria uniform/categorias/variantes só se ainda não existir;
-- CTE insere a composição com guarda NOT EXISTS. Casa variante por (círculo, gênero) e peça por slug.

do $$
declare
	u_id uuid;
begin
	select id into u_id
	from rumaer.uniform
	where grupo = 'historicos' and nome = 'Uniforme histórico de guarda cerimonial' and deleted_at is null
	limit 1;

	if u_id is null then
		insert into rumaer.uniform (numero, letra, nome, grupo, subgrupo, art_referencia, ordem, descricao_md)
		values (
			null, null, 'Uniforme histórico de guarda cerimonial', 'historicos', 'guarda_cerimonial', 'Art. 15', 1,
			'Uniforme histórico de guarda cerimonial, utilizado exclusivamente pelo Elemento de Honras Militares do GSD-BR (VI COMAR) e do GSD-RJ (III COMAR), em representações e solenidades ou desfiles militares.'
		)
		returning id into u_id;

		insert into rumaer.uniform_category (uniform_id, categoria) values
			(u_id, 'oficiais'),
			(u_id, 'suboficiais'),
			(u_id, 'sargentos'),
			(u_id, 'pracas')
		on conflict (uniform_id, categoria) do nothing;

		insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem) values
			(u_id, 'oficiais',    'feminino',  null, 0),
			(u_id, 'suboficiais', 'feminino',  null, 1),
			(u_id, 'sargentos',   'feminino',  null, 2),
			(u_id, 'pracas',      'feminino',  null, 3),
			(u_id, 'oficiais',    'masculino', null, 4),
			(u_id, 'suboficiais', 'masculino', null, 5),
			(u_id, 'sargentos',   'masculino', null, 6),
			(u_id, 'pracas',      'masculino', null, 7)
		on conflict (uniform_id, circulo, genero, sub_variacao) do nothing;
	end if;
end $$;

with comp(genero, circulo, slug, nivel, ordem, obs) as (
	values
		-- ===================== FEMININO =====================
		-- ---- oficiais ----
		('feminino', 'oficiais', 'quepe-feminino',                                   'obrigatorio', 0,  'branco'),
		('feminino', 'oficiais', 'tunica-de-desfile-feminina',                       'obrigatorio', 1,  'azul-aeronáutica, meia asa prateada bordada nas golas, com passadeiras'),
		('feminino', 'oficiais', 'calca-feminina-azul-aeronautica',                  'obrigatorio', 2,  null),
		('feminino', 'oficiais', 'cinto-azul-aeronautica-branco-ou-preto',           'obrigatorio', 3,  'azul-aeronáutica, com fivela prateada'),
		('feminino', 'oficiais', 'sapato-feminino-de-salto-medio-tipo-2',            'obrigatorio', 4,  'preto'),
		('feminino', 'oficiais', 'meia-preta-branca-de-nylon',                       'obrigatorio', 5,  'preta'),
		('feminino', 'oficiais', 'fiador-para-espada',                               'obrigatorio', 6,  null),
		('feminino', 'oficiais', 'talim-azul-aeronautica',                           'obrigatorio', 7,  'sobre a túnica'),
		('feminino', 'oficiais', 'guia-azul-aeronautica-de-seda-para-espada',        'obrigatorio', 8,  null),
		('feminino', 'oficiais', 'espada',                                           'obrigatorio', 9,  'para oficiais'),
		('feminino', 'oficiais', 'luva-branca-de-algodao',                           'obrigatorio', 10, null),
		('feminino', 'oficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 11, '2ª pele branca'),
		-- ---- suboficiais ----
		('feminino', 'suboficiais', 'quepe-feminino',                                'obrigatorio', 0,  'branco'),
		('feminino', 'suboficiais', 'tunica-de-desfile-feminina',                    'obrigatorio', 1,  'azul-aeronáutica, meia asa prateada bordada nas golas'),
		('feminino', 'suboficiais', 'calca-feminina-azul-aeronautica',               'obrigatorio', 2,  null),
		('feminino', 'suboficiais', 'cinto-azul-aeronautica-branco-ou-preto',        'obrigatorio', 3,  'azul-aeronáutica, com fivela prateada'),
		('feminino', 'suboficiais', 'sapato-feminino-de-salto-medio-tipo-2',         'obrigatorio', 4,  'preto'),
		('feminino', 'suboficiais', 'meia-preta-branca-de-nylon',                    'obrigatorio', 5,  'preta'),
		('feminino', 'suboficiais', 'fiador-para-espada',                            'obrigatorio', 6,  null),
		('feminino', 'suboficiais', 'talim-azul-aeronautica',                        'obrigatorio', 7,  'sobre a túnica'),
		('feminino', 'suboficiais', 'guia-azul-aeronautica-de-seda-para-espada',     'obrigatorio', 8,  null),
		('feminino', 'suboficiais', 'luva-branca-de-algodao',                        'obrigatorio', 10, null),
		('feminino', 'suboficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 11, '2ª pele branca'),
		('feminino', 'suboficiais', 'porta-sabre-azul-aeronautica',                  'eventual',    12, 'para suboficiais e sargentos'),
		-- ---- sargentos ----
		('feminino', 'sargentos', 'quepe-feminino',                                  'obrigatorio', 0,  'branco'),
		('feminino', 'sargentos', 'tunica-de-desfile-feminina',                      'obrigatorio', 1,  'azul-aeronáutica, meia asa prateada bordada nas golas'),
		('feminino', 'sargentos', 'calca-feminina-azul-aeronautica',                 'obrigatorio', 2,  null),
		('feminino', 'sargentos', 'cinto-azul-aeronautica-branco-ou-preto',          'obrigatorio', 3,  'azul-aeronáutica, com fivela prateada'),
		('feminino', 'sargentos', 'sapato-feminino-de-salto-medio-tipo-2',           'obrigatorio', 4,  'preto'),
		('feminino', 'sargentos', 'meia-preta-branca-de-nylon',                      'obrigatorio', 5,  'preta'),
		('feminino', 'sargentos', 'fiador-para-espada',                              'obrigatorio', 6,  null),
		('feminino', 'sargentos', 'talim-azul-aeronautica',                          'obrigatorio', 7,  'sobre a túnica'),
		('feminino', 'sargentos', 'guia-azul-aeronautica-de-seda-para-espada',       'obrigatorio', 8,  null),
		('feminino', 'sargentos', 'luva-branca-de-algodao',                          'obrigatorio', 10, null),
		('feminino', 'sargentos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 11, '2ª pele branca'),
		('feminino', 'sargentos', 'porta-sabre-azul-aeronautica',                    'eventual',    12, 'para suboficiais e sargentos'),
		-- ---- praças (cabos) ----
		('feminino', 'pracas', 'quepe-feminino',                                     'obrigatorio', 0,  'branco'),
		('feminino', 'pracas', 'tunica-de-desfile-feminina',                         'obrigatorio', 1,  'azul-aeronáutica, meia asa prateada bordada nas golas'),
		('feminino', 'pracas', 'calca-feminina-azul-aeronautica',                    'obrigatorio', 2,  null),
		('feminino', 'pracas', 'cinto-azul-aeronautica-branco-ou-preto',             'obrigatorio', 3,  'azul-aeronáutica, com fivela prateada'),
		('feminino', 'pracas', 'sapato-feminino-de-salto-medio-tipo-2',              'obrigatorio', 4,  'preto'),
		('feminino', 'pracas', 'meia-preta-branca-de-nylon',                         'obrigatorio', 5,  'preta'),
		('feminino', 'pracas', 'fiador-para-espada',                                 'obrigatorio', 6,  null),
		('feminino', 'pracas', 'talim-azul-aeronautica',                             'obrigatorio', 7,  'sobre a túnica'),
		('feminino', 'pracas', 'guia-azul-aeronautica-de-seda-para-espada',          'obrigatorio', 8,  null),
		('feminino', 'pracas', 'luva-branca-de-algodao',                             'obrigatorio', 10, null),
		('feminino', 'pracas', 'camisa-branca-flanelada-de-mangas-compridas-2-pele', 'facultativo', 11, '2ª pele branca'),

		-- ===================== MASCULINO =====================
		-- ---- oficiais ----
		('masculino', 'oficiais', 'quepe-masculino',                                 'obrigatorio', 0,  'branco'),
		('masculino', 'oficiais', 'tunica-de-desfile-masculina',                     'obrigatorio', 1,  'azul-aeronáutica, meia asa prateada bordada nas golas, com passadeiras'),
		('masculino', 'oficiais', 'calca-masculina-azul-aeronautica',                'obrigatorio', 2,  null),
		('masculino', 'oficiais', 'cinto-azul-aeronautica-branco-ou-preto',          'obrigatorio', 3,  'azul-aeronáutica, com fivela prateada'),
		('masculino', 'oficiais', 'sapato-masculino-preto-tipo-2',                   'obrigatorio', 4,  'preto'),
		('masculino', 'oficiais', 'meia-preta-branca-de-nylon',                      'obrigatorio', 5,  'preta'),
		('masculino', 'oficiais', 'fiador-para-espada',                              'obrigatorio', 6,  null),
		('masculino', 'oficiais', 'talim-azul-aeronautica',                          'obrigatorio', 7,  'sobre a túnica'),
		('masculino', 'oficiais', 'guia-azul-aeronautica-de-seda-para-espada',       'obrigatorio', 8,  null),
		('masculino', 'oficiais', 'espada',                                          'obrigatorio', 9,  'para oficiais'),
		('masculino', 'oficiais', 'luva-branca-de-algodao',                          'obrigatorio', 10, null),
		('masculino', 'oficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 11, '2ª pele branca'),
		-- ---- suboficiais ----
		('masculino', 'suboficiais', 'quepe-masculino',                              'obrigatorio', 0,  'branco'),
		('masculino', 'suboficiais', 'tunica-de-desfile-masculina',                  'obrigatorio', 1,  'azul-aeronáutica, meia asa prateada bordada nas golas'),
		('masculino', 'suboficiais', 'calca-masculina-azul-aeronautica',             'obrigatorio', 2,  null),
		('masculino', 'suboficiais', 'cinto-azul-aeronautica-branco-ou-preto',       'obrigatorio', 3,  'azul-aeronáutica, com fivela prateada'),
		('masculino', 'suboficiais', 'sapato-masculino-preto-tipo-2',                'obrigatorio', 4,  'preto'),
		('masculino', 'suboficiais', 'meia-preta-branca-de-nylon',                   'obrigatorio', 5,  'preta'),
		('masculino', 'suboficiais', 'fiador-para-espada',                           'obrigatorio', 6,  null),
		('masculino', 'suboficiais', 'talim-azul-aeronautica',                       'obrigatorio', 7,  'sobre a túnica'),
		('masculino', 'suboficiais', 'guia-azul-aeronautica-de-seda-para-espada',    'obrigatorio', 8,  null),
		('masculino', 'suboficiais', 'luva-branca-de-algodao',                       'obrigatorio', 10, null),
		('masculino', 'suboficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 11, '2ª pele branca'),
		('masculino', 'suboficiais', 'porta-sabre-azul-aeronautica',                 'eventual',    12, 'para suboficiais, sargentos, cabos e soldados'),
		-- ---- sargentos ----
		('masculino', 'sargentos', 'quepe-masculino',                                'obrigatorio', 0,  'branco'),
		('masculino', 'sargentos', 'tunica-de-desfile-masculina',                    'obrigatorio', 1,  'azul-aeronáutica, meia asa prateada bordada nas golas'),
		('masculino', 'sargentos', 'calca-masculina-azul-aeronautica',               'obrigatorio', 2,  null),
		('masculino', 'sargentos', 'cinto-azul-aeronautica-branco-ou-preto',         'obrigatorio', 3,  'azul-aeronáutica, com fivela prateada'),
		('masculino', 'sargentos', 'sapato-masculino-preto-tipo-2',                  'obrigatorio', 4,  'preto'),
		('masculino', 'sargentos', 'meia-preta-branca-de-nylon',                     'obrigatorio', 5,  'preta'),
		('masculino', 'sargentos', 'fiador-para-espada',                             'obrigatorio', 6,  null),
		('masculino', 'sargentos', 'talim-azul-aeronautica',                         'obrigatorio', 7,  'sobre a túnica'),
		('masculino', 'sargentos', 'guia-azul-aeronautica-de-seda-para-espada',      'obrigatorio', 8,  null),
		('masculino', 'sargentos', 'luva-branca-de-algodao',                         'obrigatorio', 10, null),
		('masculino', 'sargentos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 11, '2ª pele branca'),
		('masculino', 'sargentos', 'porta-sabre-azul-aeronautica',                   'eventual',    12, 'para suboficiais, sargentos, cabos e soldados'),
		-- ---- praças (cabos e soldados) ----
		('masculino', 'pracas', 'quepe-masculino',                                   'obrigatorio', 0,  'branco'),
		('masculino', 'pracas', 'tunica-de-desfile-masculina',                       'obrigatorio', 1,  'azul-aeronáutica, meia asa prateada bordada nas golas'),
		('masculino', 'pracas', 'calca-masculina-azul-aeronautica',                  'obrigatorio', 2,  null),
		('masculino', 'pracas', 'cinto-azul-aeronautica-branco-ou-preto',            'obrigatorio', 3,  'azul-aeronáutica, com fivela prateada'),
		('masculino', 'pracas', 'sapato-masculino-preto-tipo-2',                     'obrigatorio', 4,  'preto'),
		('masculino', 'pracas', 'meia-preta-branca-de-nylon',                        'obrigatorio', 5,  'preta'),
		('masculino', 'pracas', 'fiador-para-espada',                                'obrigatorio', 6,  null),
		('masculino', 'pracas', 'talim-azul-aeronautica',                            'obrigatorio', 7,  'sobre a túnica'),
		('masculino', 'pracas', 'guia-azul-aeronautica-de-seda-para-espada',         'obrigatorio', 8,  null),
		('masculino', 'pracas', 'luva-branca-de-algodao',                            'obrigatorio', 10, null),
		('masculino', 'pracas', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 11, '2ª pele branca'),
		('masculino', 'pracas', 'porta-sabre-azul-aeronautica',                      'eventual',    12, 'para suboficiais, sargentos, cabos e soldados')
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from comp c
join rumaer.uniform u
	on u.grupo = 'historicos' and u.nome = 'Uniforme histórico de guarda cerimonial' and u.deleted_at is null
join rumaer.uniform_variant uv
	on uv.uniform_id = u.id
	and uv.circulo = c.circulo::rumaer.circulo_hierarquico
	and uv.genero = c.genero::rumaer.genero
join rumaer.piece p on p.slug = c.slug and p.deleted_at is null
where not exists (
	select 1 from rumaer.uniform_variant_piece x where x.variant_id = uv.id and x.piece_id = p.id
);
