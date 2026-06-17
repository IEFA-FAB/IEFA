-- Cria e preenche o "13º Uniforme" (Art. 46 do RUMAER), atividades da área de saúde — grupo servicos.
-- Gendered (gorro/bibico). Variantes: feminino (oficiais, suboficiais, sargentos, alunos EEAR, praças),
-- gestante (oficiais, suboficiais, sargentos, praças), masculino (idem feminino + soldados de 1ª classe → praças).
-- Peças novas: camisa feminina/masculina branca para serviço de saúde; japona branca.
-- Idempotente; casa variante por (círculo, gênero, sub_variação) e peça por slug.

insert into rumaer.piece (codigo, nome, slug, tipo) values
	(null, 'camisa feminina branca para serviço de saúde',  'camisa-feminina-branca-para-servico-de-saude',  'torso'),
	(null, 'camisa masculina branca para serviço de saúde', 'camisa-masculina-branca-para-servico-de-saude', 'torso'),
	(null, 'japona branca',                                 'japona-branca',                                 'torso')
on conflict (slug) do update set
	nome = excluded.nome, tipo = coalesce(excluded.tipo, rumaer.piece.tipo), deleted_at = null, updated_at = now();

do $$
declare u_id uuid;
begin
	select id into u_id from rumaer.uniform where numero=13 and letra is null and deleted_at is null limit 1;
	if u_id is null then
		insert into rumaer.uniform (numero, letra, nome, grupo, subgrupo, traje, art_referencia, ordem, descricao_md)
		values (13, null, '13º Uniforme', 'servicos', 'saude', 'saúde', 'Art. 46', 260,
			'13º Uniforme, usado exclusivamente no exercício das atividades específicas da área de saúde.')
		returning id into u_id;

		insert into rumaer.uniform_category (uniform_id, categoria) values
			(u_id,'oficiais'),(u_id,'suboficiais'),(u_id,'sargentos'),(u_id,'alunos_formacao'),(u_id,'pracas')
		on conflict do nothing;

		insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem) values
			(u_id,'oficiais','feminino',null,0),(u_id,'suboficiais','feminino',null,1),(u_id,'sargentos','feminino',null,2),
			(u_id,'alunos','feminino',null,3),(u_id,'pracas','feminino',null,4),
			(u_id,'oficiais','feminino','gestante',5),(u_id,'suboficiais','feminino','gestante',6),
			(u_id,'sargentos','feminino','gestante',7),(u_id,'pracas','feminino','gestante',8),
			(u_id,'oficiais','masculino',null,9),(u_id,'suboficiais','masculino',null,10),(u_id,'sargentos','masculino',null,11),
			(u_id,'alunos','masculino',null,12),(u_id,'pracas','masculino',null,13)
		on conflict do nothing;
	end if;
end $$;

with cgs(circulo, genero, subvar) as (
	values ('oficiais','feminino',null),('suboficiais','feminino',null),('sargentos','feminino',null),
		('alunos','feminino',null),('pracas','feminino',null),
		('oficiais','feminino','gestante'),('suboficiais','feminino','gestante'),('sargentos','feminino','gestante'),('pracas','feminino','gestante'),
		('oficiais','masculino',null),('suboficiais','masculino',null),('sargentos','masculino',null),
		('alunos','masculino',null),('pracas','masculino',null)
),
pecas(genero, subvar, slug, nivel, ordem, obs) as (
	values
		-- feminino
		('feminino',null,'camisa-feminina-branca-para-servico-de-saude','obrigatorio',1,'branca, para serviço de saúde'),
		('feminino',null,'camiseta-branca','obrigatorio',2,'branca'),
		('feminino',null,'vestido-branco-para-o-servico-de-saude','obrigatorio',3,'branco (ou camisa + calça)'),
		('feminino',null,'calca-feminina-branca','obrigatorio',4,'branca (ou vestido)'),
		('feminino',null,'cinto-azul-aeronautica-branco-ou-preto','obrigatorio',5,'branco, com fivela prateada'),
		('feminino',null,'sapato-feminino-branco-salto-medio','obrigatorio',6,'branco, salto médio ou baixo'),
		('feminino',null,'meia-calca-social-lisa','obrigatorio',7,'cor da pele (quando usando vestido/saia)'),
		('feminino',null,'meia-branca-de-cano-medio','obrigatorio',8,'branca (quando usando calça)'),
		('feminino',null,'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo',10,'2ª pele branca'),
		('feminino',null,'jaqueta-feminina-branca-com-forro-removivel','facultativo',11,'branca'),
		('feminino',null,'capa-de-chuva-azul-aeronautica','facultativo',12,'azul-aeronáutica'),
		('feminino',null,'japona-branca','facultativo',13,'branca'),
		('feminino',null,'cachecol-branco','facultativo',14,null),
		('feminino',null,'jaleco-branco','eventual',20,'branco'),
		-- gestante
		('feminino','gestante','vestido-branco-para-gestante','obrigatorio',1,'branco, para gestante'),
		('feminino','gestante','camisa-feminina-branca-para-servico-de-saude','obrigatorio',2,'ou bata branca de mangas curtas'),
		('feminino','gestante','camiseta-branca','obrigatorio',3,'branca'),
		('feminino','gestante','calca-branca-para-gestante','obrigatorio',4,'branca (utilizada em conjunto com a bata)'),
		('feminino','gestante','sapato-feminino-branco-salto-medio','obrigatorio',5,'branco, salto médio ou baixo'),
		('feminino','gestante','meia-calca-social-lisa','obrigatorio',6,'cor da pele (autorizado meia especial; ou meia branca com calça)'),
		('feminino','gestante','camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo',10,'2ª pele branca'),
		('feminino','gestante','jaqueta-feminina-branca-com-forro-removivel','facultativo',11,'branca'),
		('feminino','gestante','capa-de-chuva-azul-aeronautica','facultativo',12,'azul-aeronáutica'),
		('feminino','gestante','japona-azul-aeronautica','facultativo',13,'azul-aeronáutica'),
		('feminino','gestante','cachecol-branco','facultativo',14,null),
		('feminino','gestante','jaleco-branco','eventual',20,'branco'),
		-- masculino
		('masculino',null,'camisa-masculina-branca-para-servico-de-saude','obrigatorio',1,'branca, para serviço de saúde'),
		('masculino',null,'camiseta-branca','obrigatorio',2,'branca'),
		('masculino',null,'calca-masculina-branca','obrigatorio',3,'branca'),
		('masculino',null,'cinto-azul-aeronautica-branco-ou-preto','obrigatorio',4,'branco, com fivela prateada'),
		('masculino',null,'sapato-masculino-branco','obrigatorio',5,'branco'),
		('masculino',null,'meia-branca-de-cano-medio','obrigatorio',6,'branca'),
		('masculino',null,'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo',10,'2ª pele branca'),
		('masculino',null,'jaqueta-masculina-branca-com-forro-removivel','facultativo',11,'branca'),
		('masculino',null,'capa-de-chuva-azul-aeronautica','facultativo',12,'azul-aeronáutica'),
		('masculino',null,'japona-branca','facultativo',13,'branca'),
		('masculino',null,'cachecol-branco','facultativo',14,null),
		('masculino',null,'jaleco-branco','eventual',20,'branco')
),
friso(circulo, obs) as (
	values ('oficiais','azul-aeronáutica, com friso prateado'),('suboficiais','azul-aeronáutica, com friso azul-royal'),
		('sargentos','azul-aeronáutica'),('alunos','azul-aeronáutica'),('pracas','azul-aeronáutica')
),
comp(circulo, genero, subvar, slug, nivel, ordem, obs) as (
	select cgs.circulo, cgs.genero, cgs.subvar, p.slug, p.nivel, p.ordem, p.obs
	from cgs join pecas p on p.genero=cgs.genero and p.subvar is not distinct from cgs.subvar
	union all
	select cgs.circulo, cgs.genero, cgs.subvar,
		case when cgs.genero='masculino' then 'gorro-masculino-azul-aeronautica' else 'gorro-feminino-azul-aeronautica' end,
		'obrigatorio',0,f.obs
	from cgs join friso f on f.circulo=cgs.circulo
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from comp c
join rumaer.uniform u on u.numero=13 and u.letra is null and u.deleted_at is null
join rumaer.uniform_variant uv on uv.uniform_id=u.id
	and uv.circulo=c.circulo::rumaer.circulo_hierarquico
	and uv.genero=c.genero::rumaer.genero
	and uv.sub_variacao is not distinct from c.subvar
join rumaer.piece p on p.slug=c.slug and p.deleted_at is null
where not exists (select 1 from rumaer.uniform_variant_piece x where x.variant_id=uv.id and x.piece_id=p.id);
