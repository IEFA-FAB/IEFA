import type { UnitOption } from "@iefa/alpha-client/access"
import { useMemo } from "react"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { formatUnit, groupUnitsBySupport } from "@/lib/scope"
import { cn } from "@/lib/utils"

/** Valor do grant sem OM — só o administrador global o vê (e só ele o concede). */
export const GLOBAL_UNIT = "global"

export type UnitChoice = number | typeof GLOBAL_UNIT

/**
 * Seletor de OM, ordenado pela hierarquia de APOIO (a apoiadora abre o bloco, as apoiadas
 * vêm em seguida) e com busca. Serve ao envio do documento e à concessão de acesso.
 *
 * O apoio deixou de ser cabeçalho de grupo e virou a segunda linha de cada item: com filtro
 * por texto, um rótulo de grupo que some quando a busca corta todos os filhos deixa o
 * resultado sem o contexto que ele carregava. Na linha do item, o contexto vem junto.
 *
 * `null` é "ainda não escolhida": o placeholder aparece e quem usa desabilita a ação — OM
 * errada decide quem enxerga o documento, então nada é pré-escolhido às cegas.
 */
export function UnitSelect({
	id,
	units,
	value,
	onChange,
	allowGlobal = false,
	placeholder = "selecione a OM",
	className,
	disabled,
}: {
	id?: string
	units: readonly UnitOption[]
	value: UnitChoice | null
	onChange: (value: UnitChoice | null) => void
	/** Oferece "Global (todas as OMs)" no topo. */
	allowGlobal?: boolean
	placeholder?: string
	className?: string
	disabled?: boolean
}) {
	const options = useMemo(() => {
		const fromGroups = groupUnitsBySupport(units).flatMap((group) =>
			group.units.map((unit) => ({
				value: String(unit.id),
				label: formatUnit(unit),
				hint: group.label,
				keywords: `${unit.code} ${unit.display_name ?? ""}`,
			}))
		)
		return allowGlobal ? [{ value: GLOBAL_UNIT, label: "Global (todas as OMs)" }, ...fromGroups] : fromGroups
	}, [units, allowGlobal])

	return (
		<SearchableSelect
			id={id}
			value={value === null ? null : String(value)}
			onValueChange={(next) => onChange(next === null ? null : next === GLOBAL_UNIT ? GLOBAL_UNIT : Number(next))}
			options={options}
			disabled={disabled}
			placeholder={placeholder}
			searchPlaceholder="Pesquisar OM…"
			emptyLabel="Nenhuma OM encontrada."
			unavailableLabel={typeof value === "number" ? `OM ${value}` : undefined}
			className={cn("w-full min-w-0 max-w-md", className)}
			aria-label="OM"
		/>
	)
}
