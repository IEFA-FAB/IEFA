/**
 * Campos do editor da demanda. Rótulo, pergunta de apoio e controle num bloco só, para cada
 * passo ler como um roteiro de perguntas e não como um formulário de sistema.
 */

import type { DemandCheck } from "@iefa/alpha-client/demand"
import { InfoCircle, Plus, Trash, WarningCircle, WarningTriangle } from "iconoir-react"
import { type ReactNode, useCallback, useEffect, useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

export function FieldBlock({
	label,
	hint,
	htmlFor,
	children,
	aside,
}: {
	label: string
	hint?: ReactNode
	htmlFor?: string
	children: ReactNode
	aside?: ReactNode
}) {
	return (
		<div className="space-y-1.5">
			<div className="flex items-baseline justify-between gap-3">
				<label htmlFor={htmlFor} className="font-medium text-sm">
					{label}
				</label>
				{aside}
			</div>
			{hint ? <p className="text-muted-foreground text-xs leading-relaxed">{hint}</p> : null}
			{children}
		</div>
	)
}

export function TextArea({
	label,
	hint,
	value,
	onChange,
	rows = 4,
	placeholder,
	maxLength,
	counter,
}: {
	label: string
	hint?: ReactNode
	value: string
	onChange: (value: string) => void
	rows?: number
	placeholder?: string
	maxLength?: number
	/** Limite do campo no sistema de destino, só para o contador (não corta). */
	counter?: number
}) {
	const id = useId()
	const over = counter !== undefined && value.trim().length > counter
	return (
		<FieldBlock
			label={label}
			hint={hint}
			htmlFor={id}
			aside={
				counter !== undefined ? (
					<span className={`text-xs tabular-nums ${over ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
						{value.trim().length}/{counter}
					</span>
				) : null
			}
		>
			<Textarea id={id} value={value} rows={rows} placeholder={placeholder} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} />
		</FieldBlock>
	)
}

export function TextInput({
	label,
	hint,
	value,
	onChange,
	placeholder,
	type = "text",
	maxLength,
}: {
	label: string
	hint?: ReactNode
	value: string
	onChange: (value: string) => void
	placeholder?: string
	type?: "text" | "date" | "email"
	maxLength?: number
}) {
	const id = useId()
	return (
		<FieldBlock label={label} hint={hint} htmlFor={id}>
			<Input id={id} type={type} value={value} placeholder={placeholder} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} />
		</FieldBlock>
	)
}

const DECIMAL = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 })
const MONEY = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** "1.234,56" ou "1234.56" → 1234.56; vazio → null; texto inválido → NaN. */
export function parseDecimal(raw: string): number | null {
	const trimmed = raw.trim()
	if (!trimmed) return null
	const normalized = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed
	const value = Number(normalized)
	return Number.isFinite(value) && value >= 0 ? value : Number.NaN
}

/**
 * Número em pt-BR (vírgula decimal), com o texto local enquanto se digita: formatar a cada
 * tecla comeria a vírgula antes de a pessoa digitar os centavos.
 */
export function DecimalInput({
	label,
	hint,
	value,
	onChange,
	money = false,
	placeholder,
	ariaLabel,
}: {
	label?: string
	hint?: ReactNode
	value: number | null
	onChange: (value: number | null) => void
	money?: boolean
	placeholder?: string
	ariaLabel?: string
}) {
	const id = useId()
	const format = useCallback((current: number | null) => (current === null ? "" : money ? MONEY.format(current) : DECIMAL.format(current)), [money])
	const [text, setText] = useState(format(value))
	const [focused, setFocused] = useState(false)
	const invalid = Number.isNaN(parseDecimal(text))

	useEffect(() => {
		if (!focused) setText(format(value))
	}, [value, focused, format])

	const input = (
		<Input
			id={id}
			inputMode="decimal"
			value={text}
			placeholder={placeholder}
			aria-label={ariaLabel}
			aria-invalid={invalid || undefined}
			onFocus={() => setFocused(true)}
			onBlur={() => {
				setFocused(false)
				const parsed = parseDecimal(text)
				if (!Number.isNaN(parsed)) setText(format(parsed))
			}}
			onChange={(event) => {
				setText(event.target.value)
				const parsed = parseDecimal(event.target.value)
				if (!Number.isNaN(parsed)) onChange(parsed)
			}}
		/>
	)
	if (!label) return input
	return (
		<FieldBlock label={label} hint={hint} htmlFor={id}>
			{input}
		</FieldBlock>
	)
}

export function Choice<T extends string>({
	label,
	hint,
	value,
	options,
	onChange,
	placeholder = "selecione",
}: {
	label: string
	hint?: ReactNode
	value: T | null
	options: ReadonlyArray<{ value: T; label: string }>
	onChange: (value: T) => void
	placeholder?: string
}) {
	const id = useId()
	const current = options.find((option) => option.value === value)
	return (
		<FieldBlock label={label} hint={hint} htmlFor={id}>
			<Select value={value ?? null} onValueChange={(next) => next !== null && onChange(next as T)}>
				<SelectTrigger id={id} className="w-full">
					<SelectValue>{current?.label ?? placeholder}</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{options.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</FieldBlock>
	)
}

/** Cartão de um elemento de lista (objetivo, alternativa, item, risco…), com remover. */
export function ListCard({ title, badge, onRemove, children }: { title: ReactNode; badge?: ReactNode; onRemove?: () => void; children: ReactNode }) {
	return (
		<div className="border border-border bg-card">
			<div className="flex items-center gap-3 border-border border-b px-4 py-2">
				<span className="min-w-0 flex-1 truncate font-medium text-sm">{title}</span>
				{badge}
				{onRemove ? (
					<Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Remover">
						<Trash />
					</Button>
				) : null}
			</div>
			<div className="space-y-4 p-4">{children}</div>
		</div>
	)
}

export function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
	return (
		<Button variant="outline" size="sm" onClick={onClick}>
			<Plus />
			{children}
		</Button>
	)
}

/** Abertura do passo: a pergunta que ele responde e por que ela vem nesta ordem. */
export function StepIntro({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div className="mb-6">
			<h2 className="font-semibold text-2xl tracking-tight">{title}</h2>
			<div className="mt-2 max-w-3xl space-y-2 text-muted-foreground text-sm leading-relaxed">{children}</div>
		</div>
	)
}

const SEVERITY_ICON = { bloqueia: WarningCircle, atencao: WarningTriangle, dica: InfoCircle } as const
const SEVERITY_LABEL = { bloqueia: "Bloqueia o envio", atencao: "Atenção", dica: "Dica" } as const

export function CheckList({ checks, empty }: { checks: readonly DemandCheck[]; empty?: ReactNode }) {
	if (checks.length === 0) return empty ? <div className="text-muted-foreground text-sm">{empty}</div> : null
	return (
		<ul className="divide-y divide-border border border-border">
			{checks.map((check) => {
				const Icon = SEVERITY_ICON[check.severity]
				return (
					<li key={check.id} className={`flex items-start gap-3 px-3 py-2 text-sm ${check.severity === "bloqueia" ? "bg-destructive/5" : ""}`}>
						<Icon className={`mt-0.5 size-4 shrink-0 ${check.severity === "bloqueia" ? "text-destructive" : "text-muted-foreground"}`} aria-hidden="true" />
						<div className="min-w-0">
							<span className="sr-only">{SEVERITY_LABEL[check.severity]}: </span>
							{check.message}
							{check.basis ? <span className="mt-0.5 block text-muted-foreground text-xs">{check.basis}</span> : null}
						</div>
					</li>
				)
			})}
		</ul>
	)
}

export function Grid({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
	const className = cols === 2 ? "grid gap-4 sm:grid-cols-2" : cols === 3 ? "grid gap-4 sm:grid-cols-3" : "grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
	return <div className={className}>{children}</div>
}
