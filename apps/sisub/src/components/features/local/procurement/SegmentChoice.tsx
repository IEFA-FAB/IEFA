import type { SegmentationOverview, SegmentExclusion } from "@iefa/sisub-domain"
import { Link } from "@tanstack/react-router"
import { Info, Layers } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MONTH_LABELS } from "./SegmentationEditor"

type Segment = SegmentationOverview["segments"][number]
const ALL_ITEMS = "all"

/**
 * Escolha da contratação do anexo, no primeiro passo do wizard. Sem contratação o anexo leva
 * todos os itens (o comportamento de antes); com ela, só os itens que a segmentação atribui a
 * ela — planejar todas as produções e comprar só um segmento delas.
 */
export function SegmentChoice({
	unitId,
	segments,
	loaded,
	value,
	onChange,
}: {
	unitId: string
	segments: Segment[]
	/** A segmentação já chegou: antes disso, contratação "sumida" é só carregamento. */
	loaded: boolean
	value: string | null
	onChange: (segment: Segment | null) => void
}) {
	const selected = segments.find((s) => s.id === value) ?? null
	const removed = loaded && value != null && !selected

	return (
		<Card>
			<CardContent className="pt-6">
				<Field>
					<FieldLabel htmlFor="ata-segment">Contratação deste anexo</FieldLabel>
					<Select
						// O id guardado segue como valor mesmo quando a contratação sumiu: assim escolher
						// "Todos os itens" é uma mudança de verdade e dispara `onValueChange`.
						value={value ?? ALL_ITEMS}
						onValueChange={(next) => onChange(next == null || next === ALL_ITEMS ? null : (segments.find((s) => s.id === next) ?? null))}
					>
						<SelectTrigger id="ata-segment" className="w-full sm:w-96">
							<SelectValue>
								{selected ? selected.name : value && loaded ? "Contratação removida" : value ? "Carregando…" : "Todos os itens (sem contratação)"}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={ALL_ITEMS}>Todos os itens (sem contratação)</SelectItem>
							{segments.map((s) => (
								<SelectItem key={s.id} value={s.id}>
									{s.name}
									{s.plannedMonth ? ` · ${MONTH_LABELS[s.plannedMonth - 1]}` : ""}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<FieldDescription>
						{removed ? (
							<span className="text-destructive">A contratação deste anexo foi removida. Escolha outra, ou todos os itens, antes de calcular.</span>
						) : selected ? (
							`O cálculo leva só ${selected.lineCount === 1 ? "o item" : `os ${selected.lineCount} itens`} de ${selected.name}; a vigência vem dela (${selected.validityMonths} meses).`
						) : (
							<>
								Com uma contratação, o anexo leva só os itens dela.{" "}
								<Link to="/unit/$unitId/segments" params={{ unitId }} className="underline underline-offset-2">
									{segments.length === 0 ? "Montar a segmentação" : "Ver a segmentação"}
								</Link>
							</>
						)}
					</FieldDescription>
				</Field>
			</CardContent>
		</Card>
	)
}

/** Quantos itens do cálculo ficaram fora do anexo da contratação, por motivo. */
export function SegmentExclusionNotice({ exclusion, segmentName, unitId }: { exclusion: SegmentExclusion; segmentName: string; unitId: string }) {
	const total = exclusion.otherSegment + exclusion.unassigned + exclusion.conflict
	if (total === 0) return null
	return (
		<Alert variant={exclusion.conflict > 0 ? "destructive" : "default"}>
			{exclusion.conflict > 0 ? <Layers className="size-4" aria-hidden="true" /> : <Info className="size-4" aria-hidden="true" />}
			<AlertTitle>
				{total} ite{total === 1 ? "m ficou" : "ns ficaram"} fora de {segmentName}
			</AlertTitle>
			<AlertDescription>
				<ul className="list-inside list-disc">
					{exclusion.otherSegment > 0 && <li>{exclusion.otherSegment} de outras contratações</li>}
					{exclusion.unassigned > 0 && <li>{exclusion.unassigned} sem contratação</li>}
					{exclusion.conflict > 0 && <li>{exclusion.conflict} em conflito entre duas contratações: resolva antes de concluir</li>}
				</ul>
				<Link to="/unit/$unitId/segments" params={{ unitId }} className="underline underline-offset-2">
					Ajustar a segmentação
				</Link>
			</AlertDescription>
		</Alert>
	)
}
