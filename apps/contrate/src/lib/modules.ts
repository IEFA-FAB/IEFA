import type { MeAccess, UnitSet } from "@iefa/alpha-client/access"
import { isEmptyCoverage, unionCoverage } from "@iefa/pbac"
import { CloudUpload, Community, Flask, Key, Megaphone, MultiplePages, PageEdit, TaskList } from "iconoir-react"
import type { ComponentType, SVGProps } from "react"
import { buildScopeOptions, type ScopeContext, type ScopeOption } from "./scope"

/**
 * Módulos do contrate — o recorte de mais alto nível do app, no mesmo molde do
 * sisub e do sucont: cada módulo tem prefixo de rota próprio, barra lateral própria
 * e só aparece no seletor para quem pode abri-lo.
 *
 * A separação é cognitiva antes de ser de permissão: quem envia o documento, o analista
 * de controle interno, o pregoeiro e quem calibra o α fazem trabalhos diferentes, e uma
 * barra que misturasse os quatro obrigaria cada um a ler o menu dos outros para achar o
 * seu. Por isso a navegação de um módulo nunca aponta para dentro de outro — trocar de
 * módulo é sempre pelo seletor.
 *
 * ## Papéis e OM
 *
 * O acesso vem do α (`GET /api/v1/me/access`): quatro papéis, cada um com a cobertura de
 * OMs já expandida pela hierarquia de apoio. Os módulos com escopo levam a OM na URL
 * (`/aci/$unitId/...`, ver `lib/scope.ts`) e entram por um hub que escolhe a OM — ou
 * que leva direto a ela quando só há uma.
 *
 * O acesso aqui é conveniência de tela. Quem decide é o servidor: a API do α para
 * `requisitante`, `aci` e `alpha`, e `requireAlphaAdmin` para `admin`.
 */

type Icon = ComponentType<SVGProps<SVGSVGElement>>

export type ContrateModuleId = "aci" | "requisitante" | "pregoeiro" | "alpha" | "admin"

/** Segmento da OM nos caminhos do registro — trocado pelo escopo aberto (`scopedPath`). */
export const UNIT_PARAM = "$unitId"

export interface ModuleNavItem {
	/** Caminho; nos módulos com escopo, contém `$unitId`. */
	to: string
	label: string
	icon: Icon
	/** Só ativo no caminho exato — o painel do módulo, que é prefixo de todos os outros. */
	exact?: boolean
}

/**
 * Quem abre o módulo.
 * - `public`: sem login (a biblioteca do pregoeiro — escrever preferência é que exige sessão);
 * - `authenticated`: qualquer sessão (enviar documento não exige papel no α);
 * - `role`: um predicado sobre o perfil do α.
 */
export type ModuleGate = { kind: "public" } | { kind: "authenticated" } | { kind: "role"; allows: (access: MeAccess) => boolean }

export interface ModuleScope {
	/** As OMs em que o módulo abre, a partir do perfil do α. */
	coverage: (access: MeAccess) => UnitSet
	/** Oferece `minhas` a quem não é global no papel (só o Requisitante): o que a pessoa enviou. */
	personal?: boolean
	/** Entrada do módulo DENTRO de uma OM — para onde leva a troca de OM. */
	index: string
}

export interface ContrateModule {
	id: ContrateModuleId
	/** Nome no seletor e no cabeçalho da barra lateral. */
	label: string
	/** Segunda linha do seletor. Curta: o gatilho tem 16rem menos o ladrilho e o chevron. */
	caption: string
	/** Frase da home, que apresenta o módulo a quem ainda não entrou. */
	description: string
	/** Para quem o módulo existe — o eyebrow do cartão da home. */
	audience: string
	icon: Icon
	/** Rota de entrada: o hub, nos módulos com escopo. */
	home: string
	/** Prefixo exclusivo: é por ele que se sabe em qual módulo a navegação está. */
	basePath: string
	gate: ModuleGate
	/** `null` é módulo sem OM na URL. */
	scope: ModuleScope | null
	nav: readonly ModuleNavItem[]
}

/** Quem enxerga a fila: licitações ou ACI, em alguma OM. */
const queueCoverage = (access: MeAccess): UnitSet => {
	const union = unionCoverage(access.roles.procurement, access.roles.aci)
	return union === "all" ? "all" : [...union]
}

export const CONTRATE_MODULES: readonly ContrateModule[] = [
	{
		id: "aci",
		label: "Plataforma ACI",
		caption: "Conformidade",
		description: "Fila dos processos em verificação, triagem de cada achado e parecer de conformidade com relatório final.",
		audience: "Controle interno",
		icon: TaskList,
		home: "/aci",
		basePath: "/aci",
		// A fila é de licitações e ACI, recortada pelas OMs que cada um cobre. Quem decide
		// triagem e parecer é o `can_decide` que o α calcula POR PROCESSO.
		gate: { kind: "role", allows: (access) => !isEmptyCoverage(queueCoverage(access)) },
		scope: { coverage: queueCoverage, index: "/aci/$unitId" },
		nav: [{ to: "/aci/$unitId", label: "Fila", icon: TaskList, exact: true }],
	},
	{
		id: "requisitante",
		label: "Requisitante",
		caption: "Envio e acompanhamento",
		description: "Envio do ETP, TR ou edital e acompanhamento da verificação — os processos da sua OM, inclusive os dos colegas.",
		audience: "Quem elabora a contratação",
		icon: PageEdit,
		home: "/requisitante",
		basePath: "/requisitante",
		// Qualquer sessão: enviar documento não exige papel. O papel de requisitante só
		// amplia o que se ENXERGA — todas as submissões das OMs que ele cobre.
		gate: { kind: "authenticated" },
		scope: { coverage: (access) => access.roles.requester, personal: true, index: "/requisitante/$unitId" },
		nav: [
			{ to: "/requisitante/$unitId", label: "Processos", icon: MultiplePages, exact: true },
			{ to: "/requisitante/$unitId/nova", label: "Enviar documento", icon: CloudUpload },
		],
	},
	{
		id: "pregoeiro",
		label: "Pregoeiro",
		caption: "Sessão pública",
		description: "Biblioteca de frases por fase do pregão, com as suas preferências salvas.",
		audience: "Sessão pública",
		icon: Megaphone,
		home: "/pregoeiro",
		basePath: "/pregoeiro",
		gate: { kind: "public" },
		scope: null,
		nav: [{ to: "/pregoeiro", label: "Frases", icon: Megaphone, exact: true }],
	},
	{
		id: "alpha",
		label: "Console α",
		caption: "Calibração",
		description: "Fontes normativas e bancada de regras — onde se calibra a verificação antes de ela chegar ao analista.",
		audience: "Calibração",
		icon: Flask,
		home: "/alpha/fontes",
		basePath: "/alpha",
		// Regra e fonte são catálogo de TODAS as OMs: só o ACI global cura (o α exige o mesmo).
		gate: { kind: "role", allows: (access) => access.roles.aci === "all" },
		scope: null,
		nav: [
			{ to: "/alpha/fontes", label: "Fontes", icon: MultiplePages },
			{ to: "/alpha/bancada", label: "Bancada", icon: Flask },
		],
	},
	{
		id: "admin",
		label: "Acessos",
		caption: "Administração",
		description: "Concessão e revogação dos papéis do Projeto α, por OM.",
		audience: "Administração",
		icon: Key,
		home: "/admin",
		basePath: "/admin",
		gate: { kind: "role", allows: (access) => !isEmptyCoverage(access.roles.admin) },
		scope: { coverage: (access) => access.roles.admin, index: "/admin/$unitId/acessos" },
		nav: [{ to: "/admin/$unitId/acessos", label: "Acessos", icon: Community }],
	},
]

export function getModule(id: ContrateModuleId): ContrateModule {
	const module = CONTRATE_MODULES.find((m) => m.id === id)
	if (!module) throw new Error(`Módulo desconhecido: ${id}`)
	return module
}

function isUnder(pathname: string, basePath: string): boolean {
	return pathname === basePath || pathname.startsWith(`${basePath}/`)
}

/** Módulo dono do caminho, ou `null` fora de módulo (home, auth, páginas legais). */
export function findModuleByPath(pathname: string): ContrateModule | null {
	return CONTRATE_MODULES.find((m) => isUnder(pathname, m.basePath)) ?? null
}

/** Troca `$unitId` pelo escopo aberto. O id vai codificado: é segmento de URL. */
export function scopedPath(template: string, scopeId: string): string {
	return template.replace(UNIT_PARAM, encodeURIComponent(scopeId))
}

/** O caminho depende de um escopo? */
export function isScopedPath(template: string): boolean {
	return template.includes(UNIT_PARAM)
}

/** Quem está olhando: com ou sem sessão, e o perfil do α quando ele já chegou. */
export interface Viewer {
	isAuthenticated: boolean
	access: MeAccess | undefined
}

/**
 * O usuário alcança o módulo? Módulo aberto vale até sem sessão; módulo por papel, só com o
 * perfil do α em mãos — perfil ainda carregando não abre nada.
 */
export function canAccessModule(module: ContrateModule, viewer: Viewer): boolean {
	switch (module.gate.kind) {
		case "public":
			return true
		case "authenticated":
			return viewer.isAuthenticated
		case "role":
			return viewer.isAuthenticated && viewer.access !== undefined && module.gate.allows(viewer.access)
	}
}

/** Os módulos que o usuário alcança, na ordem do registro. */
export function accessibleModules(viewer: Viewer): ContrateModule[] {
	return CONTRATE_MODULES.filter((m) => canAccessModule(m, viewer))
}

/** As OMs em que o módulo abre para este perfil. Vazio em módulo sem escopo. */
export function moduleScopeOptions(module: ContrateModule, access: MeAccess): ScopeOption[] {
	if (!module.scope) return []
	return buildScopeOptions(module.scope.coverage(access), access.units, { personal: module.scope.personal })
}

/**
 * Os itens do módulo com a OM aberta no lugar de `$unitId`. Sem OM (o hub do módulo), os
 * itens que dependem dela saem: `/aci/$unitId` não é caminho que o router conheça, e a tela
 * do hub já é a escolha da OM.
 */
export function resolveNavItems(module: ContrateModule, scope: ScopeContext | null): ModuleNavItem[] {
	return module.nav.flatMap((item) => {
		if (!isScopedPath(item.to)) return [item]
		return scope ? [{ ...item, to: scopedPath(item.to, scope.id) }] : []
	})
}
