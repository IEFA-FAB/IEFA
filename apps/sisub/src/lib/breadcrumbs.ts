/**
 * Rótulos do breadcrumb do AppShell.
 *
 * A trilha é derivada da URL. Cada segmento vira um rótulo por esta ordem:
 *   1. Segmento dinâmico (UUID / numérico) → nome do escopo ou rótulo do recurso pai
 *   2. Item da sidebar cuja URL bate com o caminho (com ou sem o id de escopo)
 *   3. "new" com rótulo contextual pelo recurso pai
 *   4. Mapa estático `SEGMENT_PT`
 *   5. O próprio segmento (último recurso — aparece cru na UI, é o que os testes barram)
 *
 * O passo 2 compara também o caminho SEM o id de escopo (`/unit/3/reconciliation` →
 * `/unit/reconciliation`), porque as URLs da sidebar são as bases sem escopo: sem isso
 * nenhum módulo com escopo casava e todas as páginas caíam no mapa estático.
 */

import type { NavItem } from "@/components/layout/sidebar/NavItems"
import type { ScopeContext } from "@/types/domain/scope"

export type Crumb = { to: string; label: string }

/** Tradução estática de segmentos de URL para português */
export const SEGMENT_PT: Record<string, string> = {
	// Módulos (raiz)
	diner: "Comensal",
	messhall: "Fiscal",
	unit: "Gestão Unidade",
	kitchen: "Gestão Cozinha",
	"kitchen-production": "Produção Cozinha",
	storage: "Estoque",
	"local-analytics": "Análises Locais",
	global: "Catálogo Global",
	admin: "Administração do Sistema",
	analytics: "Análises",
	// Páginas
	hub: "Hub",
	menu: "Cardápio",
	forecast: "Previsão",
	"qr-code": "QR Code",
	"self-check-in": "Auto Check-in",
	"mcp-keys": "Chaves MCP",
	chat: "Assistente IA",
	profile: "Perfil",
	presence: "Presenças",
	planning: "Planejamento",
	procurement: "Atas",
	suprimentos: "Suprimentos",
	recipes: "Preparações",
	"frozen-preparations": "Preparações Congeladas",
	"weekly-menus": "Cardápios Semanais",
	"weekly-plans": "Planos Semanais",
	ingredients: "Insumos",
	permissions: "Permissões",
	evaluation: "Avaliação",
	"review-queues": "Filas de Revisão",
	training: "Ambiente de Treino",
	changelog: "Registro de Alterações",
	tutorial: "Tutorial",
	dashboard: "Painel",
	indicators: "Indicadores",
	events: "Eventos",
	exceptions: "Exceções",
	"compras-sync": "Sincronização Compras",
	"nutrition-sync": "Sincronização Nutrição",
	"sync-routines": "Rotinas de Sincronização",
	"places-manager": "Gerenciador de Locais",
	policy: "Política",
	// Orçamento / execução financeira (unit)
	credit: "Crédito Disponível",
	empenhos: "Empenhos",
	liquidations: "Liquidações",
	payments: "Pagamentos",
	siafi: "SIAFI",
	reconciliation: "Conciliação",
	// Estoque (storage)
	nfe: "Notas Fiscais",
	"supply-orders": "Ordens de Fornecimento",
	receiving: "Recebimentos",
	"production-issue": "Baixa por Produção",
	counts: "Contagem Física",
	reports: "Relatórios",
	replenishment: "Reposição",
	// Sub-páginas
	new: "Novo",
	print: "Imprimir",
	fork: "Derivar",
	versions: "Versões",
	settings: "Configurações",
}

/** Quando um segmento é um ID, o rótulo é inferido do recurso pai */
export const ID_LABEL_BY_PARENT: Record<string, string> = {
	recipes: "Preparação",
	"weekly-menus": "Cardápio Semanal",
	"weekly-plans": "Plano Semanal",
	events: "Evento",
	exceptions: "Exceção",
	suprimentos: "Rascunho",
	procurement: "ATA",
	ingredients: "Insumo",
	nfe: "NF-e",
	receiving: "Recebimento",
}

/** Rótulo contextual para o segmento "new" conforme o recurso pai */
export const NEW_LABEL_BY_PARENT: Record<string, string> = {
	recipes: "Nova Preparação",
	"weekly-menus": "Novo Cardápio",
	"weekly-plans": "Novo Plano",
	events: "Novo Evento",
	exceptions: "Nova Exceção",
	suprimentos: "Novo Rascunho",
	procurement: "Nova ATA",
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NUMERIC_RE = /^\d+$/

export const isId = (seg: string) => UUID_RE.test(seg) || NUMERIC_RE.test(seg)

/** Segmentos que não nomeiam um recurso — pulados ao procurar o pai de um id */
const TRANSPARENT_SEGMENTS = new Set(["print"])

/**
 * Caminho sem o id de escopo: `/unit/3/reconciliation` → `/unit/reconciliation`.
 * Retorna `null` quando o caminho não é escopado (nada a remover).
 */
function unscopedPath(segments: string[]): string | null {
	if (segments.length < 2 || !isId(segments[1] as string)) return null
	return `/${[segments[0], ...segments.slice(2)].join("/")}`
}

export function buildCrumbs(pathname: string, navItems: NavItem[], scopeContext?: ScopeContext): Crumb[] {
	const path = pathname.replace(/\/+$/, "")
	if (!path || path === "/") {
		return [{ to: "/hub", label: "Hub" }]
	}

	const segments = path.split("/").filter(Boolean)

	// A URL do item pode terminar em "/" (rota index do módulo escopado, ex: "/messhall/"),
	// e nesse caso só pode casar com o caminho já desescopado — nunca com o segmento do
	// módulo sozinho, que é o nome do módulo e não o da página.
	const matchNavItem = (fullSegments: string[], fullPath: string) => {
		const unscoped = unscopedPath(fullSegments)
		return navItems.find((n) => n.to === fullPath || (unscoped !== null && (n.to === unscoped || n.to === `${unscoped}/`)))?.label
	}

	let acc = ""
	/** Último segmento que nomeia um recurso — pai dos ids e do "new" */
	let parentKey: string | undefined

	return segments.map((seg, i) => {
		acc += `/${seg}`
		const fullSegments = segments.slice(0, i + 1)

		const label = (() => {
			// 1. Segmento dinâmico
			if (isId(seg)) {
				if (scopeContext && Number(seg) === scopeContext.id) return scopeContext.name
				return ID_LABEL_BY_PARENT[parentKey ?? ""] ?? "Detalhe"
			}
			// 2. Item da sidebar (caminho exato ou sem o id de escopo)
			const navLabel = matchNavItem(fullSegments, acc)
			if (navLabel) return navLabel
			// 3. "new" contextual
			if (seg === "new") return NEW_LABEL_BY_PARENT[parentKey ?? ""] ?? "Novo"
			// 4. Mapa estático
			return SEGMENT_PT[seg] ?? seg
		})()

		if (!isId(seg) && !TRANSPARENT_SEGMENTS.has(seg) && seg !== "new") parentKey = seg

		return { to: acc, label }
	})
}
