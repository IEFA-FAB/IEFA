/**
 * Horário (tipo de refeição) ou refeição própria como as listas do planejamento o leem: id e nome.
 *
 * A seção por tipo de refeição que morava aqui saiu quando o apoio passou a usar as refeições
 * próprias do evento (`EventMealCard`); o tipo ficou porque o auxiliador de quantitativo e o
 * editor semanal o usam.
 */
export type MealTypeInfo = { id: string; name: string | null }
