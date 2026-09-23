// components/MessHallSelector.tsx (previously UnitSelector.tsx)

import { AlertCircle, MapPin } from "lucide-react"
import { memo, useCallback, useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { useMessHalls } from "@/hooks/data/useMessHalls"
import { cn } from "@/lib/cn"

interface MessHallSelectorProps {
	value: string
	onChange: (value: string) => void
	disabled?: boolean
	// Prefer hasDefaultMessHall; keep hasDefaultUnit for backward compatibility
	hasDefaultMessHall?: boolean
	hasDefaultUnit?: boolean // deprecated, kept for compatibility during migration
	showValidation?: boolean
	showLabel?: boolean
	size?: "sm" | "md" | "lg"
	placeholder?: string
}

export const MessHallSelector = memo<MessHallSelectorProps>(
	({
		value,
		onChange,
		disabled = false,
		hasDefaultMessHall,
		hasDefaultUnit, // deprecated
		showValidation = false,
		showLabel = true,
		size = "md",
		placeholder = "Selecione um rancho...",
	}) => {
		const { messHalls } = useMessHalls()

		// Unify default flag (support old prop name for now)
		const hasDefault = hasDefaultMessHall ?? hasDefaultUnit ?? false

		// Dados memoizados
		const selectorData = useMemo(() => {
			const selectedMessHall = (messHalls ?? []).find((mh) => mh.code === value)
			const isValidSelection = Boolean(selectedMessHall)

			return {
				selectedMessHall,
				isValidSelection,
			}
		}, [value, messHalls])

		// Classes memoizadas — apenas overrides sobre o CVA do SelectTrigger
		const classes = useMemo(() => {
			const isInvalid = showValidation && !selectorData.isValidSelection && Boolean(value)

			return {
				trigger: cn(
					"w-full",
					size === "sm" && "text-sm",
					size === "lg" && "text-lg",
					hasDefault && "bg-accent/10",
					isInvalid && "border-destructive/50 bg-destructive/10"
				),
				label: cn("text-subheading flex items-center justify-between", disabled ? "text-muted-foreground" : "text-foreground"),
				container: "space-y-2",
				isInvalid,
			}
		}, [disabled, hasDefault, showValidation, selectorData.isValidSelection, value, size])

		// Handler memoizado
		const handleChange = useCallback(
			(newValue: string | null) => {
				if (disabled || !newValue || newValue === value) return
				onChange(newValue)
			},
			[disabled, value, onChange]
		)

		// Opções do combobox — são ~70 ranchos, longe do que se percorre com os olhos.
		const messHallOptions = useMemo(
			() => (messHalls ?? []).map((mh) => ({ value: mh.code, label: mh.display_name ?? mh.code, keywords: mh.code })),
			[messHalls]
		)

		// Badges/indicadores à direita do label
		const indicators = useMemo(() => {
			const badges = []

			if (hasDefault) {
				badges.push(
					<Badge key="default" variant="secondary" className="text-xs">
						Padrão
					</Badge>
				)
			}

			if (classes.isInvalid) {
				badges.push(
					<Badge key="invalid" variant="destructive" className="text-xs">
						Inválido
					</Badge>
				)
			}

			return badges
		}, [hasDefault, classes.isInvalid])

		const { isInvalid } = classes
		const { isValidSelection } = selectorData

		return (
			<div className={classes.container}>
				{showLabel && (
					<Label className={classes.label}>
						<div className="flex items-center space-x-1">
							<MapPin className="size-4" />
							<span>Rancho:</span>
						</div>

						<div className="flex items-center space-x-2">
							{indicators}
							{isInvalid && <AlertCircle className="size-4 text-destructive" />}
						</div>
					</Label>
				)}

				<SearchableSelect
					value={value || null}
					onValueChange={handleChange}
					options={messHallOptions}
					disabled={disabled}
					placeholder={placeholder}
					searchPlaceholder="Pesquisar rancho…"
					emptyLabel="Nenhum rancho encontrado."
					className={classes.trigger}
					aria-invalid={isInvalid}
					aria-label="Rancho responsável"
				/>

				{/* Informação adicional para rancho padrão */}
				{showLabel && hasDefault && (
					<div className="text-xs text-muted-foreground flex items-center space-x-1">
						<AlertCircle className="size-3" />
						<span>Este é o rancho padrão configurado</span>
					</div>
				)}

				{/* Validação de erro */}
				{showLabel && showValidation && !isValidSelection && value && (
					<div className="text-xs text-destructive flex items-center space-x-1">
						<AlertCircle className="size-3" />
						<span>Rancho não encontrado: "{value}"</span>
					</div>
				)}
			</div>
		)
	}
)

MessHallSelector.displayName = "MessHallSelector"
