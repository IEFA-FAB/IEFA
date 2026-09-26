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
import { normalizePath, scopeUrl } from "@/lib/nav-paths"
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
	"local-analytics": "Análises da Unidade",
	global: "Catálogo Global",
	admin: "Administração do Sistema",
	analytics: "Análises Globais",
	// Páginas
	hub: "Hub",
	menu: "Cardápio",
	forecast: "Previsão",
	"qr-code": "QR Code",
	"self-check-in": "Auto Check-in",
	"mcp-keys": "Chaves MCP",
	security: "Segurança",
	chat: "Assistente IA",
	profile: "Perfil",
	presence: "Presenças",
	planning: "Agendamento da Produção",
	procurement: "Anexos Quantitativos",
	suprimentos: "Suprimentos",
	recipes: "Preparações",
	equipment: "Equipamentos",
	"procurement-plan": "Plano de Contratações",
	"frozen-preparations": "Preparações Congeladas",
	"weekly-menus": "Cardápios Semanais",
	"weekly-plans": "Planos Semanais",
	ingredients: "Insumos",
	permissions: "Permissões",
	evaluation: "Avaliação",
	"review-queues": "Filas de Revisão",
	training: "Ambiente de Treino",
	"audit-log": "Operações Sensíveis",
	"mfa-adoption": "Verificação em 2 Etapas",
	changelog: "Registro de Alterações",
	tutorial: "Tutorial",
	dashboard: "Painel",
	indicators: "Indicadores",
	workforce: "Efetivo dos Ranchos",
	events: "Eventos",
	exceptions: "Apoios",
	"snack-requests": "Pedidos de Lanche",
	production: "Produção do Dia",
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
	replenishment: "Sugestões de Reposição",
	scanner: "Testar leitor",
	adjustments: "Ajustes",
	opening: "Carga inicial",
	incoming: "A caminho",
	expiry: "Vencimentos",
	issue: "Saída do dia",
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
	exceptions: "Apoio",
	suprimentos: "Rascunho",
	"snack-requests": "Pedido",
	procurement: "Anexo",
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
	exceptions: "Novo Apoio",
	suprimentos: "Novo Rascunho",
	"snack-requests": "Novo Pedido",
	procurement: "Novo Anexo",
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
	const path = normalizePath(pathname)
	if (path === "/") {
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

/** O mínimo de `ModuleDef` que a trilha precisa — mantém este arquivo livre da cadeia de env da sidebar. */
export type CrumbModule = { id: string; name: string; hubUrl?: string; items: { title: string; url: string }[] }

/**
 * Crumb pronto para a UI: `to === null` é texto, não link. `isScope` marca o id do escopo
 * (cozinha/unidade) e `isRecord` o id de um registro — é nele que o nome do registro entra.
 */
export type NavCrumb = { key: string; label: string; to: string | null; isScope?: boolean; isRecord?: boolean }

/**
 * Decide para onde cada crumb aponta. A URL acumulada nem sempre é uma página:
 *
 *  - raiz do módulo (`/admin`, `/storage`) → hub de escopo ou primeiro item visível do módulo
 *    (`/admin` não tem rota index e dava "Página não encontrada");
 *  - id de escopo (`/storage/7`) → primeiro item do módulo dentro do escopo (o layout do
 *    escopo não tem index em estoque/análises da unidade e renderizava a página em branco);
 *  - segmento que não é rota por si (`print` em `print/$id`) → texto;
 *  - destino igual à página atual → texto (a seta "voltar" do mobile levava à própria página).
 *
 * Na rota index de um escopo (`/messhall/7`, `/kitchen-production/7`) o último segmento é o id,
 * então a página ganha o crumb do item index da sidebar ("Presenças", "Painel").
 *
 * `modules` são as URLs BASE da sidebar (sem escopo); o escopo sai da própria URL.
 */
export function linkCrumbs(crumbs: Crumb[], pathname: string, modules: CrumbModule[]): NavCrumb[] {
	const current = normalizePath(pathname)
	const segments = current.split("/").filter(Boolean)
	const mod = modules.find((m) => m.id === segments[0])
	const scopeId = segments[1] !== undefined && isId(segments[1]) && mod?.hubUrl ? segments[1] : null
	const firstItemUrl = mod?.items[0]?.url

	const out: NavCrumb[] = crumbs.map((crumb, i) => {
		const seg = segments[i] as string
		const isLast = i === crumbs.length - 1
		const isScope = i === 1 && scopeId !== null
		let to: string | null = crumb.to
		let label = crumb.label

		if (i === 0 && mod) {
			label = mod.name
			to = mod.hubUrl ?? firstItemUrl ?? null
		} else if (isScope && mod) {
			to = firstItemUrl ? scopeUrl(firstItemUrl, mod.id, seg) : null
		} else if (TRANSPARENT_SEGMENTS.has(seg) && !isLast) {
			to = null
		}

		if (to !== null && normalizePath(to) === current) to = null
		return { key: crumb.to, label, to, isScope, isRecord: !isScope && isId(seg) }
	})

	// Rota index do escopo: a página é o item index da sidebar (URL base terminada em "/")
	if (scopeId && segments.length === 2 && mod) {
		const indexItem = mod.items.find((it) => it.url === `/${mod.id}/`)
		if (indexItem) out.push({ key: `${current}#index`, label: indexItem.title, to: null })
	}

	return out
}

/**
 * Troca o rótulo genérico do registro aberto ("Preparação", "Evento") pelo nome dele — no
 * ÚLTIMO crumb de registro: em `/recipes/$id/versions` o nome fica no id, não em "Versões".
 */
export function applyEntityLabel(crumbs: NavCrumb[], label: string | null | undefined): NavCrumb[] {
	if (!label) return crumbs
	const target = crumbs.findLastIndex((c) => c.isRecord)
	if (target < 0) return crumbs
	return crumbs.map((c, i) => (i === target ? { ...c, label } : c))
}
