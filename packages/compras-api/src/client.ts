import createClient from "openapi-fetch"
import type { paths } from "./types.gen.ts"

export const comprasClient = createClient<paths>({
	baseUrl: "https://dadosabertos.compras.gov.br",
})

export type { paths }
