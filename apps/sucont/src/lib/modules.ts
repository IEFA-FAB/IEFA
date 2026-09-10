import type { AppModule, UserPermission } from "@iefa/pbac"
import { hasPermission } from "@iefa/pbac"
import { Boxes, Calculator, KeyRound, type LucideIcon, ShieldUser } from "lucide-react"
import { sucontTools } from "#/lib/data"
import { permissionModuleForDivision, SUCONT_ADMIN_MODULE, SUCONT_DIVISION_MODULES } from "#/lib/permission-modules"
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
 * Cada módulo É um módulo do PBAC (`sucont-1`, `sucont-3`, `sucont-4`,
 * `sucont-admin`), com grant próprio. Antes os quatro viviam sob um grant `sucont`
 * único e se distinguiam só pelo nível: quem entrava para trabalhar na SUCONT-3
 * abria o auditor da SUCONT-4 e o SAC-DGC da SUCONT-1 pelo mesmo grant. O escopo do
 * PBAC não serve aqui — ele é um id numérico de unidade/cozinha/refeitório, e
 * divisão da SUCONT não é nenhum dos três —, então a separação é por MÓDULO, como o
 * sisub faz entre `global` e `admin`.
 */
export interface SucontModule {
	id: "sucont-1" | "sucont-3" | "sucont-4" | "admin"
	/**
	 * Módulo do PBAC que governa o acesso. É o `id`, exceto no `admin`, cujo módulo
	 * se chama `sucont-admin` — a tabela `access_control.user_permissions` é
	 * compartilhada pelo ERP inteiro, e um módulo chamado só `admin` já é o do sisub.
	 */
	permissionModule: AppModule
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
	/** Nível mínimo do `permissionModule` para entrar. */
	minLevel: number
	/** Ladrilho do ícone. */
	tileClassName: string
}

export const SUCONT_MODULES: SucontModule[] = [
	{
		id: "sucont-4",
		permissionModule: "sucont-4",
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
		permissionModule: "sucont-3",
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
		permissionModule: "sucont-1",
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
		permissionModule: SUCONT_ADMIN_MODULE,
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
export function findModuleByPath(pathname: string, division?: unknown, fallback: SucontDivision = DEFAULT_DIVISION): SucontModule {
	const admin = SUCONT_MODULES.find((m) => m.basePath && isUnder(pathname, m.basePath))
	if (admin) return admin

	const requested = isDivision(division) ? division : null
	const tool = findToolByPath(sucontTools, pathname)

	if (tool?.divisions && tool.divisions.length > 0) {
		if (requested && tool.divisions.includes(requested)) return moduleForDivision(requested)
		return moduleForDivision(tool.divisions[0])
	}

	return moduleForDivision(requested ?? fallback)
}

/**
 * Divisão que responde quando a URL não diz — a primeira ACESSÍVEL, na ordem do
 * registro.
 *
 * Não é `DEFAULT_DIVISION` cru porque o padrão é a SUCONT-4, e com o acesso
 * separado por divisão nem todo mundo a tem: quem só trabalha na SUCONT-3 abriria
 * o hub num catálogo vazio, com a barra lateral de uma divisão que ele não pode
 * usar. Sem nenhuma divisão (só `sucont-admin`) devolve o padrão — o guard de rota
 * é quem barra, e inventar uma divisão aqui não concederia acesso nenhum.
 */
export function defaultDivisionFor(permissions: UserPermission[]): SucontDivision {
	const preferred = moduleForDivision(DEFAULT_DIVISION)
	if (hasPermission(permissions, preferred.permissionModule, 1)) return DEFAULT_DIVISION
	const first = SUCONT_MODULES.find((m) => m.division && hasPermission(permissions, m.permissionModule, 1))
	return (first?.division as SucontDivision | undefined) ?? DEFAULT_DIVISION
}

/**
 * Módulos que o usuário pode abrir, na ordem do registro.
 *
 * A tela nunca oferece o que a política nega: sem `sucont-admin` a Administração
 * não aparece no seletor, e sem `sucont-1` a divisão de Custos também não — em vez
 * de aparecerem e devolverem um redirecionamento.
 */
export function accessibleModules(permissions: UserPermission[]): SucontModule[] {
	return SUCONT_MODULES.filter((module) => hasPermission(permissions, module.permissionModule, module.minLevel))
}

/**
 * Módulos do PBAC que autorizam uma ferramenta.
 *
 * Ferramenta sem `divisions` pertence a todas (ver `Tool.divisions`), e por isso
 * qualquer divisão a abre. Ferramenta de duas divisões abre para quem tem
 * qualquer uma delas — `/monitoramento` é da 3 e da 4, e exigir as duas trancaria
 * fora os dois lados.
 */
export function permissionModulesForTool(tool: Tool): AppModule[] {
	if (!tool.divisions || tool.divisions.length === 0) return SUCONT_DIVISION_MODULES
	return tool.divisions.map(permissionModuleForDivision)
}

/**
 * Módulos que autorizam uma ROTA interna, a partir do catálogo.
 *
 * O guard de rota sai daqui, e não de uma segunda lista escrita à mão: a divisão
 * de cada ferramenta já está declarada em `sucontTools`, e uma cópia paralela
 * divergiria em silêncio — a tela sumiria do catálogo da divisão e continuaria
 * alcançável por URL.
 *
 * Caminho que não é de ferramenta (catálogo, área de trabalho, relatórios) volta
 * as três divisões: são telas da seção inteira.
 */
export function permissionModulesForPath(pathname: string): AppModule[] {
	const tool = findToolByPath(sucontTools, pathname)
	return tool ? permissionModulesForTool(tool) : SUCONT_DIVISION_MODULES
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
