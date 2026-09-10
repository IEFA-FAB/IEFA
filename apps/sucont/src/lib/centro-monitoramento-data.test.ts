import { describe, expect, it } from "bun:test"
import { modulesData, routingKeywords } from "#/lib/centro-monitoramento-data"
import { sucontTools } from "#/lib/data"
import { findToolByPath } from "#/lib/tool-nav"

type InventoryItem = { id: string; url?: string; internalPath?: string }

const items: InventoryItem[] = Object.values(modulesData).flatMap((section) => section.items as readonly InventoryItem[])

/** Hosts das versões legadas das trilhas do RAC — as que o hub já substituiu. */
const LEGACY_HOSTS = ["sucont3-2sau.workers.dev", "ai.studio"]

describe("inventário do Centro de Monitoramento", () => {
	it("todo item aponta para algum lugar — rota interna ou url, nunca os dois", () => {
		for (const item of items) {
			expect(Boolean(item.internalPath) !== Boolean(item.url)).toBe(true)
		}
	})

	it("toda rota interna do inventário existe no catálogo", () => {
		// O inventário é uma segunda lista das mesmas ferramentas: se a rota mudar
		// em `sucontTools` e ficar aqui, o card aponta para um 404 do hub.
		for (const item of items.filter((i) => i.internalPath)) {
			expect(findToolByPath(sucontTools, item.internalPath as string)?.internalPath).toBe(item.internalPath)
		}
	})

	it("as seis trilhas do RAC apontam para dentro do hub", () => {
		// Eram as versões legadas em workers.dev/ai.studio — duplicata pior da
		// ferramenta portada, sem PBAC nem as correções trazidas do upstream.
		const expected: Record<string, string> = {
			q43: "/cruzamento-contas",
			q26_36: "/monitoramento",
			q05_25: "/analistasaldoalongado",
			q34: "/subitens-genericos",
			q40_42: "/analista-compatibilidade",
			q35: "/conta-generica",
		}
		for (const [id, path] of Object.entries(expected)) {
			expect(items.find((i) => i.id === id)?.internalPath).toBe(path)
		}
	})

	it("nenhuma url legada sobrevive no inventário", () => {
		for (const item of items.filter((i) => i.url)) {
			for (const host of LEGACY_HOSTS) expect(item.url).not.toContain(host)
		}
	})

	it("toda palavra-chave de roteamento aponta para um item que existe", () => {
		const ids = new Set(items.map((i) => i.id))
		for (const route of routingKeywords) expect(ids.has(route.moduleId)).toBe(true)
	})
})
