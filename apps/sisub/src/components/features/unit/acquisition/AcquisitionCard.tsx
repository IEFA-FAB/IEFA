import { FilePlus2, FileSignature, Link2Off, Search, Trash2 } from "lucide-react"
import { useState } from "react"
import { ArpSearchModal } from "@/components/features/local/arp/ArpSearchModal"
import { AutoSaveStatus, autoSaveStateOf } from "@/components/features/shared/AutoSaveStatus"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Textarea } from "@/components/ui/textarea"
import { type AcquisitionPatch, useAcquisitionMutations, useUpdateAcquisition } from "@/hooks/data/useAcquisitions"
import { BRL, formatIsoDate, normalizeDocument, parseMoneyInput } from "@/lib/expense-execution"
import type { AcquisitionView } from "@/server/acquisition.fn"
import { ActivityLineField, InstrumentSelect, SrpRoleSelect } from "./AcquisitionFields"
import { DispensaSumNotice } from "./DispensaSumNotice"
import { EmpenhoFromOriginDialog, type EmpenhoOrigin } from "./EmpenhoFromOriginDialog"
import { ManualArpDialog } from "./ManualArpDialog"

/** Valor digitado em pt-BR ("1.234,56"); inválido vira `null` e a tela diz por quê. */
const parseMoney = (value: string): number | null => {
	const parsed = parseMoneyInput(value)
	return parsed.ok ? parsed.value : null
}

/** Campo de texto que grava no blur (SAVE_BEHAVIOR, modo B). */
function TextField({
	id,
	label,
	value,
	onSave,
	placeholder,
	multiline,
	hint,
	disabled,
}: {
	id: string
	label: string
	value: string | null
	onSave: (next: string | null) => void
	placeholder?: string
	multiline?: boolean
	hint?: string
	disabled?: boolean
}) {
	const [draft, setDraft] = useState(value ?? "")
	const commit = () => {
		const next = draft.trim() === "" ? null : draft.trim()
		if (next !== (value ?? null)) onSave(next)
	}
	return (
		<Field>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			{multiline ? (
				<Textarea id={id} rows={2} value={draft} disabled={disabled} onChange={(e) => setDraft(e.target.value)} onBlur={commit} placeholder={placeholder} />
			) : (
				<Input id={id} value={draft} disabled={disabled} onChange={(e) => setDraft(e.target.value)} onBlur={commit} placeholder={placeholder} />
			)}
			{hint && <FieldDescription>{hint}</FieldDescription>}
		</Field>
	)
}

/**
 * Uma contratação de origem, completada no próprio card (autosave). Pendências no topo, com o que
 * falta; somatório da dispensa com a composição; ARPs e NEs que ela sustenta, com as ações do
 * tamanho do fato: importar ou cadastrar a ARP, registrar a NE.
 */
export function AcquisitionCard({ unitId, acquisition, canEdit }: { unitId: number; acquisition: AcquisitionView; canEdit: boolean }) {
	const a = acquisition
	const update = useUpdateAcquisition(unitId, a.id)
	const { remove, linkArp } = useAcquisitionMutations(unitId)
	const save = (patch: AcquisitionPatch) => update.mutate(patch)
	const [importing, setImporting] = useState(false)
	const [registeringArp, setRegisteringArp] = useState(false)
	const [empenhoOrigin, setEmpenhoOrigin] = useState<EmpenhoOrigin | null>(null)
	const [cnpj, setCnpj] = useState(a.supplierCnpj ?? "")
	const [estimated, setEstimated] = useState(a.estimatedValue != null ? String(a.estimatedValue).replace(".", ",") : "")
	const disabled = !canEdit
	const isSrp = a.kind === "registro_precos"
	const isDispensa = a.kind === "dispensa"
	const cnpjInvalid = cnpj.trim() !== "" && normalizeDocument(cnpj) == null
	const origin: EmpenhoOrigin = { acquisitionId: a.id, kind: a.kind, supplierCnpj: a.supplierCnpj, supplierName: a.supplierName, nd: a.nd }

	return (
		<Card>
			<CardHeader>
				<div className="flex flex-wrap items-start justify-between gap-2">
					<div className="space-y-1">
						<CardTitle>
							{a.kindLabel}
							{a.object ? ` — ${a.object}` : ""}
						</CardTitle>
						<CardDescription>
							{a.processNup ? `NUP ${a.processNup} · ` : ""}
							{a.validFrom || a.validTo ? `vigência ${formatIsoDate(a.validFrom)} a ${formatIsoDate(a.validTo)} · ` : ""}
							exercício {a.fiscalYear} · empenhado {BRL.format(a.committedValue)}
							{a.estimatedValue != null ? ` de ${BRL.format(a.estimatedValue)} estimados` : ""}
						</CardDescription>
						<div className="flex flex-wrap gap-1.5">
							{a.gaps.length === 0 ? (
								<Badge variant="success">Completa</Badge>
							) : (
								a.gaps.map((gap) => (
									<Badge key={gap.code} variant="warning">
										sem {gap.missing}
									</Badge>
								))
							)}
						</div>
					</div>
					<div className="flex items-center gap-2">
						<AutoSaveStatus status={autoSaveStateOf(update)} onRetry={() => update.variables && update.mutate(update.variables)} />
						{canEdit && (
							<Button
								variant="ghost"
								size="sm"
								onClick={() => {
									if (window.confirm(`Remover a contratação de origem "${a.kindLabel}${a.object ? ` — ${a.object}` : ""}"?`)) remove.mutate(a.id)
								}}
							>
								<Trash2 className="size-4" aria-hidden="true" />
								Remover
							</Button>
						)}
					</div>
				</div>
			</CardHeader>
			<CardContent className="space-y-5">
				{a.dispensaSum && <DispensaSumNotice sum={a.dispensaSum} activityLineLabel={a.activityLineName ? `${a.activityLine} — ${a.activityLineName}` : null} />}

				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					<TextField id={`acq-legal-${a.id}`} label="Fundamento legal" value={a.legalBasis} onSave={(legalBasis) => save({ legalBasis })} disabled={disabled} />
					{isSrp ? (
						<Field>
							<FieldLabel htmlFor={`acq-role-${a.id}`}>Papel da unidade na ata</FieldLabel>
							<SrpRoleSelect id={`acq-role-${a.id}`} value={a.srpRole} onChange={(srpRole) => save({ srpRole })} />
						</Field>
					) : (
						<Field>
							<FieldLabel htmlFor={`acq-instr-${a.id}`}>Instrumento</FieldLabel>
							<InstrumentSelect id={`acq-instr-${a.id}`} value={a.instrument} onChange={(instrument) => save({ instrument })} />
						</Field>
					)}
					<TextField id={`acq-nup-${a.id}`} label="NUP do processo" value={a.processNup} onSave={(processNup) => save({ processNup })} disabled={disabled} />
					<TextField id={`acq-object-${a.id}`} label="Objeto" value={a.object} onSave={(object) => save({ object })} disabled={disabled} />
					{!isSrp && (
						<>
							<Field data-invalid={cnpjInvalid || undefined}>
								<FieldLabel htmlFor={`acq-cnpj-${a.id}`}>CNPJ do fornecedor</FieldLabel>
								<Input
									id={`acq-cnpj-${a.id}`}
									inputMode="numeric"
									value={cnpj}
									disabled={disabled}
									aria-invalid={cnpjInvalid || undefined}
									onChange={(e) => setCnpj(e.target.value)}
									onBlur={() => {
										if (cnpjInvalid) return
										const next = normalizeDocument(cnpj)
										if (next !== a.supplierCnpj) save({ supplierCnpj: next })
									}}
								/>
							</Field>
							<TextField
								id={`acq-supplier-${a.id}`}
								label="Fornecedor"
								value={a.supplierName}
								onSave={(supplierName) => save({ supplierName })}
								disabled={disabled}
							/>
						</>
					)}
					<Field>
						<FieldLabel htmlFor={`acq-from-${a.id}`}>Vigência — início</FieldLabel>
						<Input
							id={`acq-from-${a.id}`}
							type="date"
							disabled={disabled}
							defaultValue={a.validFrom ?? ""}
							onBlur={(e) => e.target.value !== (a.validFrom ?? "") && save({ validFrom: e.target.value || null })}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor={`acq-to-${a.id}`}>Vigência — fim</FieldLabel>
						<Input
							id={`acq-to-${a.id}`}
							type="date"
							disabled={disabled}
							defaultValue={a.validTo ?? ""}
							onBlur={(e) => e.target.value !== (a.validTo ?? "") && save({ validTo: e.target.value || null })}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor={`acq-value-${a.id}`}>Valor estimado (R$)</FieldLabel>
						<Input
							id={`acq-value-${a.id}`}
							inputMode="decimal"
							disabled={disabled}
							value={estimated}
							onChange={(e) => setEstimated(e.target.value)}
							onBlur={() => {
								const next = parseMoney(estimated)
								if (next !== a.estimatedValue) save({ estimatedValue: next })
							}}
						/>
					</Field>
					<TextField id={`acq-nd-${a.id}`} label="Natureza de despesa" value={a.nd} onSave={(nd) => save({ nd })} placeholder="33903007" disabled={disabled} />
					{isDispensa && (
						<>
							<TextField
								id={`acq-clause-${a.id}`}
								label="Inciso do art. 75"
								value={a.directContractClause}
								onSave={(clause) => save({ directContractClause: clause?.toUpperCase() ?? null })}
								placeholder="II"
								disabled={disabled}
							/>
							<Field className="sm:col-span-2">
								<FieldLabel htmlFor={`acq-line-${a.id}`}>Ramo de atividade</FieldLabel>
								<ActivityLineField id={`acq-line-${a.id}`} unitId={unitId} value={a.activityLine} onChange={(activityLine) => save({ activityLine })} />
							</Field>
						</>
					)}
				</div>

				{a.dispensaSum?.exceeded && (
					<TextField
						id={`acq-just-${a.id}`}
						label="Justificativa do somatório acima do limite"
						value={a.overLimitJustification}
						onSave={(overLimitJustification) => save({ overLimitJustification })}
						multiline
						hint="Art. 75, § 1º, da Lei 14.133/2021. Registrada, a pendência some."
						disabled={disabled}
					/>
				)}

				{isSrp && (
					<div className="space-y-3">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<p className="text-subheading">Atas de registro de preços</p>
							{canEdit && (
								<div className="flex gap-2">
									<Button size="sm" variant="outline" onClick={() => setImporting(true)}>
										<Search className="size-4" aria-hidden="true" />
										Buscar no Compras.gov.br
									</Button>
									<Button size="sm" variant="outline" onClick={() => setRegisteringArp(true)}>
										<FilePlus2 className="size-4" aria-hidden="true" />
										Cadastrar à mão
									</Button>
								</div>
							)}
						</div>
						{a.arps.length === 0 ? (
							<p className="text-caption text-muted-foreground">
								Nenhuma ARP ainda. Busque a ata no Compras.gov.br ou, se a API não responder, cadastre à mão.
							</p>
						) : (
							<ItemGroup>
								{a.arps.map((arp) => (
									<Item key={arp.id} variant="outline" size="sm">
										<ItemContent>
											<ItemTitle>
												ARP {arp.numeroAta} · UASG {arp.uasgGerenciadora}
												{arp.lastSyncedAt == null && <Badge variant="warning">não sincronizada</Badge>}
												{arp.source === "manual" && <Badge variant="outline">cadastrada à mão</Badge>}
											</ItemTitle>
											<ItemDescription className="text-xs">
												{arp.nomeUasgGerenciadora ?? "Órgão gerenciador não informado"} · {arp.itemCount} ite{arp.itemCount === 1 ? "m" : "ns"}
												{arp.vigenciaFim ? ` · vigência até ${formatIsoDate(arp.vigenciaFim)}` : ""}
												{arp.ataId ? "" : " · sem anexo quantitativo"}
											</ItemDescription>
										</ItemContent>
										{canEdit && (
											<ItemActions>
												<Button size="sm" variant="outline" onClick={() => setEmpenhoOrigin({ ...origin, arpId: arp.id })}>
													<FileSignature className="size-4" aria-hidden="true" />
													Empenhar itens
												</Button>
												<Button
													variant="ghost"
													size="icon-sm"
													aria-label="Desvincular ARP"
													onClick={() => linkArp.mutate({ arpId: arp.id, acquisitionId: null })}
												>
													<Link2Off className="size-4" aria-hidden="true" />
												</Button>
											</ItemActions>
										)}
									</Item>
								))}
							</ItemGroup>
						)}
					</div>
				)}

				<div className="space-y-3">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<p className="text-subheading">Notas de empenho</p>
						{canEdit && (
							<Button size="sm" onClick={() => setEmpenhoOrigin(origin)}>
								<FileSignature className="size-4" aria-hidden="true" />
								Registrar NE
							</Button>
						)}
					</div>
					{a.empenhos.length === 0 ? (
						<p className="text-caption text-muted-foreground">Nenhuma NE nesta contratação de origem.</p>
					) : (
						<ItemGroup>
							{a.empenhos.map((empenho) => (
								<Item key={empenho.id} variant="outline" size="xs">
									<ItemContent>
										<ItemTitle>
											{empenho.numeroEmpenho}
											{empenho.status === "anulado" && <Badge variant="outline">anulada</Badge>}
										</ItemTitle>
										<ItemDescription className="text-xs">{formatIsoDate(empenho.dataEmpenho)}</ItemDescription>
									</ItemContent>
									<ItemActions>
										<span className="text-caption tabular-nums text-foreground">{BRL.format(empenho.valorVigente)}</span>
									</ItemActions>
								</Item>
							))}
						</ItemGroup>
					)}
				</div>
			</CardContent>

			{importing && <ArpSearchModal open onOpenChange={(open) => !open && setImporting(false)} acquisitionId={a.id} unitId={unitId} />}
			{registeringArp && <ManualArpDialog unitId={unitId} acquisitionId={a.id} onClose={() => setRegisteringArp(false)} />}
			{empenhoOrigin && <EmpenhoFromOriginDialog unitId={unitId} origin={empenhoOrigin} onClose={() => setEmpenhoOrigin(null)} />}
		</Card>
	)
}
