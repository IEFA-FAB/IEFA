import { Plus, Trash } from "iconoir-react"
import type { ReactNode } from "react"
import { BodyEditor } from "@/components/comaer/BodyEditor"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { type DocumentKind, kindsForScope } from "@/lib/comaer/catalog"
import { fromDateInputValue, toDateInputValue } from "@/lib/comaer/draft"
import { QUADROS_IN_FULL, RANKS } from "@/lib/comaer/ranks"
import type { Classification, DocumentInput, Party, Scope } from "@/lib/comaer/types"

/**
 * Formulário derivado do catálogo de espécies.
 *
 * Nenhum campo é decidido aqui: quem manda é `especie.blocos`. É o que torna a ferramenta
 * "menos travada" que a do SUCONT — acrescentar o Parecer ou a Ata ao catálogo faz o
 * formulário mudar sozinho, sem uma tela nova por espécie e sem campo de ofício aparecendo
 * onde a norma não o prevê.
 */

const SCOPES: { value: Scope; label: string; hint: string }[] = [
	{ value: "interno-om", label: "Interno à OM", hint: "Tramita entre setores da própria Organização Militar." },
	{ value: "comaer", label: "Entre OM do COMAER", hint: "Documento interno ao Comando da Aeronáutica." },
	{ value: "externo", label: "Externo ao COMAER", hint: "Órgão externo ou particular — posto e cargo por extenso." },
]

const CLASSIFICATIONS: { value: Classification; label: string }[] = [
	{ value: "ostensivo", label: "Ostensivo" },
	{ value: "reservado", label: "Reservado (R-)" },
	{ value: "secreto", label: "Secreto (S-)" },
	{ value: "ultrassecreto", label: "Ultrassecreto (US-)" },
]

const FAB_RANKS = RANKS.filter((p) => p.force === "aer")

interface Props {
	input: DocumentInput
	kind: DocumentKind
	onChange: (patch: Partial<DocumentInput>) => void
}

export function DocumentForm({ input, kind, onChange }: Props) {
	const tem = (bloco: string) => kind.blocks.includes(bloco as never)

	return (
		<div className="flex flex-col gap-8">
			<Section title="Espécie e âmbito" legalBasis="Anexo I, art. 7º e cap. VIII">
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<Field id="scope" label="Âmbito">
						<Select
							value={input.scope}
							onValueChange={(value) => {
								const scope = value as Scope
								// Trocar de âmbito pode invalidar a espécie: o ofício externo não existe
								// dentro do COMAER, e manter a escolha antiga renderizaria fecho proibido.
								const allowedKinds = kindsForScope(scope)
								const validKind = allowedKinds.some((e) => e.id === input.kind) ? input.kind : (allowedKinds[0]?.id ?? input.kind)
								onChange({ scope, kind: validKind })
							}}
						>
							<SelectTrigger id="scope" className="w-full">
								<SelectValue>{SCOPES.find((a) => a.value === input.scope)?.label}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{SCOPES.map((a) => (
									<SelectItem key={a.value} value={a.value}>
										{a.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Hint>{SCOPES.find((a) => a.value === input.scope)?.hint}</Hint>
					</Field>

					<Field id="kind" label="Espécie">
						<Select value={input.kind} onValueChange={(value) => onChange({ kind: value as string })}>
							<SelectTrigger id="kind" className="w-full">
								<SelectValue>{kind.label}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{kindsForScope(input.scope).map((e) => (
									<SelectItem key={e.id} value={e.id}>
										{e.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Hint>
							{kind.description} <span className="whitespace-nowrap font-mono text-[11px]">({kind.legalBasis})</span>
						</Hint>
					</Field>

					<Field id="classification" label="Grau de sigilo">
						<Select value={input.classification} onValueChange={(value) => onChange({ classification: value as Classification })}>
							<SelectTrigger id="classification" className="w-full">
								<SelectValue>{CLASSIFICATIONS.find((s) => s.value === input.classification)?.label}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{CLASSIFICATIONS.map((s) => (
									<SelectItem key={s.value} value={s.value}>
										{s.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>

					{kind.allowsClosing && (
						<Field id="precedence" label="Destinatário em relação ao signatário">
							<Select value={input.precedence ?? "igual"} onValueChange={(value) => onChange({ precedence: value as DocumentInput["precedence"] })}>
								<SelectTrigger id="precedence" className="w-full">
									<SelectValue>
										{input.precedence === "superior" ? "Autoridade superior" : input.precedence === "inferior" ? "Hierarquia inferior" : "Mesma hierarquia"}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="superior">Autoridade superior</SelectItem>
									<SelectItem value="igual">Mesma hierarquia</SelectItem>
									<SelectItem value="inferior">Hierarquia inferior</SelectItem>
								</SelectContent>
							</Select>
							<Hint>Decide entre “Respeitosamente” e “Atenciosamente” (art. 30).</Hint>
						</Field>
					)}
				</div>
			</Section>

			<Section title="Organização expedidora" legalBasis="Anexo I, art. 35">
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<Field id="om-name" label="Nome da OM">
						<Input
							id="om-name"
							value={input.om.name}
							onChange={(e) => onChange({ om: { ...input.om, name: e.target.value } })}
							placeholder="Instituto de Economia e Finanças da Aeronáutica"
						/>
					</Field>
					<Field id="om-acronym" label="Sigla">
						<Input
							id="om-acronym"
							value={input.om.acronym ?? ""}
							onChange={(e) => onChange({ om: { ...input.om, acronym: e.target.value } })}
							placeholder="IEFA"
						/>
					</Field>
					{kind.id === "oficio-interno-om" && (
						<Field id="om-sector" label="Setor emissor">
							<Input
								id="om-sector"
								value={input.om.sector ?? ""}
								onChange={(e) => onChange({ om: { ...input.om, sector: e.target.value } })}
								placeholder="Gabinete"
							/>
						</Field>
					)}
					{(tem("rodape-om") || kind.id === "oficio-externo") && (
						<>
							<Field id="om-address" label="Endereço">
								<Input id="om-address" value={input.om.address ?? ""} onChange={(e) => onChange({ om: { ...input.om, address: e.target.value } })} />
							</Field>
							<Field id="om-phone" label="Telefone">
								<Input id="om-phone" value={input.om.phone ?? ""} onChange={(e) => onChange({ om: { ...input.om, phone: e.target.value } })} />
							</Field>
							<Field id="om-email" label="E-mail institucional">
								<Input id="om-email" value={input.om.email ?? ""} onChange={(e) => onChange({ om: { ...input.om, email: e.target.value } })} />
							</Field>
						</>
					)}
				</div>
			</Section>

			<Section title="Numeração, protocolo e data" legalBasis="Anexo I, art. 31 e art. 35">
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
					{kind.numbering !== "nenhuma" && (
						<>
							<Field id="sequence" label="Sequencial do setor">
								<Input
									id="sequence"
									inputMode="numeric"
									value={input.numbering.sequence ?? ""}
									placeholder="s/nº quando vazio"
									onChange={(e) =>
										onChange({ numbering: { ...input.numbering, sequence: e.target.value.trim() === "" ? null : Number(e.target.value.replace(/\D/g, "")) } })
									}
								/>
								<Hint>Vazio produz “s/nº” — assunto de interesse particular (art. 51 § 6º).</Hint>
							</Field>
							<Field id="sector" label="Indicativo do setor">
								<Input
									id="sector"
									value={input.numbering.sector ?? ""}
									onChange={(e) => onChange({ numbering: { ...input.numbering, sector: e.target.value } })}
									placeholder="GAB"
								/>
							</Field>
							{kind.numbering !== "interna" && (
								<Field id="organization-number" label={kind.numbering === "parecer" ? "Ordem geral da OM" : "Numeração de ordem geral"}>
									<Input
										id="organization-number"
										value={input.numbering.organizationNumber ?? ""}
										onChange={(e) => onChange({ numbering: { ...input.numbering, organizationNumber: e.target.value } })}
										placeholder="255"
									/>
								</Field>
							)}
						</>
					)}
					{tem("nup") && (
						<Field id="nup" label="Protocolo COMAER (NUP)">
							<Input id="nup" value={input.nup ?? ""} onChange={(e) => onChange({ nup: e.target.value })} placeholder="68000.000000/2026-00" />
						</Field>
					)}
					<Field id="city" label="Localidade">
						<Input id="city" value={input.city} onChange={(e) => onChange({ city: e.target.value })} placeholder="Brasília" />
					</Field>
					<Field id="date" label="Data">
						<Input id="date" type="date" value={toDateInputValue(input.date)} onChange={(e) => onChange({ date: fromDateInputValue(e.target.value) })} />
					</Field>
				</div>
			</Section>

			{tem("preambulo") && (
				<Section title="Preâmbulo" legalBasis="Anexo I, art. 36">
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<PartyField
							id="sender"
							label="Do (cargo do remetente)"
							parte={input.sender ?? { position: "" }}
							onChange={(parte) => onChange({ sender: parte })}
						/>
					</div>
					<Separator className="my-4" />
					<div className="flex flex-col gap-3">
						<Label>Ao (destinatários)</Label>
						{input.recipients.map((destinatario, i) => (
							<div key={i} className="flex flex-col sm:flex-row gap-2 items-start">
								<div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
									<Input
										value={destinatario.position}
										onChange={(e) => onChange({ recipients: input.recipients.map((d, j) => (j === i ? { ...d, position: e.target.value } : d)) })}
										placeholder="Cargo ou sigla da OM"
										className="sm:col-span-2"
										aria-label={`Destinatário ${i + 1}`}
									/>
									<Input
										value={destinatario.via ?? ""}
										onChange={(e) => onChange({ recipients: input.recipients.map((d, j) => (j === i ? { ...d, via: e.target.value } : d)) })}
										placeholder="via (opcional)"
										aria-label={`Via do destinatário ${i + 1}`}
									/>
								</div>
								<div className="flex gap-2">
									<GenderToggle
										value={destinatario.gender ?? "m"}
										onChange={(gender) => onChange({ recipients: input.recipients.map((d, j) => (j === i ? { ...d, gender } : d)) })}
									/>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										aria-label={`Remover destinatário ${i + 1}`}
										onClick={() => onChange({ recipients: input.recipients.filter((_, j) => j !== i) })}
									>
										<Trash className="size-4" />
									</Button>
								</div>
							</div>
						))}
						<div className="flex gap-2">
							<Button type="button" variant="outline" size="sm" onClick={() => onChange({ recipients: [...input.recipients, { position: "", gender: "m" }] })}>
								<Plus className="size-4" /> Destinatário
							</Button>
							{input.recipients.length > 1 && (
								<Select
									value={input.distribution ?? "nenhuma"}
									onValueChange={(value) => onChange({ distribution: value === "nenhuma" ? undefined : (value as "circular" | "difral") })}
								>
									<SelectTrigger className="w-56">
										<SelectValue>
											{input.distribution === "circular" ? "Caráter circular" : input.distribution === "difral" ? "DIFRAL" : "Sem caráter de difusão"}
										</SelectValue>
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="nenhuma">Sem caráter de difusão</SelectItem>
										<SelectItem value="circular">Caráter circular</SelectItem>
										<SelectItem value="difral">DIFRAL</SelectItem>
									</SelectContent>
								</Select>
							)}
						</div>
					</div>
				</Section>
			)}

			{tem("enderecamento") && (
				<Section title="Endereçamento" legalBasis="Anexo I, art. 51 § 9º, VIII">
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<Field id="form-of-address" label="Forma de tratamento">
							<Select
								value={input.addressing?.formOfAddress ?? "senhoria"}
								onValueChange={(value) => onChange({ addressing: { gender: "m", ...input.addressing, formOfAddress: value as "excelencia" | "senhoria" } })}
							>
								<SelectTrigger id="form-of-address" className="w-full">
									<SelectValue>{input.addressing?.formOfAddress === "excelencia" ? "Vossa Excelência" : "Vossa Senhoria"}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="excelencia">Vossa Excelência</SelectItem>
									<SelectItem value="senhoria">Vossa Senhoria</SelectItem>
								</SelectContent>
							</Select>
							<Hint>Só fora do Executivo Federal: com agente público federal, o pronome é sempre “Senhor” (art. 9º § 3º).</Hint>
						</Field>
						<Field id="recipient-name" label="Nome do destinatário">
							<Input
								id="recipient-name"
								value={input.addressing?.name ?? ""}
								onChange={(e) => onChange({ addressing: { formOfAddress: "senhoria", gender: "m", ...input.addressing, name: e.target.value } })}
							/>
						</Field>
						<Field id="recipient-position" label="Cargo">
							<Input
								id="recipient-position"
								value={input.addressing?.position ?? ""}
								onChange={(e) => onChange({ addressing: { formOfAddress: "senhoria", gender: "m", ...input.addressing, position: e.target.value } })}
							/>
						</Field>
						<Field id="recipient-gender" label="Gênero do tratamento">
							<GenderToggle
								value={input.addressing?.gender ?? "m"}
								onChange={(gender) => onChange({ addressing: { formOfAddress: "senhoria", ...input.addressing, gender } })}
							/>
						</Field>
						<Field id="recipient-address" label="Endereço" className="sm:col-span-2">
							<Textarea
								id="recipient-address"
								rows={2}
								value={(input.addressing?.addressLines ?? []).join("\n")}
								onChange={(e) =>
									// Sem `filter(Boolean)`: ele comia a linha vazia recém-criada, o React restaurava
									// o valor controlado inalterado e o Enter não fazia nada — o endereço de duas
									// linhas do placeholder só era alcançável colando. Linha em branco não vira
									// bloco: a montagem já descarta linha sem texto.
									onChange({
										addressing: { formOfAddress: "senhoria", gender: "m", ...input.addressing, addressLines: e.target.value.split("\n") },
									})
								}
								placeholder={"Rua ABC, nº 123\nCEP 01010-000 - São Paulo - SP"}
							/>
						</Field>
					</div>
				</Section>
			)}

			{tem("vocativo") && (
				<Section title="Vocativo" legalBasis="Anexo I, art. 10">
					<Field id="vocativo" label="Vocativo (vazio usa “Senhor” + cargo)">
						<Input id="vocativo" value={input.vocativo ?? ""} onChange={(e) => onChange({ vocativo: e.target.value })} placeholder="Senhor Juiz," />
					</Field>
				</Section>
			)}

			{tem("ementa") && (
				<Section title="Ementa" legalBasis="Anexo I, art. 37">
					<Field id="subject" label="Assunto">
						<Input
							id="subject"
							value={input.subject ?? ""}
							onChange={(e) => onChange({ subject: e.target.value })}
							placeholder="Alteração de período de férias"
						/>
					</Field>
					{kind.id !== "oficio-externo" && (
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
							<EditableList
								label="Referências"
								items={input.references ?? []}
								onChange={(references) => onChange({ references })}
								placeholder="Ofício nº 136/DP/1288, de 06 mar. 2026, do GAP-AF"
							/>
							<EditableList label="Anexos" items={input.annexes ?? []} onChange={(annexes) => onChange({ annexes })} placeholder="Três folhas de alterações" />
						</div>
					)}
				</Section>
			)}

			{tem("processo") && (
				<Section title="Processo de origem" legalBasis="Anexo I, art. 48 § 3º">
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<Field id="process-nup" label="NUP do processo">
							<Input id="process-nup" value={input.process?.nup ?? ""} onChange={(e) => onChange({ process: { ...input.process, nup: e.target.value } })} />
						</Field>
						<Field id="process-reference" label="Documento de origem">
							<Input
								id="process-reference"
								value={input.process?.reference ?? ""}
								onChange={(e) => onChange({ process: { ...input.process, reference: e.target.value } })}
								placeholder="Ofício nº 8/DLE/2045, de 22 abr. 2026, do COMGEP"
							/>
						</Field>
						{kind.id === "despacho" && (
							<Field id="despacho-order" label="Ordem do despacho">
								<Input
									id="despacho-order"
									inputMode="numeric"
									value={input.despachoOrder ?? 1}
									onChange={(e) => onChange({ despachoOrder: Number(e.target.value.replace(/\D/g, "")) || 1 })}
								/>
								<Hint>Os despachos são juntados em ordem cronológica crescente (art. 48 § 3º, VI).</Hint>
							</Field>
						)}
					</div>
				</Section>
			)}

			{kind.id === "despacho-decisorio" && (
				<Section title="Decisão" legalBasis="Anexo I, art. 49 § 2º, III">
					<Field id="decision" label="Abertura do texto">
						<Select value={input.decision ?? "DEFERIDO"} onValueChange={(value) => onChange({ decision: value as DocumentInput["decision"] })}>
							<SelectTrigger id="decision" className="w-full">
								<SelectValue>{input.decision ?? "DEFERIDO"}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{["DEFERIDO", "DEFERIDA", "INDEFERIDO", "INDEFERIDA", "ARQUIVE-SE"].map((d) => (
									<SelectItem key={d} value={d}>
										{d}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
				</Section>
			)}

			<Section title="Texto" legalBasis="Anexo I, art. 38 e art. 39">
				{kind.suggestedOpening && <Hint>Esta espécie abre por “{kind.suggestedOpening.trim()}…”.</Hint>}
				<BodyEditor paragraphs={input.paragraphs} onChange={(paragraphs) => onChange({ paragraphs })} />
			</Section>

			<Section title="Identificação do signatário" legalBasis="Anexo I, art. 40">
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<Field id="signer-name" label="Nome completo">
						<Input id="signer-name" value={input.signer.name} onChange={(e) => onChange({ signer: { ...input.signer, name: e.target.value } })} />
					</Field>
					<Field id="signer-rank" label="Posto ou graduação">
						<Select value={input.signer.rank || null} onValueChange={(value) => onChange({ signer: { ...input.signer, rank: value as string } })}>
							<SelectTrigger id="signer-rank" className="w-full">
								<SelectValue placeholder="Selecione">{input.signer.rank || undefined}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{FAB_RANKS.map((p) => (
									<SelectItem key={p.acronym} value={p.acronym}>
										{p.acronym} — {p.inFull}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
					<Field id="signer-quadro" label="Quadro ou especialidade">
						<Input
							id="signer-quadro"
							list="quadros-comaer"
							value={input.signer.quadro ?? ""}
							onChange={(e) => onChange({ signer: { ...input.signer, quadro: e.target.value } })}
							placeholder="Int"
						/>
						<datalist id="quadros-comaer">
							{Object.keys(QUADROS_IN_FULL).map((q) => (
								<option key={q} value={q} />
							))}
						</datalist>
					</Field>
					<Field id="signer-position" label="Cargo">
						<Input
							id="signer-position"
							value={input.signer.position ?? ""}
							onChange={(e) => onChange({ signer: { ...input.signer, position: e.target.value } })}
						/>
					</Field>
					<Field id="signer-om" label="OM do signatário">
						<Input id="signer-om" value={input.signer.om ?? ""} onChange={(e) => onChange({ signer: { ...input.signer, om: e.target.value } })} />
					</Field>
					<Field id="signer-by-order" label="Assinado por ordem de (opcional)">
						<Input
							id="signer-by-order"
							value={input.signer.byOrderOf ?? ""}
							onChange={(e) => onChange({ signer: { ...input.signer, byOrderOf: e.target.value || undefined } })}
							placeholder="Comandante-Geral de Apoio"
						/>
						<Hint>O texto passa a exigir abertura “Por ordem do…” ou “Incumbiu-me o…” (art. 40 § 9º).</Hint>
					</Field>
				</div>
			</Section>
		</div>
	)
}

function Section({ title, legalBasis, children }: { title: string; legalBasis: string; children: ReactNode }) {
	return (
		<section className="border border-border p-4">
			<div className="flex items-baseline justify-between gap-3 mb-4">
				<h3 className="text-sm font-semibold tracking-tight uppercase">{title}</h3>
				<span className="text-[11px] font-mono text-muted-foreground">{legalBasis}</span>
			</div>
			{children}
		</section>
	)
}

function Field({ id, label, className, children }: { id: string; label: string; className?: string; children: ReactNode }) {
	return (
		<div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
			<Label htmlFor={id}>{label}</Label>
			{children}
		</div>
	)
}

function Hint({ children }: { children: ReactNode }) {
	return <p className="text-xs text-muted-foreground">{children}</p>
}

function GenderToggle({ value, onChange }: { value: "m" | "f"; onChange: (gender: "m" | "f") => void }) {
	// "Do Chefe" × "Da Diretora", "Ao" × "À": a concordância do art. 36 é escolha de quem
	// redige, não algo que dê para inferir do cargo digitado.
	return (
		<div className="flex border border-input">
			{(["m", "f"] as const).map((g) => (
				<button
					key={g}
					type="button"
					onClick={() => onChange(g)}
					aria-pressed={value === g}
					className={`px-3 h-8 text-xs transition-colors ${value === g ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
				>
					{g === "m" ? "Do / Ao" : "Da / À"}
				</button>
			))}
		</div>
	)
}

function PartyField({ id, label, parte, onChange }: { id: string; label: string; parte: Party; onChange: (parte: Party) => void }) {
	return (
		<div className="flex flex-col gap-1.5 sm:col-span-2">
			<Label htmlFor={id}>{label}</Label>
			<div className="flex gap-2">
				<Input
					id={id}
					value={parte.position}
					onChange={(e) => onChange({ ...parte, position: e.target.value })}
					placeholder="Diretor do Instituto de Economia e Finanças da Aeronáutica"
				/>
				<GenderToggle value={parte.gender ?? "m"} onChange={(gender) => onChange({ ...parte, gender })} />
			</div>
		</div>
	)
}

function EditableList({ label, items, onChange, placeholder }: { label: string; items: string[]; onChange: (items: string[]) => void; placeholder?: string }) {
	return (
		<div className="flex flex-col gap-2">
			<Label>{label}</Label>
			{items.map((item, i) => (
				<div key={i} className="flex gap-2">
					<Input
						value={item}
						onChange={(e) => onChange(items.map((it, j) => (j === i ? e.target.value : it)))}
						placeholder={placeholder}
						aria-label={`${label} ${i + 1}`}
					/>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						aria-label={`Remover ${label.toLowerCase()} ${i + 1}`}
						onClick={() => onChange(items.filter((_, j) => j !== i))}
					>
						<Trash className="size-4" />
					</Button>
				</div>
			))}
			<Button type="button" variant="outline" size="sm" className="self-start" onClick={() => onChange([...items, ""])}>
				<Plus className="size-4" /> Adicionar
			</Button>
		</div>
	)
}
