-- ============================================================================
-- Proporção recomendada acima de 100%
-- ============================================================================
--
-- A proporção dimensiona o item como fração do efetivo da refeição
-- (`resolveItemDemand`: efetivo × % ÷ 100). O CHECK travava em 100, mas consumo
-- acima do per capita médio é real — turma de curso de formação come mais: 150%
-- é uma porção e meia por comensal. O teto novo (300) é freio contra digitação,
-- o mesmo de `MAX_RECOMMENDED_PROPORTION` em @iefa/sisub-domain.
-- ============================================================================

do $$
declare
	v record;
begin
	for v in
		select c.conrelid::regclass as tbl, c.conname
		  from pg_constraint c
		 where c.contype = 'c'
		   and c.conrelid in ('kitchen.menu_items'::regclass, 'kitchen.menu_template_items'::regclass)
		   and pg_get_constraintdef(c.oid) ilike '%recommended_proportion%'
	loop
		execute format('alter table %s drop constraint %I', v.tbl, v.conname);
	end loop;
end $$;

alter table kitchen.menu_items
	add constraint menu_items_recommended_proportion_range
	check (recommended_proportion is null or (recommended_proportion >= 0 and recommended_proportion <= 300));

alter table kitchen.menu_template_items
	add constraint menu_template_items_recommended_proportion_range
	check (recommended_proportion is null or (recommended_proportion >= 0 and recommended_proportion <= 300));
