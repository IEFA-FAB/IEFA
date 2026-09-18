/**
 * Escopo de OM na URL — o `$unitId` dos módulos do Projeto α.
 *
 * O mesmo desenho do sisub (`/unit/$unitId/...`): a OM em que se trabalha é propriedade da
 * URL, não estado de componente nem preferência gravada. Um link copiado abre a mesma OM
 * para quem o recebe (se ela estiver na cobertura dele), o F5 não perde a escolha, e não há
 * cookie nem `localStorage` a declarar na Política de Cookies.
 *
 * O segmento aceita três formas:
 *   - o id numérico de uma OM da cobertura do papel;
 *   - `todas`, só para quem tem o papel GLOBAL — sem recorte de OM;
 *   - `minhas`, só no módulo Requisitante e para quem não é global lá — os documentos que
 *     a própria pessoa enviou (enviar não exige papel, e a OM do envio pode estar fora da
 *     cobertura dela: sem `minhas`, o documento enviado sumiria das listas de quem o enviou).
 * Qualquer outro valor é devolvido ao hub do módulo.
 *
 * Tudo aqui é PURO: a cobertura chega pronta do α (`/me/access`, já expandida pela
 * hierarquia de apoio) e este arquivo só a transforma em opções de tela. Quem decide o
 * acesso é o α, que responde 403 à OM fora da cobertura mesmo que a tela a oferecesse.
 */

import type { AccessUnit, UnitOption, UnitSet } from "@iefa/alpha-client/access"

/** Segmento do escopo global: sem recorte de OM. */
export const ALL_UNITS_SCOPE = "todas"
/** Segmento do escopo pessoal: os documentos que a própria pessoa enviou. */
export const PERSONAL_SCOPE = "minhas"

export type ScopeKind = "unit" | "all" | "personal"

/**
 * Uma opção de escopo — e, depois de resolvida pela rota, o `scopeContext` que ela entrega
 * às telas filhas e à casca.
 */
export interface ScopeOption {
	/** O valor do segmento `$unitId` na URL. */
	id: string
	kind: ScopeKind
	/** A OM, quando o escopo é de uma OM só. */
	unitId: number | null
	/** Rótulo curto: a sigla da OM, ou o nome do escopo especial. */
	label: string
	/** Segunda linha: o nome por extenso da OM, quando difere da sigla. */
	caption: string | null
}

export type ScopeContext = ScopeOption

export const ALL_UNITS_OPTION: ScopeOption = {
	id: ALL_UNITS_SCOPE,
	kind: "all",
	unitId: null,
	label: "Todas as OMs",
	caption: "Sem recorte de OM",
}

export const PERSONAL_OPTION: ScopeOption = {
	id: PERSONAL_SCOPE,
	kind: "personal",
	unitId: null,
	label: "Minhas submissões",
	caption: "Os documentos que você enviou",
}

type UnitLike = Pick<AccessUnit, "id" | "code" | "display_name">

/** Sigla, com o nome por extenso quando ele diz algo a mais — o rótulo de OM do app inteiro. */
export function formatUnit(unit: UnitLike): string {
	return unit.display_name && unit.display_name !== unit.code ? `${unit.code} — ${unit.display_name}` : unit.code
}

function unitOption(id: number, unit: UnitLike | undefined): ScopeOption {
	return {
		id: String(id),
		kind: "unit",
		unitId: id,
		// A OM fora da lista (cadastro filtrado pelo α) ainda é da cobertura: some o nome, não o acesso.
		label: unit?.code ?? `OM ${id}`,
		caption: unit?.display_name && unit.display_name !== unit.code ? unit.display_name : null,
	}
}

const byLabel = (left: ScopeOption, right: ScopeOption) => left.label.localeCompare(right.label, "pt-BR")

/**
 * As opções de escopo de um papel.
 *
 * - cobertura `"all"` → `todas` primeiro, depois cada OM de `units` (a lista inteira: para o
 *   papel global o α devolve todas as OMs em `/me/access`);
 * - lista → uma opção por OM, na ordem da sigla;
 * - lista (vazia ou não) → mais `minhas` no fim, quando o módulo a oferece (`personal`). O
 *   global dispensa: `todas` já inclui o que ele enviou.
 */
export function buildScopeOptions(coverage: UnitSet, units: readonly UnitLike[], { personal = false } = {}): ScopeOption[] {
	const byId = new Map(units.map((unit) => [unit.id, unit]))

	if (coverage === "all") return [ALL_UNITS_OPTION, ...units.map((unit) => unitOption(unit.id, unit)).sort(byLabel)]

	const options = [...new Set(coverage)].map((id) => unitOption(id, byId.get(id))).sort(byLabel)
	return personal ? [...options, PERSONAL_OPTION] : options
}

/**
 * O segmento da URL, conferido contra as opções. `null` é "fora do que se pode abrir" — a
 * rota devolve ao hub. Só a forma canônica vale: `07` ou ` 7` não são o id 7, para a mesma
 * OM não ter duas URLs.
 */
export function resolveScopeParam(raw: string, options: readonly ScopeOption[]): ScopeOption | null {
	return options.find((option) => option.id === raw) ?? null
}

/**
 * Em que escopo abrir um processo da OM `unitId` — o redirecionamento das URLs antigas e o
 * destino depois do envio.
 *
 * A OM dele, se estiver entre as opções; senão `todas` (quem é global alcança tudo, inclusive
 * o registro sem OM); senão `minhas` (quem enviou sem ter papel). `null` quando nenhum serve.
 */
export function pickScopeForUnit(options: readonly ScopeOption[], unitId: number | null): ScopeOption | null {
	return (
		(unitId !== null ? options.find((option) => option.kind === "unit" && option.unitId === unitId) : undefined) ??
		options.find((option) => option.kind === "all") ??
		options.find((option) => option.kind === "personal") ??
		null
	)
}

/** Resumo do escopo para o cartão da home: "GAP-SJ", "3 OMs", "Todas as OMs". `null` sem opção. */
export function describeScope(options: readonly ScopeOption[]): string | null {
	if (options.some((option) => option.kind === "all")) return ALL_UNITS_OPTION.label
	const units = options.filter((option) => option.kind === "unit")
	if (units.length === 0) return options.some((option) => option.kind === "personal") ? PERSONAL_OPTION.label : null
	if (units.length === 1) return units[0]?.label ?? null
	return `${units.length} OMs`
}

export interface UnitGroup {
	/** Id da apoiadora que dá nome ao grupo, ou `null` para as OMs fora de qualquer apoio. */
	supportingUnitId: number | null
	label: string
	units: UnitOption[]
}

/**
 * OMs agrupadas pela hierarquia de APOIO, para o seletor do envio: a apoiadora abre o grupo
 * e as apoiadas vêm em seguida ("Apoio GAP-SJ": GAP-SJ, DCTA, IAE, IEFA-SJ). Quem envia
 * reconhece a OM pelo grupo em que ela trabalha, e o grupo antecipa quem mais vai enxergar o
 * documento (a apoiadora enxerga o fluxo das apoiadas).
 *
 * OM sem apoiadora e que não apoia ninguém vai para "Demais OMs", no fim. Apoiadora fora da
 * lista (filtrada pelo α) não forma grupo — sem ela não há sigla para o rótulo.
 */
export function groupUnitsBySupport(units: readonly UnitOption[]): UnitGroup[] {
	const byId = new Map(units.map((unit) => [unit.id, unit]))
	const supportsOthers = new Set(
		units.filter((unit) => unit.supporting_unit_id !== null && unit.supporting_unit_id !== unit.id).map((unit) => unit.supporting_unit_id as number)
	)

	const groups = new Map<number | null, UnitOption[]>()
	for (const unit of units) {
		const supporting = unit.supporting_unit_id
		const root =
			supporting !== null && supporting !== unit.id && byId.has(supporting) ? supporting : supportsOthers.has(unit.id) && byId.has(unit.id) ? unit.id : null
		const list = groups.get(root) ?? []
		list.push(unit)
		groups.set(root, list)
	}

	const byCode = (left: UnitOption, right: UnitOption) => left.code.localeCompare(right.code, "pt-BR")

	return [...groups.entries()]
		.map(([root, members]) => {
			const head = root === null ? undefined : members.find((unit) => unit.id === root)
			const rest = members.filter((unit) => unit !== head).sort(byCode)
			return {
				supportingUnitId: root,
				label: root === null ? "Demais OMs" : `Apoio ${byId.get(root)?.code ?? root}`,
				units: head ? [head, ...rest] : rest,
			}
		})
		.sort((left, right) => {
			if (left.supportingUnitId === null) return 1
			if (right.supportingUnitId === null) return -1
			return left.label.localeCompare(right.label, "pt-BR")
		})
}
