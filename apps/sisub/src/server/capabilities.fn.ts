/**
 * @module capabilities.fn
 * Expõe ao client quais features opcionais estão configuradas no servidor.
 * Usado pelos loaders de rota para decidir entre renderizar o recurso ou o
 * placeholder "Em breve" (ComingSoon) quando os secrets do fluxo estão ausentes.
 * @domain external
 * @migration n-a
 */

import { createServerFn } from "@tanstack/react-start"
import { getServerCapabilities, type ServerCapabilities } from "@/lib/capabilities.server"

export const getCapabilitiesFn = createServerFn({ method: "GET" }).handler(async (): Promise<ServerCapabilities> => {
	return getServerCapabilities()
})
