import type { AppModule, UserPermission } from "@iefa/pbac"
import { hasPermission } from "@iefa/pbac"
import { Community, DocMagnifyingGlass, Flask, Key, Megaphone, MultiplePages, PageSearch, TaskList } from "iconoir-react"
import type { ComponentType, SVGProps } from "react"

/**
 * Módulos do contrate — o recorte de mais alto nível do app, no mesmo molde do
 * sisub e do sucont: cada módulo tem prefixo de rota próprio, barra lateral própria
 * e só aparece no seletor para quem pode abri-lo.
 *
 * A separação é cognitiva antes de ser de permissão: o analista de controle
 * interno, o pregoeiro e quem calibra o α fazem trabalhos diferentes, e uma barra
 * que misturasse os três obrigaria cada um a ler o menu dos outros para achar o seu.
 * Por isso a navegação de um módulo nunca aponta para dentro de outro — trocar de
 * módulo é sempre pelo seletor.
 *
 * O acesso aqui é conveniência de tela. Quem decide é o servidor: a API do α para
 * `aci` e `alpha`, e `requireAlphaAdmin` para `admin`.
 */

type Icon = ComponentType<SVGProps<SVGSVGElement>>

export type ContrateModuleId = "aci" | "pregoeiro" | "alpha" | "admin"

export interface ModuleNavItem {
	to: string
	label: string
	icon: Icon
	/** Só ativo no caminho exato — o painel do módulo, que é prefixo de todos os outros. */
	exact?: boolean
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
	/** Rota de entrada. */
	home: string
	/** Prefixo exclusivo: é por ele que se sabe em qual módulo a navegação está. */
	basePath: string
	/**
	 * Grant exigido. `null` é módulo aberto sem login (a biblioteca do pregoeiro:
	 * escrever frase ou preferência é que exige sessão).
	 */
	requires: { module: AppModule; minLevel: number } | null
	nav: readonly ModuleNavItem[]
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
		// Nível 2 (Licitações) em diante: a fila lista os processos de TODOS os
		// requisitantes, e é esse o corte do `can_see_all` que a API do α aplica.
		requires: { module: "alpha", minLevel: 2 },
		nav: [
			{ to: "/aci", label: "Painel", icon: TaskList, exact: true },
			{ to: "/aci/nova", label: "Nova análise", icon: DocMagnifyingGlass },
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
		requires: null,
		nav: [{ to: "/pregoeiro", label: "Frases", icon: Megaphone, exact: true }],
	},
	{
		id: "alpha",
		label: "Console α",
		caption: "Calibração",
		description: "Fontes normativas, bancada de regras e análises avulsas — onde se calibra a verificação antes de ela chegar ao analista.",
		audience: "Calibração",
		icon: Flask,
		home: "/alpha/fontes",
		basePath: "/alpha",
		requires: { module: "alpha", minLevel: 3 },
		nav: [
			{ to: "/alpha/fontes", label: "Fontes", icon: MultiplePages },
			{ to: "/alpha/analise/nova", label: "Nova análise", icon: PageSearch },
			{ to: "/alpha/bancada", label: "Bancada", icon: Flask },
		],
	},
	{
		id: "admin",
		label: "Acessos",
		caption: "Administração",
		description: "Concessão e revogação dos perfis do Projeto α.",
		audience: "Administração",
		icon: Key,
		home: "/admin/acessos",
		basePath: "/admin",
		requires: { module: "alpha-admin", minLevel: 3 },
		nav: [{ to: "/admin/acessos", label: "Acessos", icon: Community }],
	},
]

function isUnder(pathname: string, basePath: string): boolean {
	return pathname === basePath || pathname.startsWith(`${basePath}/`)
}

/** Módulo dono do caminho, ou `null` fora de módulo (home, auth, páginas legais). */
export function findModuleByPath(pathname: string): ContrateModule | null {
	return CONTRATE_MODULES.find((m) => isUnder(pathname, m.basePath)) ?? null
}

/** O usuário alcança o módulo? Módulo aberto (`requires: null`) vale até sem sessão. */
export function canAccessModule(module: ContrateModule, permissions: readonly UserPermission[]): boolean {
	return module.requires === null || hasPermission([...permissions], module.requires.module, module.requires.minLevel)
}

/** Os módulos que o usuário alcança, na ordem do registro. */
export function accessibleModules(permissions: readonly UserPermission[]): ContrateModule[] {
	return CONTRATE_MODULES.filter((m) => canAccessModule(m, permissions))
}
