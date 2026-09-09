import type { UserPermission } from "@iefa/pbac"
import { hasPermission } from "@iefa/pbac"
import { Boxes, Calculator, KeyRound, type LucideIcon, ShieldUser } from "lucide-react"
import { sucontTools } from "#/lib/data"
import { findToolByPath } from "#/lib/tool-nav"
import type { SucontDivision, Tool } from "#/lib/types"

/**
 * Módulos do sucont — o recorte de mais alto nível do app.
 *
 * Três deles são as DIVISÕES da SUCONT que o hub reúne (SUCONT-1, SUCONT-3 e
 * SUCONT-4): o app nasceu inteiro rotulado "SUCONT-4 HUB", mas metade das
 * ferramentas é da SUCONT-3 — as trilhas do RAC assinam "SUCONT-3" nas mensagens
 * que mandam às UGs, e o Centro de Monitoramento é o inventário da própria
 * SUCONT-3. O quarto módulo, `admin`, é governança do app.
 *
 * A diferença entre os dois tipos de módulo está em COMO se sabe em qual se está:
 *
 * - `admin` tem rota própria (`/admin`), então o caminho basta.
 * - as divisões COMPARTILHAM as rotas — `/auditor` é da 4, `/conta-generica` é da
 *   3, e as duas moram na raiz. Não há prefixo que as separe, e por isso a divisão
 *   ativa vem de `?divisao=` na URL, do mesmo jeito que `?q=`, `?etapa=` e `?rac=`.
 *   Dentro de uma ferramenta, quem manda é a divisão DELA: abrir o link direto de
 *   `/conta-generica` mostra a barra da SUCONT-3 sem precisar do parâmetro.
 *
 * Módulo NÃO é módulo do PBAC: os quatro vivem sob o grant `sucont` e se
 * distinguem pelo nível (`minLevel`). Criar módulo PBAC por divisão obrigaria a
 * conceder o mesmo acesso várias vezes.
 */
export interface SucontModule {
	id: "sucont-1" | "sucont-3" | "sucont-4" | "admin"
	/** Nome no seletor e no cabeçalho da barra lateral. */
	label: string
	/**
	 * Segunda linha do seletor. Curta de propósito: o gatilho tem 16rem menos o
	 * ladrilho e o chevron, e "Acompanhamento Patrimonial" saía cortado com
	 * reticências. O nome por extenso de cada divisão está em `SucontDivision`.
	 */
	caption: string
	icon: LucideIcon
	/** Rota de entrada. */
	home: string
	/**
	 * Divisão que o módulo representa. `null` no `admin`, que não é divisão da
	 * SUCONT e sim a administração do próprio app.
	 */
	division: SucontDivision | null
	/** Prefixo de rota exclusivo, quando existe. Só o `admin` tem. */
	basePath: string | null
	/** Nível mínimo do grant `sucont` para entrar. */
	minLevel: number
	/** Ladrilho do ícone. */
	tileClassName: string
}

export const SUCONT_MODULES: SucontModule[] = [
	{
		id: "sucont-4",
		label: "SUCONT-4",
		caption: "Patrimonial",
		icon: Boxes,
		home: "/",
		division: "sucont-4",
		basePath: null,
		minLevel: 1,
		tileClassName: "bg-tech-blue text-white",
	},
	{
		id: "sucont-3",
		label: "SUCONT-3",
		caption: "Contábil",
		icon: Calculator,
		home: "/",
		division: "sucont-3",
		basePath: null,
		minLevel: 1,
		tileClassName: "bg-action/15 text-action",
	},
	{
		id: "sucont-1",
		label: "SUCONT-1",
		caption: "Custos (DGC)",
		icon: Calculator,
		home: "/",
		division: "sucont-1",
		basePath: null,
		minLevel: 1,
		tileClassName: "bg-success/15 text-success",
	},
	{
		id: "admin",
		label: "Administração",
		caption: "Acessos do SUCONT",
		icon: ShieldUser,
		home: "/admin",
		division: null,
		basePath: "/admin",
		minLevel: 3,
		tileClassName: "bg-destructive/15 text-destructive",
	},
]

/** Navegação do módulo `admin`. As divisões montam a delas a partir do catálogo. */
export const ADMIN_NAV: Array<{ to: string; label: string; icon: LucideIcon }> = [{ to: "/admin/permissoes", label: "Permissões", icon: KeyRound }]

/**
 * Divisão padrão — a que responde quando a URL não diz e a rota não denuncia.
 *
 * É a SUCONT-4 porque era o app inteiro antes desta divisão existir: manter o
 * padrão preserva o que um link antigo, sem `?divisao=`, sempre mostrou.
 */
export const DEFAULT_DIVISION: SucontDivision = "sucont-4"

const MODULE_BY_DIVISION = new Map(SUCONT_MODULES.filter((m) => m.division).map((m) => [m.division as SucontDivision, m]))

/** Módulo da divisão, ou o padrão se a divisão não existir. */
export function moduleForDivision(division: SucontDivision | null | undefined): SucontModule {
	return MODULE_BY_DIVISION.get(division ?? DEFAULT_DIVISION) ?? (MODULE_BY_DIVISION.get(DEFAULT_DIVISION) as SucontModule)
}

/** A string é uma divisão conhecida? Guarda para o valor que chega da URL. */
export function isDivision(value: unknown): value is SucontDivision {
	return typeof value === "string" && MODULE_BY_DIVISION.has(value as SucontDivision)
}

/**
 * A ferramenta pertence à divisão?
 *
 * Ferramenta SEM `divisions` pertence a todas — é o sistema federal e o caderno
 * sem dono, que não somem do catálogo de ninguém. Ver `Tool.divisions`.
 */
export function toolBelongsTo(tool: Tool, division: SucontDivision): boolean {
	return tool.divisions === undefined || tool.divisions.includes(division)
}

/** As ferramentas da divisão, na ordem do catálogo. */
export function toolsForDivision(tools: Tool[], division: SucontDivision): Tool[] {
	return tools.filter((tool) => toolBelongsTo(tool, division))
}

/**
 * Módulo em que a navegação está.
 *
 * A ordem das perguntas importa:
 * 1. `/admin` tem rota própria e vence sempre.
 * 2. Dentro de uma FERRAMENTA, a divisão dela decide — e se ela serve a duas, a
 *    da URL desempata. Sem isso, abrir o link de uma ferramenta da SUCONT-3 com o
 *    padrão da SUCONT-4 mostraria uma barra lateral que não contém a tela aberta.
 * 3. Fora de ferramenta (catálogo, área de trabalho, relatórios), manda a URL.
 */
export function findModuleByPath(pathname: string, division?: unknown): SucontModule {
	const admin = SUCONT_MODULES.find((m) => m.basePath && isUnder(pathname, m.basePath))
	if (admin) return admin

	const requested = isDivision(division) ? division : null
	const tool = findToolByPath(sucontTools, pathname)

	if (tool?.divisions && tool.divisions.length > 0) {
		if (requested && tool.divisions.includes(requested)) return moduleForDivision(requested)
		return moduleForDivision(tool.divisions[0])
	}

	return moduleForDivision(requested)
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

/** Casa o caminho exato ou um filho — `startsWith` cru faria `/administrativo` cair em `/admin`. */
function isUnder(pathname: string, base: string): boolean {
	const path = normalize(pathname)
	const target = normalize(base)
	return path === target || path.startsWith(`${target}/`)
}

/** Remove a barra final para que `/admin/` e `/admin` sejam o mesmo caminho. */
function normalize(path: string): string {
	return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path
}
