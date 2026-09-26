import type { DispensaSum } from "@iefa/sisub-domain"
import { AlertTriangle, Scale } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "@/components/ui/item"
import { BRL } from "@/lib/expense-execution"

/**
 * Somatório da dispensa por valor (Lei 14.133/2021, art. 75, § 1º) com a composição. Acima do
 * limite é aviso, nunca recusa: o sisub registra a dispensa já feita e pede a justificativa.
 */
export function DispensaSumNotice({ sum, activityLineLabel }: { sum: DispensaSum; activityLineLabel?: string | null }) {
	const alarming = sum.exceeded || sum.limit == null
	const line = activityLineLabel ?? (sum.activityLine?.startsWith("nd:") ? `ND ${sum.activityLine.slice(3)}` : sum.activityLine)

	const body = (
		<>
			<p>
				{line ? `Ramo de atividade: ${line}. ` : "Sem ramo de atividade: informe a classe do CATMAT (bens) ou a descrição do serviço. "}
				Dispensas do inciso {sum.clause} em {sum.fiscalYear}: {BRL.format(sum.total)}
				{sum.isFloor ? " ou mais (há dispensa sem valor no conjunto — o total é um piso)" : ""}
				{sum.limit != null ? ` de ${BRL.format(sum.limit)}` : ""}.{sum.remaining != null && !sum.exceeded ? ` Resta ${BRL.format(sum.remaining)}.` : ""}
			</p>
			{sum.limitOutdated && sum.limit != null && (
				<p className="mt-1">
					Não há limite cadastrado para {sum.fiscalYear}: o cálculo usa o último conhecido ({sum.limitSource}). Cadastre o limite vigente.
				</p>
			)}
			{sum.exceeded && <p className="mt-1">Passou do limite (art. 75, § 1º). A contratação só fica completa com a justificativa registrada.</p>}
			{sum.composition.length > 1 && (
				<ItemGroup className="mt-3">
					{sum.composition.map((part) => (
						<Item key={part.id} size="xs" variant="outline">
							<ItemContent>
								<ItemTitle>{part.label}</ItemTitle>
							</ItemContent>
							<ItemActions>
								{part.isCandidate && <Badge variant="outline">esta</Badge>}
								<span className="text-caption tabular-nums text-foreground">{part.value == null ? "sem valor" : BRL.format(part.value)}</span>
							</ItemActions>
						</Item>
					))}
				</ItemGroup>
			)}
		</>
	)

	if (!alarming) {
		return (
			<div className="flex items-start gap-2 text-caption text-muted-foreground">
				<Scale className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
				<div>{body}</div>
			</div>
		)
	}
	return (
		<Alert>
			<AlertTriangle className="size-4 text-warning" aria-hidden="true" />
			<AlertTitle>{sum.limit == null ? "Limite da dispensa não cadastrado" : "Somatório da dispensa acima do limite"}</AlertTitle>
			<AlertDescription>{body}</AlertDescription>
		</Alert>
	)
}
