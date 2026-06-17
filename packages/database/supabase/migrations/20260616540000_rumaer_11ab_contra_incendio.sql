-- Adiciona a sub_variação 'contra_incendio' ao 11º "A" e "B" (Art. 39, item g): equipes de contra incêndio
-- com EPI (capacete, balaclava, blusão, calça, bota e luva de combate a incêndio), cinturão vermelho,
-- meia-bota preta e plaqueta metálica de identificação (eventual).
-- genero='unissex' + sub_variacao='contra_incendio', uma variante por círculo (5 círculos do 11º).
-- Peças novas (EPI de combate a incêndio): balaclava, blusão, calça, luva; e plaqueta metálica de identificação.

insert into rumaer.piece (codigo, nome, slug, tipo) values
	(null, 'balaclava de combate a incêndio', 'balaclava-de-combate-a-incendio', 'acessorio'),
	(null, 'blusão de combate a incêndio',    'blusao-de-combate-a-incendio',    'torso'),
	(null, 'calça de combate a incêndio',     'calca-de-combate-a-incendio',     'pernas'),
	(null, 'luva de combate a incêndio',      'luva-de-combate-a-incendio',      'acessorio'),
	(null, 'plaqueta metálica de identificação', 'plaqueta-metalica-de-identificacao', 'identificacao')
on conflict (slug) do update set nome=excluded.nome, tipo=coalesce(excluded.tipo, rumaer.piece.tipo), deleted_at=null, updated_at=now();

do $$
declare u_id uuid; l text;
begin
	foreach l in array array['A','B'] loop
		select id into u_id from rumaer.uniform where numero=11 and letra=l and deleted_at is null limit 1;
		if u_id is not null then
			insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem) values
				(u_id,'oficiais','unissex','contra_incendio',30),(u_id,'suboficiais','unissex','contra_incendio',31),
				(u_id,'sargentos','unissex','contra_incendio',32),(u_id,'alunos','unissex','contra_incendio',33),
				(u_id,'pracas','unissex','contra_incendio',34)
			on conflict do nothing;
		end if;
	end loop;
end $$;

with letras(letra) as (values ('A'),('B')),
circ(circulo) as (values ('oficiais'),('suboficiais'),('sargentos'),('alunos'),('pracas')),
pecas(slug, nivel, ordem, obs) as (
	values
		('capacete-de-combate-a-incendio','obrigatorio',0,'EPI de combate a incêndio'),
		('balaclava-de-combate-a-incendio','obrigatorio',1,'EPI de combate a incêndio'),
		('blusao-de-combate-a-incendio','obrigatorio',2,'EPI de combate a incêndio'),
		('calca-de-combate-a-incendio','obrigatorio',3,'EPI de combate a incêndio'),
		('bota-para-motociclista-e-bombeiro','obrigatorio',4,'EPI de combate a incêndio'),
		('luva-de-combate-a-incendio','obrigatorio',5,'EPI de combate a incêndio'),
		('cinturao-vermelho','obrigatorio',6,'vermelho'),
		('meia-bota-preta','obrigatorio',7,'preta'),
		('plaqueta-metalica-de-identificacao','eventual',20,'uso eventual')
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from letras l
cross join circ cr
cross join pecas c
join rumaer.uniform u on u.numero=11 and u.letra=l.letra and u.deleted_at is null
join rumaer.uniform_variant uv on uv.uniform_id=u.id and uv.circulo=cr.circulo::rumaer.circulo_hierarquico
	and uv.genero='unissex' and uv.sub_variacao='contra_incendio'
join rumaer.piece p on p.slug=c.slug and p.deleted_at is null
where not exists (select 1 from rumaer.uniform_variant_piece x where x.variant_id=uv.id and x.piece_id=p.id);
