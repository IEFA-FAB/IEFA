import { type AcquisitionInstrument, type AcquisitionKind, DEFAULT_LEGAL_BASIS, type SrpRole } from "@iefa/sisub-domain"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useAcquisitionMutations, useDispensaPreview } from "@/hooks/data/useAcquisitions"
import { currentFiscalYear, normalizeDocument, parseMoneyInput } from "@/lib/expense-execution"
import { ActivityLineField, InstrumentSelect, KindSelect, SrpRoleSelect } from "./AcquisitionFields"
import { DispensaSumNotice } from "./DispensaSumNotice"

const DEFAULT_INSTRUMENT: Partial<Record<AcquisitionKind, AcquisitionInstrument>> = {
	registro_precos: "ata",
	licitacao: "contrato",
	dispensa: "nota_empenho",
	inexigibilidade: "nota_empenho",
	contrata_mais_brasil: "nota_empenho",
}

/** Valor digitado em pt-BR ("1.234,56"); inválido vira `null` e a tela diz por quê. */
const parseMoney = (value: string): number | null => {
	const parsed = parseMoneyInput(value)
	return parsed.ok ? parsed.value : null
}

/**
 * Registrar a contratação de origem com o mínimo: só o tipo é obrigatório (o que faltar aparece
 * como pendência no card). Dispensa por valor mostra o somatório do exercício ANTES de gravar, e
 * passar do limite nunca impede o registro (Lei 14.133/2021, art. 75, § 1º).
 *
 * Criação explícita (SAVE_BEHAVIOR, modo D).
 */
export function CreateAcquisitionDialog({ unitId, onClose, onCreated }: { unitId: number; onClose: () => void; onCreated?: (id: string) => void }) {
	const { create } = useAcquisitionMutations(unitId)
	const [kind, setKind] = useState<AcquisitionKind>("dispensa")
	const [srpRole, setSrpRole] = useState<SrpRole | null>(null)
	const [instrument, setInstrument] = useState<AcquisitionInstrument | null>(DEFAULT_INSTRUMENT.dispensa ?? null)
	const [legalBasis, setLegalBasis] = useState(DEFAULT_LEGAL_BASIS.dispensa ?? "")
	const [clause, setClause] = useState("II")
	const [nd, setNd] = useState("33903007")
	const [activityLine, setActivityLine] = useState<string | null>(null)
	const [object, setObject] = useState("")
	const [supplierCnpj, setSupplierCnpj] = useState("")
	const [supplierName, setSupplierName] = useState("")
	const [validFrom, setValidFrom] = useState("")
	const [validTo, setValidTo] = useState("")
	const [estimated, setEstimated] = useState("")
	const [processNup, setProcessNup] = useState("")
	const [justification, setJustification] = useState("")
	// Prévia com os valores confirmados (blur): sem uma consulta por tecla.
	const [previewValue, setPreviewValue] = useState<number | null>(null)

	const isValueDispensa = kind === "dispensa" && (clause === "I" || clause === "II")
	const preview = useDispensaPreview(
		isValueDispensa
			? {
					unitId,
					directContractClause: clause as "I" | "II",
					fiscalYear: currentFiscalYear(),
					activityLine,
					nd: /^\d{6,8}$/.test(nd) ? nd : null,
					estimatedValue: previewValue,
				}
			: null
	)
	const sum = preview.data?.sum ?? null

	function changeKind(next: AcquisitionKind) {
		// O fundamento sugerido só troca se o usuário não escreveu outro.
		if (legalBasis === "" || legalBasis === (DEFAULT_LEGAL_BASIS[kind] ?? "")) setLegalBasis(DEFAULT_LEGAL_BASIS[next] ?? "")
		setInstrument(DEFAULT_INSTRUMENT[next] ?? null)
		if (next !== "registro_precos") setSrpRole(null)
		setKind(next)
	}

	const cnpjInvalid = supplierCnpj.trim() !== "" && normalizeDocument(supplierCnpj) == null
	const validityInvalid = validFrom !== "" && validTo !== "" && validTo < validFrom

	function submit() {
		if (cnpjInvalid || validityInvalid) return
		const text = (value: string) => (value.trim() === "" ? null : value.trim())
		create.mutate(
			{
				kind,
				srpRole: kind === "registro_precos" ? srpRole : null,
				instrument,
				legalBasis: text(legalBasis),
				directContractClause: kind === "dispensa" ? text(clause)?.toUpperCase() : null,
				nd: /^\d{6,8}$/.test(nd) ? nd : null,
				activityLine,
				object: text(object),
				supplierCnpj: normalizeDocument(supplierCnpj),
				supplierName: text(supplierName),
				validFrom: validFrom || null,
				validTo: validTo || null,
				estimatedValue: parseMoney(estimated),
				processNup: text(processNup),
				overLimitJustification: sum?.exceeded ? text(justification) : null,
			},
			{
				onSuccess: (result) => {
					onCreated?.(result.id)
					onClose()
				},
			}
		)
	}

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Nova contratação de origem</DialogTitle>
					<DialogDescription>
						De onde vem o direito de gastar: a ata, o contrato, a dispensa. Só o tipo é obrigatório — o que faltar fica como pendência, para completar depois.
					</DialogDescription>
				</DialogHeader>
				<FieldGroup>
					<div className="grid gap-4 sm:grid-cols-2">
						<Field>
							<FieldLabel htmlFor="acq-kind">Tipo</FieldLabel>
							<KindSelect id="acq-kind" value={kind} onChange={changeKind} />
						</Field>
						{kind === "registro_precos" ? (
							<Field>
								<FieldLabel htmlFor="acq-role">Papel da unidade na ata</FieldLabel>
								<SrpRoleSelect id="acq-role" value={srpRole} onChange={setSrpRole} />
								<FieldDescription>Não participante é a adesão (carona) a ata de outro órgão.</FieldDescription>
							</Field>
						) : (
							<Field>
								<FieldLabel htmlFor="acq-instrument">Instrumento</FieldLabel>
								<InstrumentSelect id="acq-instrument" value={instrument} onChange={setInstrument} />
								<FieldDescription>A NE substitui o contrato nos casos do art. 95.</FieldDescription>
							</Field>
						)}
					</div>

					<Field>
						<FieldLabel htmlFor="acq-legal">Fundamento legal</FieldLabel>
						<Input id="acq-legal" value={legalBasis} onChange={(e) => setLegalBasis(e.target.value)} placeholder="Lei 14.133/2021, art. 75, II" />
					</Field>

					{kind === "dispensa" && (
						<div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
							<Field>
								<FieldLabel htmlFor="acq-clause">Inciso do art. 75</FieldLabel>
								<Input id="acq-clause" value={clause} onChange={(e) => setClause(e.target.value.toUpperCase())} placeholder="II" />
							</Field>
							<Field>
								<FieldLabel htmlFor="acq-line">Ramo de atividade</FieldLabel>
								<ActivityLineField id="acq-line" unitId={unitId} value={activityLine} onChange={setActivityLine} />
								<FieldDescription>
									Classe do CATMAT para bens (ex.: 8905 — carnes), descrição para serviços (IN SEGES/ME 67/2021, art. 4º, § 2º).
								</FieldDescription>
							</Field>
						</div>
					)}

					<div className="grid gap-4 sm:grid-cols-3">
						<Field>
							<FieldLabel htmlFor="acq-nd">Natureza de despesa</FieldLabel>
							<Input id="acq-nd" inputMode="numeric" value={nd} onChange={(e) => setNd(e.target.value.replace(/\D/g, ""))} placeholder="33903007" />
						</Field>
						<Field>
							<FieldLabel htmlFor="acq-value">Valor estimado (R$)</FieldLabel>
							<Input
								id="acq-value"
								inputMode="decimal"
								value={estimated}
								onChange={(e) => setEstimated(e.target.value)}
								onBlur={() => setPreviewValue(parseMoney(estimated))}
								placeholder="0,00"
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="acq-nup">NUP do processo</FieldLabel>
							<Input id="acq-nup" value={processNup} onChange={(e) => setProcessNup(e.target.value)} placeholder="Opcional" />
						</Field>
					</div>

					{isValueDispensa && sum && <DispensaSumNotice sum={sum} />}
					{isValueDispensa && sum?.exceeded && (
						<Field>
							<FieldLabel htmlFor="acq-justification">Justificativa do somatório acima do limite</FieldLabel>
							<Textarea id="acq-justification" rows={2} value={justification} onChange={(e) => setJustification(e.target.value)} />
							<FieldDescription>Pode ficar para depois: a contratação de origem é registrada e fica com a pendência.</FieldDescription>
						</Field>
					)}

					<Field>
						<FieldLabel htmlFor="acq-object">Objeto</FieldLabel>
						<Input id="acq-object" value={object} onChange={(e) => setObject(e.target.value)} placeholder="Ex.: carne bovina para a formatura" />
					</Field>

					{kind !== "registro_precos" && (
						<div className="grid gap-4 sm:grid-cols-2">
							<Field data-invalid={cnpjInvalid || undefined}>
								<FieldLabel htmlFor="acq-cnpj">CNPJ do fornecedor</FieldLabel>
								<Input
									id="acq-cnpj"
									inputMode="numeric"
									value={supplierCnpj}
									onChange={(e) => setSupplierCnpj(e.target.value)}
									aria-invalid={cnpjInvalid || undefined}
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="acq-supplier">Fornecedor</FieldLabel>
								<Input id="acq-supplier" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
							</Field>
						</div>
					)}

					<div className="grid gap-4 sm:grid-cols-2">
						<Field data-invalid={validityInvalid || undefined}>
							<FieldLabel htmlFor="acq-from">Vigência — início</FieldLabel>
							<Input id="acq-from" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
						</Field>
						<Field data-invalid={validityInvalid || undefined}>
							<FieldLabel htmlFor="acq-to">Vigência — fim</FieldLabel>
							<Input id="acq-to" type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} aria-invalid={validityInvalid || undefined} />
							{validityInvalid && <FieldDescription>O fim não pode ser antes do início.</FieldDescription>}
						</Field>
					</div>
				</FieldGroup>
				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancelar
					</Button>
					<Button onClick={submit} disabled={create.isPending || cnpjInvalid || validityInvalid}>
						{create.isPending ? "Registrando…" : "Registrar contratação de origem"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
