import { FileSignature } from "lucide-react"
import { useId, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useQuickRegisterEmpenho } from "@/hooks/data/useAcquisitions"
import { BRL, normalizeDocument, todayInBrasilia } from "@/lib/expense-execution"
import type { QuickEmpenhoResult } from "@/server/empenho-document.fn"

export type { QuickEmpenhoResult }

export interface QuickEmpenhoFormProps {
	/** Unidade da NE (Gestão Unidade). Informe esta OU `kitchenId`. */
	unitId?: number
	/**
	 * Cozinha que precisa da NE (Estoque, OF, recebimento): quem registra tem `storage:2` nela, e a
	 * unidade da NE é a COMPRADORA da cozinha, resolvida no servidor.
	 */
	kitchenId?: number
	/** Contratação de origem já conhecida. Sem ela, a NE fica com a pendência "vincular". */
	acquisitionId?: string | null
	/** Número sugerido (ex.: o que o usuário digitou numa busca que não achou nada). */
	defaultNumber?: string
	/** Valor sugerido (ex.: total da OF que está sendo montada). */
	defaultValue?: number | null
	defaultFavorecido?: { cnpj?: string | null; nome?: string | null }
	/** Chamado com a NE registrada — ou com a que já estava no sistema (`created: false`). */
	onRegistered: (result: QuickEmpenhoResult) => void
	onCancel?: () => void
	submitLabel?: string
}

/**
 * Registro rápido da nota de empenho que ainda não está no sistema: número, data, valor e
 * favorecido, no próprio lugar onde ela faz falta. Idempotente pelo número (a NE que já existe é
 * devolvida, não duplicada), e o import do SIAFI completa a classificação depois.
 *
 * Ação explícita de criação (SAVE_BEHAVIOR, modo D): um botão que registra, sem autosave.
 */
export function QuickEmpenhoForm({
	unitId,
	kitchenId,
	acquisitionId = null,
	defaultNumber = "",
	defaultValue = null,
	defaultFavorecido,
	onRegistered,
	onCancel,
	submitLabel = "Registrar NE",
}: QuickEmpenhoFormProps) {
	const id = useId()
	const [numero, setNumero] = useState(defaultNumber)
	const [data, setData] = useState(todayInBrasilia())
	const [valor, setValor] = useState(defaultValue != null ? String(defaultValue) : "")
	const [cnpj, setCnpj] = useState(defaultFavorecido?.cnpj ?? "")
	const [nome, setNome] = useState(defaultFavorecido?.nome ?? "")
	const [existing, setExisting] = useState<QuickEmpenhoResult | null>(null)
	const register = useQuickRegisterEmpenho(unitId ?? null)

	const valorNumber = Number(valor.replace(",", "."))
	const cnpjInvalid = cnpj.trim() !== "" && normalizeDocument(cnpj) == null
	const canSubmit = numero.trim() !== "" && /^\d{4}-\d{2}-\d{2}$/.test(data) && valorNumber > 0 && !cnpjInvalid && !register.isPending

	function submit(event: React.SyntheticEvent) {
		event.preventDefault()
		if (!canSubmit) return
		register.mutate(
			{
				...(kitchenId != null ? { kitchenId } : {}),
				...(unitId != null ? { unitId } : {}),
				numeroEmpenho: numero,
				dataEmpenho: data,
				valor: valorNumber,
				favorecidoCnpj: normalizeDocument(cnpj),
				favorecidoNome: nome.trim() || null,
				acquisitionId,
			},
			{
				onSuccess: (result) => {
					if (!result.created) setExisting(result)
					onRegistered(result)
				},
			}
		)
	}

	return (
		<form onSubmit={submit} className="space-y-4">
			<FieldGroup>
				<div className="grid gap-4 sm:grid-cols-3">
					<Field>
						<FieldLabel htmlFor={`${id}-numero`}>Número da NE</FieldLabel>
						<Input id={`${id}-numero`} value={numero} onChange={(e) => setNumero(e.target.value.toUpperCase())} placeholder="2026NE000123" autoFocus />
					</Field>
					<Field>
						<FieldLabel htmlFor={`${id}-data`}>Data</FieldLabel>
						<Input id={`${id}-data`} type="date" value={data} onChange={(e) => setData(e.target.value)} />
					</Field>
					<Field>
						<FieldLabel htmlFor={`${id}-valor`}>Valor (R$)</FieldLabel>
						<Input id={`${id}-valor`} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
					</Field>
				</div>
				<div className="grid gap-4 sm:grid-cols-2">
					<Field data-invalid={cnpjInvalid || undefined}>
						<FieldLabel htmlFor={`${id}-cnpj`}>CNPJ do favorecido</FieldLabel>
						<Input id={`${id}-cnpj`} inputMode="numeric" value={cnpj} onChange={(e) => setCnpj(e.target.value)} aria-invalid={cnpjInvalid || undefined} />
						{cnpjInvalid && <FieldError>CNPJ com 14 dígitos</FieldError>}
					</Field>
					<Field>
						<FieldLabel htmlFor={`${id}-nome`}>Favorecido</FieldLabel>
						<Input id={`${id}-nome`} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Opcional" />
					</Field>
				</div>
				<FieldDescription>
					Só o mínimo para seguir. A classificação (ND, PTRES, fonte) vem do relatório de NE do SIAFI, que completa esta NE pelo número, sem duplicar.
				</FieldDescription>
			</FieldGroup>

			{existing && (
				<Alert>
					<FileSignature className="size-4" aria-hidden="true" />
					<AlertTitle>A NE {existing.numeroEmpenho} já estava no sistema</AlertTitle>
					<AlertDescription>
						{existing.valueDiffers
							? `Ela está registrada com ${BRL.format(existing.valorTotal)}. A diferença para o valor informado aparece na conciliação com o SIAFI.`
							: "Nada foi duplicado: a NE existente foi usada."}
					</AlertDescription>
				</Alert>
			)}

			<div className="flex justify-end gap-2">
				{onCancel && (
					<Button type="button" variant="outline" onClick={onCancel}>
						Cancelar
					</Button>
				)}
				<Button type="submit" disabled={!canSubmit}>
					{register.isPending && <Spinner className="size-4" />}
					{submitLabel}
				</Button>
			</div>
		</form>
	)
}

export interface QuickEmpenhoDialogProps extends QuickEmpenhoFormProps {
	open: boolean
	onOpenChange: (open: boolean) => void
}

/** O mesmo formulário num diálogo — para abrir de um botão "Registrar NE" na OF ou no recebimento. */
export function QuickEmpenhoDialog({ open, onOpenChange, onRegistered, onCancel, ...props }: QuickEmpenhoDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Registrar a nota de empenho</DialogTitle>
					<DialogDescription>A NE saiu no SIAFI e ainda não está aqui. Registre o mínimo e continue; o import do SIAFI completa o resto.</DialogDescription>
				</DialogHeader>
				<QuickEmpenhoForm
					{...props}
					onRegistered={(result) => {
						onRegistered(result)
						if (result.created) onOpenChange(false)
					}}
					onCancel={() => {
						onCancel?.()
						onOpenChange(false)
					}}
				/>
			</DialogContent>
		</Dialog>
	)
}
