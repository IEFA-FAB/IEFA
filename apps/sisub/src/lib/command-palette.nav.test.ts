import { describe, expect, it, vi } from "vitest"

// `NavItems → auth/pbac → supabase → env` exige as vars de ambiente; a busca só precisa dos rótulos.
vi.mock("@/auth/pbac", () => ({ hasPermission: () => true }))
vi.mock("@/lib/assurance/mfa-availability", () => ({ MFA_AVAILABLE: true }))

const { ALL_MODULES } = await import("@/components/layout/sidebar/NavItems")
const { indexEntries, searchEntries } = await import("@/lib/command-palette")

/** O mesmo índice que a paleta monta (`CommandPalette.tsx`), com a sidebar real. */
const INDEX = indexEntries(
	ALL_MODULES.flatMap((m) =>
		m.items.map((it) => ({ id: `${m.id}:${it.url}`, label: it.title, moduleId: m.id, moduleName: m.name, group: it.group, keywords: it.keywords, url: it.url }))
	)
)
const urls = (query: string) => searchEntries(INDEX, query).map((e) => e.url)

/**
 * "Apoio" nomeia duas coisas: o cardápio de apoio (`/exceptions`, antes "Exceções") e a família do
 * Módulo 7 (Lanche de Apoio), cujos pedidos a cozinha atende em "Pedidos de Lanche". A busca tem
 * que levar cada termo ao lugar certo — e o molde nunca pode perder para a fila na busca por "apoio".
 */
describe("busca da paleta: apoio × lanche de apoio", () => {
	it("'apoio' abre primeiro os cardápios de apoio", () => {
		const hits = urls("apoio")
		expect(hits.slice(0, 2).sort()).toEqual(["/global/exceptions", "/kitchen/exceptions"])
	})

	it("'lanche de apoio' e 'lanche de bordo' levam à fila de pedidos, não ao molde", () => {
		for (const query of ["lanche de apoio", "lanche de bordo", "bordo"]) {
			const hits = urls(query)
			expect(hits, query).toContain("/kitchen/snack-requests")
			expect(hits, query).not.toContain("/kitchen/exceptions")
		}
	})

	it("'coffee break' e 'exceção' levam ao molde", () => {
		for (const query of ["coffee break", "excecao"]) expect(urls(query)[0], query).toMatch(/\/exceptions$/)
	})
})
