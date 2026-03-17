// components/MessHallSelector.tsx (previously UnitSelector.tsx)

import { AlertCircle, Check, MapPin } from "lucide-react"
import { memo, useCallback, useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
			const displayLabel = selectedMessHall?.display_name || value

			return {
				selectedMessHall,
				isValidSelection,
				displayLabel,
			}
		}, [value, messHalls])

		// Classes memoizadas — apenas overrides sobre o CVA do SelectTrigger
		const classes = useMemo(() => {
			const isInvalid = showValidation && !selectorData.isValidSelection && Boolean(value)

			return {
				trigger: cn(
					size === "sm" && "text-sm",
					size === "lg" && "text-lg",
					hasDefault && "bg-accent/10",
					isInvalid && "border-destructive/50 bg-destructive/10"
				),
				label: cn("text-sm font-medium flex items-center justify-between", disabled ? "text-muted-foreground" : "text-foreground"),
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

		// Itens do select
		const selectItems = useMemo(
			() =>
				(messHalls ?? []).map((mh) => (
					<SelectItem
						className="cursor-pointer hover:bg-accent/50 focus:bg-accent/50 data-[state=checked]:bg-accent/60 data-[state=checked]:text-accent-foreground transition-colors"
						key={mh.code}
						value={mh.code}
					>
						<div className="flex items-center justify-between w-full">
							<span>{mh.display_name ?? mh.code}</span>
							{value === mh.code && <Check className="h-4 w-4 text-primary ml-2" />}
						</div>
					</SelectItem>
				)),
			[value, messHalls]
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
		const { isValidSelection, displayLabel } = selectorData

		return (
			<div className={classes.container}>
				{showLabel && (
					<Label className={classes.label}>
						<div className="flex items-center space-x-1">
							<MapPin className="h-4 w-4" />
							<span>Rancho:</span>
						</div>

						<div className="flex items-center space-x-2">
							{indicators}
							{isInvalid && <AlertCircle className="h-4 w-4 text-destructive" />}
						</div>
					</Label>
				)}

				<Select value={value} onValueChange={handleChange} disabled={disabled}>
					<SelectTrigger className={classes.trigger} aria-invalid={isInvalid}>
						<SelectValue placeholder={placeholder}>
							{value && (
								<div className="flex items-center space-x-2">
									<span>{displayLabel}</span>
									{showLabel && hasDefault && (
										<Badge variant="secondary" className="text-xs">
											Padrão
										</Badge>
									)}
								</div>
							)}
						</SelectValue>
					</SelectTrigger>

					<SelectContent className="max-h-60">
						<div className="p-2 text-xs text-muted-foreground border-b border-border">Selecione o rancho responsável</div>
						{selectItems}
					</SelectContent>
				</Select>

				{/* Informação adicional para rancho padrão */}
				{showLabel && hasDefault && (
					<div className="text-xs text-muted-foreground flex items-center space-x-1">
						<AlertCircle className="h-3 w-3" />
						<span>Este é o rancho padrão configurado</span>
					</div>
				)}

				{/* Validação de erro */}
				{showLabel && showValidation && !isValidSelection && value && (
					<div className="text-xs text-destructive flex items-center space-x-1">
						<AlertCircle className="h-3 w-3" />
						<span>Rancho não encontrado: "{value}"</span>
					</div>
				)}
			</div>
		)
	}
)

MessHallSelector.displayName = "MessHallSelector"
