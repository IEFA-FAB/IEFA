/**
 * Operations do SISPROV: assinatura uniforme `op(db, ctx, input)`, guard dentro, nunca
 * supabase-js nem código de `apps/`.
 *
 * Vazio de propósito neste change (`sisprov-foundation`): o schema `sisprov` nasce sem
 * tabela, e operation sem tabela seria cadastro-sombra. As primeiras chegam com o change
 * `sisprov-catalog` (famílias, variantes, itens sobre `core.item`, grade de tamanhos),
 * depois de `db:drizzle:pull` incluir o schema no `drizzle/schema.ts`.
 */
export {}
