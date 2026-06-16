-- Corrige variante duplicada do "5º Uniforme A".
-- Causa: o unique (uniform_id, circulo, genero, sub_variacao) trata NULL como DISTINTO (padrão Postgres),
-- então o `on conflict do nothing` da migration de preenchimento NÃO deduplicou a variante oficiais/masculino
-- (sub_variacao NULL) contra a variante stub pré-existente do seed → ficaram 2 linhas idênticas.
-- Mantém a 1ª (preferindo a que tiver imagem) e remove as demais; as peças associadas caem por cascade.
with ranked as (
	select v.id,
		row_number() over (
			partition by v.uniform_id, v.circulo, v.genero, coalesce(v.sub_variacao, '')
			order by (v.image_path is null), v.id
		) as rn
	from rumaer.uniform u
	join rumaer.uniform_variant v on v.uniform_id = u.id
	where u.numero = 5 and u.letra = 'A'
)
delete from rumaer.uniform_variant
where id in (select id from ranked where rn > 1);
