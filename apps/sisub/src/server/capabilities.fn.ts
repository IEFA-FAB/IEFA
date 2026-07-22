/**
 * @module capabilities.fn
 * Expõe ao client quais features opcionais estão configuradas no servidor.
 * Usado pelos loaders de rota para decidir entre renderizar o recurso ou o
 * placeholder "Em breve" (ComingSoon) quando os secrets do fluxo estão ausentes.
 * @domain external
 * @migration n-a
 */

import { createServerFn } from "@tanstack/react-start"
import { requireUserId } from "@/lib/auth.server"
import { getServerCapabilities, type ServerCapabilities } from "@/lib/capabilities.server"

// Exige sessão: o mapa de capabilities revela quais integrações/secrets estão
// configurados no servidor — reconhecimento gratuito para um chamador anônimo.
export const getCapabilitiesFn = createServerFn({ method: "GET" }).handler(async (): Promise<ServerCapabilities> => {
	await requireUserId()
	return getServerCapabilities()
})
