export {
	COMPRAS_BASE_URL,
	COMPRAS_MAX_DATE_WINDOW_DAYS,
	COMPRAS_MAX_PAGE_SIZE,
	COMPRAS_MIN_PAGE_SIZE,
	type ComprasClient,
	comprasClient,
	createComprasClient,
} from "./client.ts"
export type { ComprasGetPath, ComprasPageQuery, ComprasQuery } from "./query.ts"
export type * from "./types.gen.ts"
