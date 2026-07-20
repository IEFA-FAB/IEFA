import { notFound } from "@tanstack/react-router"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Ids de rota vêm da URL e são repassados a validators `z.string().uuid()` nas
 * server functions. Sem esta checagem um id digitado errado explode com
 * "Invalid uuid" na tela de erro em vez de cair no notFound do router.
 */
export function assertUuidParam(value: string) {
	if (!UUID_RE.test(value)) throw notFound()
}
