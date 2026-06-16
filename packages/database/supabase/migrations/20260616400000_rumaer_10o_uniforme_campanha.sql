-- Cria e preenche o "10º Uniforme" (Art. 38 do RUMAER), campanha/manobras/instrução militar — grupo servicos.
-- Uniforme UNISSEX: uma variante por círculo (genero='unissex') — oficiais, suboficiais, cadetes,
-- sargentos, alunos, praças. Composição idêntica em todos os círculos (gorro camuflado, sem friso).
-- Peças novas: gandola/casaco/blusão/abrigo/poncho/camisa de combate camuflados, cinto preto c/ fivela,
-- cordão verde, balaclava, lenço tático, braçal de serviço, capacete c/ cobertura camuflada e os
-- porta-* verde-oliva (sabre, cassetete, tonfa, algemas, carregador).
-- NÃO modelado neste passo: item i) (EAS e contra-incêndio) — adaptações que entram como sub_variacao depois.
-- Idempotente; casa variante por (círculo, gênero) e peça por slug.

insert into rumaer.piece (codigo, nome, slug, tipo) values
	(null, 'gandola camuflada',                              'gandola-camuflada',                              'torso'),
	(null, 'cinto preto com fivela preta',                   'cinto-preto-com-fivela-preta',                   'acessorio'),
	(null, 'casaco camuflado impermeável com forro e capuz', 'casaco-camuflado-impermeavel-com-forro-e-capuz', 'torso'),
	(null, 'blusão camuflado',                               'blusao-camuflado',                               'torso'),
	(null, 'abrigo camuflado impermeável',                   'abrigo-camuflado-impermeavel',                   'torso'),
	(null, 'poncho camuflado impermeável',                   'poncho-camuflado-impermeavel',                   'torso'),
	(null, 'camisa de combate',                              'camisa-de-combate',                              'torso'),
	(null, 'cordão verde',                                   'cordao-verde',                                   'acessorio'),
	(null, 'balaclava preta de lã',                          'balaclava-preta-de-la',                          'acessorio'),
	(null, 'lenço tático',                                   'lenco-tatico',                                   'acessorio'),
	(null, 'braçal preto de serviço',                        'bracal-preto-de-servico',                        'acessorio'),
	(null, 'capacete com cobertura camuflada',               'capacete-com-cobertura-camuflada',               'cabeca'),
	(null, 'porta-sabre verde-oliva',                        'porta-sabre-verde-oliva',                        'acessorio'),
	(null, 'porta-cassetete verde-oliva',                    'porta-cassetete-verde-oliva',                    'acessorio'),
	(null, 'porta-tonfa verde-oliva',                        'porta-tonfa-verde-oliva',                        'acessorio'),
	(null, 'porta-algemas verde-oliva',                      'porta-algemas-verde-oliva',                      'acessorio'),
	(null, 'porta-carregador verde-oliva',                   'porta-carregador-verde-oliva',                   'acessorio')
on conflict (slug) do update set
	nome = excluded.nome, tipo = coalesce(excluded.tipo, rumaer.piece.tipo), deleted_at = null, updated_at = now();

do $$
declare
	u_id uuid;
begin
	select id into u_id from rumaer.uniform where numero = 10 and letra is null and deleted_at is null limit 1;
	if u_id is null then
		insert into rumaer.uniform (numero, letra, nome, grupo, subgrupo, traje, art_referencia, ordem, descricao_md)
		values (10, null, '10º Uniforme', 'servicos', 'operacional', 'campanha', 'Art. 38', 180,
			'10º Uniforme, utilizado em atividades de campanha, manobras, serviço, instrução militar e, eventualmente, desfiles.')
		returning id into u_id;

		insert into rumaer.uniform_category (uniform_id, categoria) values
			(u_id, 'oficiais'), (u_id, 'cadetes'), (u_id, 'suboficiais'),
			(u_id, 'sargentos'), (u_id, 'alunos_formacao'), (u_id, 'pracas')
		on conflict (uniform_id, categoria) do nothing;

		insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem) values
			(u_id, 'oficiais',    'unissex', null, 0),
			(u_id, 'suboficiais', 'unissex', null, 1),
			(u_id, 'cadetes',     'unissex', null, 2),
			(u_id, 'sargentos',   'unissex', null, 3),
			(u_id, 'alunos',      'unissex', null, 4),
			(u_id, 'pracas',      'unissex', null, 5)
		on conflict (uniform_id, circulo, genero, sub_variacao) do nothing;
	end if;
end $$;

with circ(circulo) as (
	values ('oficiais'),('suboficiais'),('cadetes'),('sargentos'),('alunos'),('pracas')
),
pecas(slug, nivel, ordem, obs) as (
	values
		('gorro-camuflado-com-pala',                          'obrigatorio', 0,  'camuflado, com pala'),
		('gandola-camuflada',                                 'obrigatorio', 1,  'camuflada'),
		('camiseta-camuflada',                                'obrigatorio', 2,  'camuflada'),
		('calca-camuflada',                                   'obrigatorio', 3,  'camuflada'),
		('cinto-preto-com-fivela-preta',                      'obrigatorio', 4,  'preto, com fivela preta'),
		('meia-bota-preta',                                   'obrigatorio', 5,  'preta'),
		('meia-preta-de-cano-longo',                          'obrigatorio', 6,  'preta, cano longo'),
		('camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('casaco-camuflado-impermeavel-com-forro-e-capuz',    'facultativo', 11, 'camuflado, com forro e capuz'),
		('blusao-camuflado',                                  'facultativo', 12, 'camuflado'),
		('abrigo-camuflado-impermeavel',                      'facultativo', 13, 'camuflado, impermeável'),
		('poncho-camuflado-impermeavel',                      'facultativo', 14, 'camuflado, impermeável'),
		('luva-de-la-preta',                                  'facultativo', 15, 'preta'),
		('jaleco-branco',                                     'eventual',    20, 'branco'),
		('gorro-com-pala-camuflado-com-protecao-auricular',   'eventual',    21, 'camuflado, com proteção auricular'),
		('camisa-de-combate',                                 'eventual',    22, 'uso exclusivo com colete balístico (exceto EAS)'),
		('cordao-verde',                                      'eventual',    23, 'fixado ao ombro direito'),
		('balaclava-preta-de-la',                             'eventual',    24, 'preta, de lã'),
		('lenco-tatico',                                      'eventual',    25, null),
		('colete-especial-para-atividades-de-foto-e-filmagem-camuflado','eventual', 26, 'camuflado'),
		('bracal-preto-de-servico',                           'eventual',    27, 'preto, fixado ao ombro esquerdo'),
		('bone-operacional',                                  'eventual',    28, null),
		('capacete-com-cobertura-camuflada',                  'eventual',    29, 'com cobertura camuflada'),
		('capacete-azul-aeronautica',                         'eventual',    30, 'com identificação de equipe de saúde'),
		('cinturao-verde-oliva',                              'eventual',    31, 'verde-oliva'),
		('porta-pistola-verde-oliva',                         'eventual',    32, 'verde-oliva'),
		('porta-sabre-verde-oliva',                           'eventual',    33, 'verde-oliva'),
		('porta-cassetete-verde-oliva',                       'eventual',    34, 'verde-oliva'),
		('porta-tonfa-verde-oliva',                           'eventual',    35, 'verde-oliva'),
		('porta-algemas-verde-oliva',                         'eventual',    36, 'verde-oliva'),
		('porta-carregador-verde-oliva',                      'eventual',    37, 'verde-oliva')
),
comp(circulo, slug, nivel, ordem, obs) as (
	select c.circulo, p.slug, p.nivel, p.ordem, p.obs from circ c cross join pecas p
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from comp c
join rumaer.uniform u on u.numero = 10 and u.letra is null and u.deleted_at is null
join rumaer.uniform_variant uv on uv.uniform_id = u.id
	and uv.circulo = c.circulo::rumaer.circulo_hierarquico and uv.genero = 'unissex'
join rumaer.piece p on p.slug = c.slug and p.deleted_at is null
where not exists (
	select 1 from rumaer.uniform_variant_piece x where x.variant_id = uv.id and x.piece_id = p.id
);
