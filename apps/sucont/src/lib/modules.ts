import type { UserPermission } from "@iefa/pbac"
import { hasPermission } from "@iefa/pbac"
import { KeyRound, type LucideIcon, Monitor, ShieldUser } from "lucide-react"

/**
 * Módulos do sucont — o recorte de mais alto nível do app.
 *
 * Um módulo é um conjunto de telas com um propósito e um nível de acesso próprios,
 * e trocar de módulo troca a barra lateral inteira. Existem dois:
 *
 * - `hub`   — o SUCONT-4 em si: catálogo, área de trabalho, relatórios e as doze
 *             ferramentas. É o padrão, e vale para qualquer rota que não seja de
 *             outro módulo.
 * - `admin` — administração do próprio sucont: quem tem acesso e em que nível.
 *             Governança de plataforma, rara e de alto risco, separada do trabalho
 *             diário — a mesma divisão que o sisub faz entre `global` e `admin`.
 *
 * O módulo NÃO é um módulo do PBAC: os dois vivem sob o grant `sucont` e se
 * distinguem pelo nível (`minLevel`). Criar um módulo PBAC novo obrigaria a
 * conceder duas vezes o mesmo acesso.
 */
export interface SucontModule {
	id: "hub" | "admin"
	/** Nome no seletor e no cabeçalho da barra lateral. */
	label: string
	/** Segunda linha do seletor — de quem é o módulo. */
	caption: string
	icon: LucideIcon
	/** Rota de entrada: para onde o seletor navega. */
	home: string
	/**
	 * Prefixo de rota que pertence ao módulo. `null` é o módulo padrão — recebe
	 * tudo que nenhum outro reivindica, e por isso vem por último na busca.
	 */
	basePath: string | null
	/** Nível mínimo do grant `sucont` para entrar. */
	minLevel: number
	/** Ladrilho do ícone. O azul sólido é a marca do hub; o resto usa tinta. */
	tileClassName: string
}

export const SUCONT_MODULES: SucontModule[] = [
	{
		id: "hub",
		label: "SUCONT-4 HUB",
		caption: "DIREF • COMAER",
		icon: Monitor,
		home: "/",
		basePath: null,
		minLevel: 1,
		tileClassName: "bg-tech-blue text-white",
	},
	{
		id: "admin",
		label: "Administração",
		caption: "Acessos do SUCONT",
		icon: ShieldUser,
		home: "/admin",
		basePath: "/admin",
		minLevel: 3,
		tileClassName: "bg-destructive/15 text-destructive",
	},
]

/** Navegação do módulo `admin`. O `hub` monta a dele a partir do catálogo de ferramentas. */
export const ADMIN_NAV: Array<{ to: string; label: string; icon: LucideIcon }> = [{ to: "/admin/permissoes", label: "Permissões", icon: KeyRound }]

/** Módulo padrão — o que responde por toda rota não reivindicada. */
const DEFAULT_MODULE = SUCONT_MODULES[0] as SucontModule

/**
 * Módulo a que a rota atual pertence.
 *
 * Casa o caminho exato ou um filho dele, nunca por prefixo solto: `startsWith`
 * cru faria `/administrativo` cair dentro de `/admin`.
 */
export function findModuleByPath(pathname: string): SucontModule {
	const path = normalize(pathname)
	for (const module of SUCONT_MODULES) {
		if (!module.basePath) continue
		const base = normalize(module.basePath)
		if (path === base || path.startsWith(`${base}/`)) return module
	}
	return DEFAULT_MODULE
}

/**
 * Módulos que o usuário pode abrir, na ordem do registro.
 *
 * A tela nunca oferece o que a política nega: sem nível 3 a Administração não
 * aparece no seletor, em vez de aparecer e devolver um redirecionamento.
 */
export function accessibleModules(permissions: UserPermission[]): SucontModule[] {
	return SUCONT_MODULES.filter((module) => hasPermission(permissions, "sucont", module.minLevel))
}

/** Remove a barra final para que `/admin/` e `/admin` sejam o mesmo caminho. */
function normalize(path: string): string {
	return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path
}
