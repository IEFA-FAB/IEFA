-- ============================================================================
-- Efetivo da refeição do evento
-- ============================================================================
-- A refeição do evento (20260925120000) só dimensionava a preparação pelo pax
-- de cada item. O cardápio semanal diz "almoço = 800" uma vez e cada preparação
-- pede uma porcentagem desse efetivo (30% de 800 = 240); o evento precisa do
-- mesmo: "coquetel = 300 convidados", e os volantes a 100%, o prato quente a 60%.
--
-- A regra da demanda é a mesma do semanal (`resolveItemDemand`): pax do item,
-- senão a porcentagem do item sobre o efetivo da refeição, senão o efetivo
-- cheio. Nulo = a refeição não tem efetivo, e só o pax do item conta — que é o
-- comportamento de hoje, então nenhum evento existente muda de número.
-- ============================================================================

alter table kitchen.menu_template_event_meal
	add column base_headcount integer,
	add constraint menu_template_event_meal_base_headcount_check check (base_headcount is null or base_headcount > 0);

comment on column kitchen.menu_template_event_meal.base_headcount is
	'Efetivo da refeição do evento. A porcentagem do item (recommended_proportion) incide sobre ele; o pax do item (headcount_override) vence os dois.';
