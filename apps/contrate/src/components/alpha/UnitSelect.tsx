import type { UnitOption } from "@iefa/alpha-client/access"
import { useMemo } from "react"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatUnit, groupUnitsBySupport } from "@/lib/scope"
import { cn } from "@/lib/utils"

/** Valor do grant sem OM — só o administrador global o vê (e só ele o concede). */
export const GLOBAL_UNIT = "global"

export type UnitChoice = number | typeof GLOBAL_UNIT

/**
 * Seletor de OM, agrupado pela hierarquia de APOIO (a apoiadora abre o grupo, as apoiadas
 * vêm em seguida). Serve ao envio do documento e à concessão de acesso.
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
	const groups = useMemo(() => groupUnitsBySupport(units), [units])
	const selected = typeof value === "number" ? units.find((unit) => unit.id === value) : undefined
	const label = value === GLOBAL_UNIT ? "Global (todas as OMs)" : selected ? formatUnit(selected) : typeof value === "number" ? `OM ${value}` : placeholder

	return (
		<Select<UnitChoice | null> value={value} onValueChange={(next) => onChange(next)} disabled={disabled}>
			<SelectTrigger id={id} className={cn("w-full min-w-0 max-w-md", className)}>
				<SelectValue className={value === null ? "text-muted-foreground" : undefined}>{label}</SelectValue>
			</SelectTrigger>
			<SelectContent className="max-h-80" alignItemWithTrigger={false}>
				{allowGlobal ? (
					<>
						<SelectGroup>
							<SelectItem value={GLOBAL_UNIT}>Global (todas as OMs)</SelectItem>
						</SelectGroup>
						<SelectSeparator />
					</>
				) : null}
				{groups.map((group) => (
					<SelectGroup key={group.supportingUnitId ?? "demais"}>
						<SelectLabel className="text-label">{group.label}</SelectLabel>
						{group.units.map((unit) => (
							<SelectItem key={unit.id} value={unit.id}>
								<span className="font-medium">{unit.code}</span>
								{unit.display_name && unit.display_name !== unit.code ? <span className="truncate text-muted-foreground">{unit.display_name}</span> : null}
							</SelectItem>
						))}
					</SelectGroup>
				))}
			</SelectContent>
		</Select>
	)
}
