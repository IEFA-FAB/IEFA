import type React from "react"
import { useId } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { DocumentKind } from "@/lib/comaer/catalog"
import { fromDateInputValue, toDateInputValue } from "@/lib/comaer/draft"
import { RANKS } from "@/lib/comaer/ranks"
import type { DocumentInput } from "@/lib/comaer/types"

const FAB_RANKS = RANKS.filter((r) => r.force === "aer")

/**
 * Dados do expediente: a identidade do documento.
 *
 * Fica visível nos DOIS modos porque a redação assistida não pode preenchê-los — ela
 * pergunta "qual a sua OM?" e, sem este bloco, não havia onde escrever a resposta. A
 * conversa entrava num beco: perguntava, a pessoa respondia no chat, nada acontecia.
 *
 * O contador existe para dizer, sem alarde, quanto falta para o documento poder ser
 * despachado — e para que "faltam 3" seja verificável de relance.
 */
export function IdentityPanel({ input, kind, onChange }: { input: DocumentInput; kind: DocumentKind; onChange: (patch: Partial<DocumentInput>) => void }) {
	const ids = useId()
	const field = (name: string) => `${ids}-${name}`

	// O denominador conta só o que ESTA espécie mostra: a Ata não tem numeração e o Parecer
	// não tem NUP. Dividir sempre por oito exibia um débito contra campos que não existem na
	// tela, e que a pessoa nunca conseguiria zerar.
	const numbered = kind.numbering !== "nenhuma"
	const hasNup = kind.blocks.includes("nup")
	const required: string[] = [
		input.om.name.trim(),
		...(numbered ? [input.numbering.sequence !== null ? "n" : "", input.numbering.sector?.trim() ?? ""] : []),
		...(hasNup ? [input.nup?.trim() ?? ""] : []),
		input.city.trim(),
		input.signer.name.trim(),
		input.signer.rank?.trim() ?? "",
		input.signer.position?.trim() ?? "",
	]
	const filled = required.filter(Boolean).length

	return (
		<section className="border border-border p-4 flex flex-col gap-4">
			<div className="flex items-baseline justify-between gap-3">
				<h2 className="text-label text-foreground">Dados do documento</h2>
				<span className="text-label text-muted-foreground">
					{filled} de {required.length} preenchidos
				</span>
			</div>

			<p className="text-xs text-muted-foreground">
				São seus, não da redação assistida: número, NUP, OM, localidade e signatário nunca são inventados por ela.
			</p>

			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
				<Campo id={field("om")} label="OM expedidora" hint="Nome por extenso, como sai na epígrafe (art. 35, I)." required>
					<Input
						id={field("om")}
						aria-describedby={`${field("om")}-hint`}
						value={input.om.name}
						onChange={(e) => onChange({ om: { ...input.om, name: e.target.value } })}
						placeholder="Instituto de Economia e Finanças da Aeronáutica"
					/>
				</Campo>

				<Campo id={field("acronym")} label="Sigla">
					<Input
						id={field("acronym")}
						value={input.om.acronym ?? ""}
						onChange={(e) => onChange({ om: { ...input.om, acronym: e.target.value } })}
						placeholder="IEFA"
					/>
				</Campo>

				<Campo id={field("city")} label="Localidade" hint="A cidade onde o documento é expedido; abre a linha da data." required>
					<Input
						id={field("city")}
						aria-describedby={`${field("city")}-hint`}
						value={input.city}
						onChange={(e) => onChange({ city: e.target.value })}
						placeholder="Rio de Janeiro"
					/>
				</Campo>

				{kind.numbering !== "nenhuma" && (
					<>
						<Campo
							id={field("sequence")}
							label="Sequencial da seção"
							hint='Vem do controle da sua seção. Em branco, o documento sai como "s/nº", forma reservada ao expediente de interesse particular (art. 51 § 6º).'
							required
						>
							<Input
								id={field("sequence")}
								aria-describedby={`${field("sequence")}-hint`}
								inputMode="numeric"
								value={input.numbering.sequence ?? ""}
								placeholder="34"
								onChange={(e) => {
									const digits = e.target.value.replace(/\D/g, "")
									onChange({ numbering: { ...input.numbering, sequence: digits === "" ? null : Number(digits) } })
								}}
							/>
						</Campo>

						<Campo id={field("sector")} label="Indicativo do setor" required>
							<Input
								id={field("sector")}
								value={input.numbering.sector ?? ""}
								onChange={(e) => onChange({ numbering: { ...input.numbering, sector: e.target.value } })}
								placeholder="GAB"
							/>
						</Campo>

						{kind.numbering !== "interna" && (
							<Campo
								id={field("organization")}
								label="Numeração de ordem geral da organização"
								hint="O contador único da OM, o último número da linha: Ofício nº 34/GAB/255 (art. 31 § 1º, IV)."
							>
								<Input
									id={field("organization")}
									aria-describedby={`${field("organization")}-hint`}
									value={input.numbering.organizationNumber ?? ""}
									onChange={(e) => onChange({ numbering: { ...input.numbering, organizationNumber: e.target.value } })}
									placeholder="255"
								/>
							</Campo>
						)}
					</>
				)}

				{kind.blocks.includes("nup") && (
					<Campo id={field("nup")} label="Protocolo COMAER (NUP)" hint="Peça ao protocolo da OM ou copie o do processo no SIGADAER. São 17 dígitos." required>
						<Input
							id={field("nup")}
							aria-describedby={`${field("nup")}-hint`}
							value={input.nup ?? ""}
							onChange={(e) => onChange({ nup: e.target.value })}
							placeholder="68000.000000/2026-00"
						/>
					</Campo>
				)}

				<Campo id={field("date")} label="Data">
					<Input id={field("date")} type="date" value={toDateInputValue(input.date)} onChange={(e) => onChange({ date: fromDateInputValue(e.target.value) })} />
				</Campo>

				<Campo id={field("signer")} label="Signatário" required>
					<Input
						id={field("signer")}
						value={input.signer.name}
						onChange={(e) => onChange({ signer: { ...input.signer, name: e.target.value } })}
						placeholder="Fulano de Tal"
					/>
				</Campo>

				<Campo id={field("rank")} label="Posto ou graduação" hint="Escolha da lista: em documento externo o posto sai por extenso (art. 26)." required>
					<Select value={input.signer.rank || null} onValueChange={(value) => onChange({ signer: { ...input.signer, rank: value as string } })}>
						<SelectTrigger id={field("rank")} aria-describedby={`${field("rank")}-hint`} className="w-full">
							<SelectValue placeholder="Selecione">{input.signer.rank || undefined}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{FAB_RANKS.map((rank) => (
								<SelectItem key={rank.acronym} value={rank.acronym}>
									{rank.acronym}: {rank.inFull}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Campo>

				<Campo id={field("position")} label="Cargo do signatário" required>
					<Input
						id={field("position")}
						value={input.signer.position ?? ""}
						onChange={(e) => onChange({ signer: { ...input.signer, position: e.target.value } })}
						placeholder="Diretor"
					/>
				</Campo>
			</div>
		</section>
	)
}

function Campo({ id, label, hint, required, children }: { id: string; label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor={id}>
				{label}
				{required && (
					<span className="text-muted-foreground" aria-hidden>
						{" "}
						*
					</span>
				)}
			</Label>
			{children}
			{/* A ajuda é ligada ao campo: solta, ela nunca chega a quem usa leitor de tela — e
			    é nela que a regra da norma está escrita. */}
			{hint && (
				<p id={`${id}-hint`} className="text-xs text-muted-foreground">
					{hint}
				</p>
			)}
		</div>
	)
}
