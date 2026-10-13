/**
 * Registro de NAVEGAÇÃO dos módulos do SISPROV: ícone, rota de entrada, descrição para o hub.
 * O mapa papel → módulo PBAC, os níveis e os rótulos vêm de `@iefa/sisprov-domain/modules`,
 * a fonte única compartilhada com os gates de servidor; aqui só o que é de tela.
 *
 * Separado de `auth/pbac.ts` porque carrega ícones do lucide: os módulos de servidor não
 * importam daqui.
 */

import type { UserPermission } from "@iefa/pbac"
import { hasPermission } from "@iefa/pbac"
import { SISPROV_ADMIN_MODULE, SISPROV_MODULE_LABELS, SISPROV_PLANNING_MODULE, SISPROV_STOCK_MODULE, type SisprovModule } from "@iefa/sisprov-domain/modules"
import { CalendarRange, KeyRound, type LucideIcon, PackageOpen, ShieldUser } from "lucide-react"

export type NavModule = {
	id: SisprovModule
	label: string
	/** Segunda linha do card do hub e do item da sidebar. */
	caption: string
	/** O que o módulo vai fazer; o hub mostra enquanto o módulo está em fundação. */
	description: string
	icon: LucideIcon
	/** Rota de entrada e prefixo exclusivo. */
	basePath: "/stock" | "/planning" | "/admin"
	/** Nível mínimo do módulo PBAC para entrar. */
	minLevel: 1 | 2
	/** Cor do grupo, no vocabulário de tokens do hub do sisub. */
	color: "primary" | "warning" | "governance"
}

export const NAV_MODULES: readonly NavModule[] = [
	{
		id: SISPROV_STOCK_MODULE,
		label: SISPROV_MODULE_LABELS[SISPROV_STOCK_MODULE],
		caption: "Estoque de toda classe",
		description: "Locais de estoque que o seu acesso alcança (depósito, almoxarifado, rancho), com as classes que cada um guarda.",
		icon: PackageOpen,
		basePath: "/stock",
		minLevel: 1,
		color: "warning",
	},
	{
		id: SISPROV_PLANNING_MODULE,
		label: SISPROV_MODULE_LABELS[SISPROV_PLANNING_MODULE],
		caption: "Elo SISPROV na OM",
		description: "Previsão de incorporação da OM, acompanhamento da coleta de tamanhos e dos grupos de demanda.",
		icon: CalendarRange,
		basePath: "/planning",
		minLevel: 1,
		color: "primary",
	},
	{
		id: SISPROV_ADMIN_MODULE,
		label: SISPROV_MODULE_LABELS[SISPROV_ADMIN_MODULE],
		caption: "SDAB",
		description: "Grupos de demanda e enxovais, curvas de tamanhos, períodos de planejamento, aprovação de OF e acessos do sistema.",
		icon: ShieldUser,
		basePath: "/admin",
		minLevel: 2,
		color: "governance",
	},
]

/** Navegação interna do módulo Administração. */
export const ADMIN_NAV: ReadonlyArray<{ to: "/admin" | "/admin/permissoes"; label: string; icon: LucideIcon; minLevel: 2 | 3 }> = [
	{ to: "/admin", label: "Visão geral", icon: ShieldUser, minLevel: 2 },
	{ to: "/admin/permissoes", label: "Permissões", icon: KeyRound, minLevel: 3 },
]

/**
 * Módulos que o usuário pode abrir, na ordem do registro. A tela nunca oferece o que a
 * política nega: sem `sisprov-admin` a Administração não aparece no hub nem na sidebar.
 */
export function accessibleModules(permissions: readonly UserPermission[]): NavModule[] {
	return NAV_MODULES.filter((module) => hasPermission([...permissions], module.id, module.minLevel))
}

/** Módulo em que a navegação está, pelo prefixo da rota. `null` fora de módulo (hub). */
export function findModuleByPath(pathname: string): NavModule | null {
	const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname
	return NAV_MODULES.find((module) => path === module.basePath || path.startsWith(`${module.basePath}/`)) ?? null
}
