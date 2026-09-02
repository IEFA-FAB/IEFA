import { Plus, Trash } from "iconoir-react"
import type { ReactNode } from "react"
import { EditorTexto } from "@/components/comaer/EditorTexto"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { type Especie, especiesPorAmbito } from "@/lib/comaer/especies"
import { POSTOS_GRADUACOES, QUADROS_POR_EXTENSO } from "@/lib/comaer/postos"
import { deInputDate, paraInputDate } from "@/lib/comaer/rascunho"
import type { Ambito, DocumentoInput, Parte, Sigilo } from "@/lib/comaer/tipos"

/**
 * Formulário derivado do catálogo de espécies.
 *
 * Nenhum campo é decidido aqui: quem manda é `especie.blocos`. É o que torna a ferramenta
 * "menos travada" que a do SUCONT — acrescentar o Parecer ou a Ata ao catálogo faz o
 * formulário mudar sozinho, sem uma tela nova por espécie e sem campo de ofício aparecendo
 * onde a norma não o prevê.
 */

const AMBITOS: { valor: Ambito; rotulo: string; ajuda: string }[] = [
	{ valor: "interno-om", rotulo: "Interno à OM", ajuda: "Tramita entre setores da própria Organização Militar." },
	{ valor: "comaer", rotulo: "Entre OM do COMAER", ajuda: "Documento interno ao Comando da Aeronáutica." },
	{ valor: "externo", rotulo: "Externo ao COMAER", ajuda: "Órgão externo ou particular — posto e cargo por extenso." },
]

const SIGILOS: { valor: Sigilo; rotulo: string }[] = [
	{ valor: "ostensivo", rotulo: "Ostensivo" },
	{ valor: "reservado", rotulo: "Reservado (R-)" },
	{ valor: "secreto", rotulo: "Secreto (S-)" },
	{ valor: "ultrassecreto", rotulo: "Ultrassecreto (US-)" },
]

const POSTOS_FAB = POSTOS_GRADUACOES.filter((p) => p.forca === "aer")

interface Props {
	input: DocumentoInput
	especie: Especie
	onChange: (patch: Partial<DocumentoInput>) => void
}

export function FormularioDocumento({ input, especie, onChange }: Props) {
	const tem = (bloco: string) => especie.blocos.includes(bloco as never)

	return (
		<div className="flex flex-col gap-8">
			<Secao titulo="Espécie e âmbito" fundamento="Anexo I, art. 7º e cap. VIII">
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<Campo id="ambito" rotulo="Âmbito">
						<Select
							value={input.ambito}
							onValueChange={(valor) => {
								const ambito = valor as Ambito
								// Trocar de âmbito pode invalidar a espécie: o ofício externo não existe
								// dentro do COMAER, e manter a escolha antiga renderizaria fecho proibido.
								const permitidas = especiesPorAmbito(ambito)
								const especieValida = permitidas.some((e) => e.id === input.especie) ? input.especie : (permitidas[0]?.id ?? input.especie)
								onChange({ ambito, especie: especieValida })
							}}
						>
							<SelectTrigger id="ambito" className="w-full">
								<SelectValue>{AMBITOS.find((a) => a.valor === input.ambito)?.rotulo}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{AMBITOS.map((a) => (
									<SelectItem key={a.valor} value={a.valor}>
										{a.rotulo}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Ajuda>{AMBITOS.find((a) => a.valor === input.ambito)?.ajuda}</Ajuda>
					</Campo>

					<Campo id="especie" rotulo="Espécie">
						<Select value={input.especie} onValueChange={(valor) => onChange({ especie: valor as string })}>
							<SelectTrigger id="especie" className="w-full">
								<SelectValue>{especie.rotulo}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{especiesPorAmbito(input.ambito).map((e) => (
									<SelectItem key={e.id} value={e.id}>
										{e.rotulo}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Ajuda>
							{especie.descricao} <span className="whitespace-nowrap font-mono text-[11px]">({especie.fundamento})</span>
						</Ajuda>
					</Campo>

					<Campo id="sigilo" rotulo="Grau de sigilo">
						<Select value={input.sigilo} onValueChange={(valor) => onChange({ sigilo: valor as Sigilo })}>
							<SelectTrigger id="sigilo" className="w-full">
								<SelectValue>{SIGILOS.find((s) => s.valor === input.sigilo)?.rotulo}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{SIGILOS.map((s) => (
									<SelectItem key={s.valor} value={s.valor}>
										{s.rotulo}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Campo>

					{especie.permiteFecho && (
						<Campo id="precedencia" rotulo="Destinatário em relação ao signatário">
							<Select value={input.precedencia ?? "igual"} onValueChange={(valor) => onChange({ precedencia: valor as DocumentoInput["precedencia"] })}>
								<SelectTrigger id="precedencia" className="w-full">
									<SelectValue>
										{input.precedencia === "superior" ? "Autoridade superior" : input.precedencia === "inferior" ? "Hierarquia inferior" : "Mesma hierarquia"}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="superior">Autoridade superior</SelectItem>
									<SelectItem value="igual">Mesma hierarquia</SelectItem>
									<SelectItem value="inferior">Hierarquia inferior</SelectItem>
								</SelectContent>
							</Select>
							<Ajuda>Decide entre “Respeitosamente” e “Atenciosamente” (art. 30).</Ajuda>
						</Campo>
					)}
				</div>
			</Secao>

			<Secao titulo="Organização expedidora" fundamento="Anexo I, art. 35">
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<Campo id="om-nome" rotulo="Nome da OM">
						<Input
							id="om-nome"
							value={input.om.nome}
							onChange={(e) => onChange({ om: { ...input.om, nome: e.target.value } })}
							placeholder="Instituto de Economia e Finanças da Aeronáutica"
						/>
					</Campo>
					<Campo id="om-sigla" rotulo="Sigla">
						<Input id="om-sigla" value={input.om.sigla ?? ""} onChange={(e) => onChange({ om: { ...input.om, sigla: e.target.value } })} placeholder="IEFA" />
					</Campo>
					{especie.id === "oficio-interno-om" && (
						<Campo id="om-setor" rotulo="Setor emissor">
							<Input
								id="om-setor"
								value={input.om.setor ?? ""}
								onChange={(e) => onChange({ om: { ...input.om, setor: e.target.value } })}
								placeholder="Gabinete"
							/>
						</Campo>
					)}
					{(tem("rodape-om") || especie.id === "oficio-externo") && (
						<>
							<Campo id="om-endereco" rotulo="Endereço">
								<Input id="om-endereco" value={input.om.endereco ?? ""} onChange={(e) => onChange({ om: { ...input.om, endereco: e.target.value } })} />
							</Campo>
							<Campo id="om-telefone" rotulo="Telefone">
								<Input id="om-telefone" value={input.om.telefone ?? ""} onChange={(e) => onChange({ om: { ...input.om, telefone: e.target.value } })} />
							</Campo>
							<Campo id="om-email" rotulo="E-mail institucional">
								<Input id="om-email" value={input.om.email ?? ""} onChange={(e) => onChange({ om: { ...input.om, email: e.target.value } })} />
							</Campo>
						</>
					)}
				</div>
			</Secao>

			<Secao titulo="Numeração, protocolo e data" fundamento="Anexo I, art. 31 e art. 35">
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
					{especie.numeracao !== "nenhuma" && (
						<>
							<Campo id="sequencial" rotulo="Sequencial do setor">
								<Input
									id="sequencial"
									inputMode="numeric"
									value={input.numeracao.sequencial ?? ""}
									placeholder="s/nº quando vazio"
									onChange={(e) =>
										onChange({ numeracao: { ...input.numeracao, sequencial: e.target.value.trim() === "" ? null : Number(e.target.value.replace(/\D/g, "")) } })
									}
								/>
								<Ajuda>Vazio produz “s/nº” — assunto de interesse particular (art. 51 § 6º).</Ajuda>
							</Campo>
							<Campo id="setor" rotulo="Indicativo do setor">
								<Input
									id="setor"
									value={input.numeracao.setor ?? ""}
									onChange={(e) => onChange({ numeracao: { ...input.numeracao, setor: e.target.value } })}
									placeholder="GAB"
								/>
							</Campo>
							{especie.numeracao !== "interna" && (
								<Campo id="ordem-geral" rotulo={especie.numeracao === "parecer" ? "Ordem geral da OM" : "Numeração de ordem geral"}>
									<Input
										id="ordem-geral"
										value={input.numeracao.ordemGeral ?? ""}
										onChange={(e) => onChange({ numeracao: { ...input.numeracao, ordemGeral: e.target.value } })}
										placeholder="255"
									/>
								</Campo>
							)}
						</>
					)}
					{tem("nup") && (
						<Campo id="nup" rotulo="Protocolo COMAER (NUP)">
							<Input id="nup" value={input.nup ?? ""} onChange={(e) => onChange({ nup: e.target.value })} placeholder="68000.000000/2026-00" />
						</Campo>
					)}
					<Campo id="localidade" rotulo="Localidade">
						<Input id="localidade" value={input.localidade} onChange={(e) => onChange({ localidade: e.target.value })} placeholder="Brasília" />
					</Campo>
					<Campo id="data" rotulo="Data">
						<Input id="data" type="date" value={paraInputDate(input.data)} onChange={(e) => onChange({ data: deInputDate(e.target.value) })} />
					</Campo>
				</div>
			</Secao>

			{tem("preambulo") && (
				<Secao titulo="Preâmbulo" fundamento="Anexo I, art. 36">
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<CampoParte
							id="remetente"
							rotulo="Do (cargo do remetente)"
							parte={input.remetente ?? { cargo: "" }}
							onChange={(parte) => onChange({ remetente: parte })}
						/>
					</div>
					<Separator className="my-4" />
					<div className="flex flex-col gap-3">
						<Label>Ao (destinatários)</Label>
						{input.destinatarios.map((destinatario, i) => (
							<div key={i} className="flex flex-col sm:flex-row gap-2 items-start">
								<div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
									<Input
										value={destinatario.cargo}
										onChange={(e) => onChange({ destinatarios: input.destinatarios.map((d, j) => (j === i ? { ...d, cargo: e.target.value } : d)) })}
										placeholder="Cargo ou sigla da OM"
										className="sm:col-span-2"
										aria-label={`Destinatário ${i + 1}`}
									/>
									<Input
										value={destinatario.via ?? ""}
										onChange={(e) => onChange({ destinatarios: input.destinatarios.map((d, j) => (j === i ? { ...d, via: e.target.value } : d)) })}
										placeholder="via (opcional)"
										aria-label={`Via do destinatário ${i + 1}`}
									/>
								</div>
								<div className="flex gap-2">
									<GeneroToggle
										valor={destinatario.genero ?? "m"}
										onChange={(genero) => onChange({ destinatarios: input.destinatarios.map((d, j) => (j === i ? { ...d, genero } : d)) })}
									/>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										aria-label={`Remover destinatário ${i + 1}`}
										onClick={() => onChange({ destinatarios: input.destinatarios.filter((_, j) => j !== i) })}
									>
										<Trash className="size-4" />
									</Button>
								</div>
							</div>
						))}
						<div className="flex gap-2">
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => onChange({ destinatarios: [...input.destinatarios, { cargo: "", genero: "m" }] })}
							>
								<Plus className="size-4" /> Destinatário
							</Button>
							{input.destinatarios.length > 1 && (
								<Select
									value={input.difusao ?? "nenhuma"}
									onValueChange={(valor) => onChange({ difusao: valor === "nenhuma" ? undefined : (valor as "circular" | "difral") })}
								>
									<SelectTrigger className="w-56">
										<SelectValue>
											{input.difusao === "circular" ? "Caráter circular" : input.difusao === "difral" ? "DIFRAL" : "Sem caráter de difusão"}
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
				</Secao>
			)}

			{tem("enderecamento") && (
				<Secao titulo="Endereçamento" fundamento="Anexo I, art. 51 § 9º, VIII">
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<Campo id="tratamento" rotulo="Forma de tratamento">
							<Select
								value={input.enderecamento?.tratamento ?? "senhoria"}
								onValueChange={(valor) => onChange({ enderecamento: { genero: "m", ...input.enderecamento, tratamento: valor as "excelencia" | "senhoria" } })}
							>
								<SelectTrigger id="tratamento" className="w-full">
									<SelectValue>{input.enderecamento?.tratamento === "excelencia" ? "Vossa Excelência" : "Vossa Senhoria"}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="excelencia">Vossa Excelência</SelectItem>
									<SelectItem value="senhoria">Vossa Senhoria</SelectItem>
								</SelectContent>
							</Select>
							<Ajuda>Só fora do Executivo Federal: com agente público federal, o pronome é sempre “Senhor” (art. 9º § 3º).</Ajuda>
						</Campo>
						<Campo id="dest-nome" rotulo="Nome do destinatário">
							<Input
								id="dest-nome"
								value={input.enderecamento?.nome ?? ""}
								onChange={(e) => onChange({ enderecamento: { tratamento: "senhoria", genero: "m", ...input.enderecamento, nome: e.target.value } })}
							/>
						</Campo>
						<Campo id="dest-cargo" rotulo="Cargo">
							<Input
								id="dest-cargo"
								value={input.enderecamento?.cargo ?? ""}
								onChange={(e) => onChange({ enderecamento: { tratamento: "senhoria", genero: "m", ...input.enderecamento, cargo: e.target.value } })}
							/>
						</Campo>
						<Campo id="dest-genero" rotulo="Gênero do tratamento">
							<GeneroToggle
								valor={input.enderecamento?.genero ?? "m"}
								onChange={(genero) => onChange({ enderecamento: { tratamento: "senhoria", ...input.enderecamento, genero } })}
							/>
						</Campo>
						<Campo id="dest-endereco" rotulo="Endereço" className="sm:col-span-2">
							<Textarea
								id="dest-endereco"
								rows={2}
								value={(input.enderecamento?.linhasEndereco ?? []).join("\n")}
								onChange={(e) =>
									// Sem `filter(Boolean)`: ele comia a linha vazia recém-criada, o React restaurava
									// o valor controlado inalterado e o Enter não fazia nada — o endereço de duas
									// linhas do placeholder só era alcançável colando. Linha em branco não vira
									// bloco: a montagem já descarta linha sem texto.
									onChange({
										enderecamento: { tratamento: "senhoria", genero: "m", ...input.enderecamento, linhasEndereco: e.target.value.split("\n") },
									})
								}
								placeholder={"Rua ABC, nº 123\nCEP 01010-000 - São Paulo - SP"}
							/>
						</Campo>
					</div>
				</Secao>
			)}

			{tem("vocativo") && (
				<Secao titulo="Vocativo" fundamento="Anexo I, art. 10">
					<Campo id="vocativo" rotulo="Vocativo (vazio usa “Senhor” + cargo)">
						<Input id="vocativo" value={input.vocativo ?? ""} onChange={(e) => onChange({ vocativo: e.target.value })} placeholder="Senhor Juiz," />
					</Campo>
				</Secao>
			)}

			{tem("ementa") && (
				<Secao titulo="Ementa" fundamento="Anexo I, art. 37">
					<Campo id="assunto" rotulo="Assunto">
						<Input
							id="assunto"
							value={input.assunto ?? ""}
							onChange={(e) => onChange({ assunto: e.target.value })}
							placeholder="Alteração de período de férias"
						/>
					</Campo>
					{especie.id !== "oficio-externo" && (
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
							<ListaEditavel
								rotulo="Referências"
								itens={input.referencias ?? []}
								onChange={(referencias) => onChange({ referencias })}
								placeholder="Ofício nº 136/DP/1288, de 06 mar. 2026, do GAP-AF"
							/>
							<ListaEditavel rotulo="Anexos" itens={input.anexos ?? []} onChange={(anexos) => onChange({ anexos })} placeholder="Três folhas de alterações" />
						</div>
					)}
				</Secao>
			)}

			{tem("processo") && (
				<Secao titulo="Processo de origem" fundamento="Anexo I, art. 48 § 3º">
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<Campo id="proc-nup" rotulo="NUP do processo">
							<Input id="proc-nup" value={input.processo?.nup ?? ""} onChange={(e) => onChange({ processo: { ...input.processo, nup: e.target.value } })} />
						</Campo>
						<Campo id="proc-ref" rotulo="Documento de origem">
							<Input
								id="proc-ref"
								value={input.processo?.referencia ?? ""}
								onChange={(e) => onChange({ processo: { ...input.processo, referencia: e.target.value } })}
								placeholder="Ofício nº 8/DLE/2045, de 22 abr. 2026, do COMGEP"
							/>
						</Campo>
						{especie.id === "despacho" && (
							<Campo id="ordem-despacho" rotulo="Ordem do despacho">
								<Input
									id="ordem-despacho"
									inputMode="numeric"
									value={input.ordemDespacho ?? 1}
									onChange={(e) => onChange({ ordemDespacho: Number(e.target.value.replace(/\D/g, "")) || 1 })}
								/>
								<Ajuda>Os despachos são juntados em ordem cronológica crescente (art. 48 § 3º, VI).</Ajuda>
							</Campo>
						)}
					</div>
				</Secao>
			)}

			{especie.id === "despacho-decisorio" && (
				<Secao titulo="Decisão" fundamento="Anexo I, art. 49 § 2º, III">
					<Campo id="decisao" rotulo="Abertura do texto">
						<Select value={input.decisao ?? "DEFERIDO"} onValueChange={(valor) => onChange({ decisao: valor as DocumentoInput["decisao"] })}>
							<SelectTrigger id="decisao" className="w-full">
								<SelectValue>{input.decisao ?? "DEFERIDO"}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{["DEFERIDO", "DEFERIDA", "INDEFERIDO", "INDEFERIDA", "ARQUIVE-SE"].map((d) => (
									<SelectItem key={d} value={d}>
										{d}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Campo>
				</Secao>
			)}

			<Secao titulo="Texto" fundamento="Anexo I, art. 38 e art. 39">
				{especie.aberturaSugerida && <Ajuda>Esta espécie abre por “{especie.aberturaSugerida.trim()}…”.</Ajuda>}
				<EditorTexto paragrafos={input.paragrafos} onChange={(paragrafos) => onChange({ paragrafos })} />
			</Secao>

			<Secao titulo="Identificação do signatário" fundamento="Anexo I, art. 40">
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<Campo id="sig-nome" rotulo="Nome completo">
						<Input id="sig-nome" value={input.signatario.nome} onChange={(e) => onChange({ signatario: { ...input.signatario, nome: e.target.value } })} />
					</Campo>
					<Campo id="sig-posto" rotulo="Posto ou graduação">
						<Select value={input.signatario.posto || null} onValueChange={(valor) => onChange({ signatario: { ...input.signatario, posto: valor as string } })}>
							<SelectTrigger id="sig-posto" className="w-full">
								<SelectValue placeholder="Selecione">{input.signatario.posto || undefined}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{POSTOS_FAB.map((p) => (
									<SelectItem key={p.sigla} value={p.sigla}>
										{p.sigla} — {p.extenso}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Campo>
					<Campo id="sig-quadro" rotulo="Quadro ou especialidade">
						<Input
							id="sig-quadro"
							list="quadros-comaer"
							value={input.signatario.quadro ?? ""}
							onChange={(e) => onChange({ signatario: { ...input.signatario, quadro: e.target.value } })}
							placeholder="Int"
						/>
						<datalist id="quadros-comaer">
							{Object.keys(QUADROS_POR_EXTENSO).map((q) => (
								<option key={q} value={q} />
							))}
						</datalist>
					</Campo>
					<Campo id="sig-cargo" rotulo="Cargo">
						<Input
							id="sig-cargo"
							value={input.signatario.cargo ?? ""}
							onChange={(e) => onChange({ signatario: { ...input.signatario, cargo: e.target.value } })}
						/>
					</Campo>
					<Campo id="sig-om" rotulo="OM do signatário">
						<Input id="sig-om" value={input.signatario.om ?? ""} onChange={(e) => onChange({ signatario: { ...input.signatario, om: e.target.value } })} />
					</Campo>
					<Campo id="sig-ordem" rotulo="Assinado por ordem de (opcional)">
						<Input
							id="sig-ordem"
							value={input.signatario.porOrdemDe ?? ""}
							onChange={(e) => onChange({ signatario: { ...input.signatario, porOrdemDe: e.target.value || undefined } })}
							placeholder="Comandante-Geral de Apoio"
						/>
						<Ajuda>O texto passa a exigir abertura “Por ordem do…” ou “Incumbiu-me o…” (art. 40 § 9º).</Ajuda>
					</Campo>
				</div>
			</Secao>
		</div>
	)
}

function Secao({ titulo, fundamento, children }: { titulo: string; fundamento: string; children: ReactNode }) {
	return (
		<section className="border border-border p-4">
			<div className="flex items-baseline justify-between gap-3 mb-4">
				<h3 className="text-sm font-semibold tracking-tight uppercase">{titulo}</h3>
				<span className="text-[11px] font-mono text-muted-foreground">{fundamento}</span>
			</div>
			{children}
		</section>
	)
}

function Campo({ id, rotulo, className, children }: { id: string; rotulo: string; className?: string; children: ReactNode }) {
	return (
		<div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
			<Label htmlFor={id}>{rotulo}</Label>
			{children}
		</div>
	)
}

function Ajuda({ children }: { children: ReactNode }) {
	return <p className="text-xs text-muted-foreground">{children}</p>
}

function GeneroToggle({ valor, onChange }: { valor: "m" | "f"; onChange: (genero: "m" | "f") => void }) {
	// "Do Chefe" × "Da Diretora", "Ao" × "À": a concordância do art. 36 é escolha de quem
	// redige, não algo que dê para inferir do cargo digitado.
	return (
		<div className="flex border border-input">
			{(["m", "f"] as const).map((g) => (
				<button
					key={g}
					type="button"
					onClick={() => onChange(g)}
					aria-pressed={valor === g}
					className={`px-3 h-8 text-xs transition-colors ${valor === g ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
				>
					{g === "m" ? "Do / Ao" : "Da / À"}
				</button>
			))}
		</div>
	)
}

function CampoParte({ id, rotulo, parte, onChange }: { id: string; rotulo: string; parte: Parte; onChange: (parte: Parte) => void }) {
	return (
		<div className="flex flex-col gap-1.5 sm:col-span-2">
			<Label htmlFor={id}>{rotulo}</Label>
			<div className="flex gap-2">
				<Input
					id={id}
					value={parte.cargo}
					onChange={(e) => onChange({ ...parte, cargo: e.target.value })}
					placeholder="Diretor do Instituto de Economia e Finanças da Aeronáutica"
				/>
				<GeneroToggle valor={parte.genero ?? "m"} onChange={(genero) => onChange({ ...parte, genero })} />
			</div>
		</div>
	)
}

function ListaEditavel({
	rotulo,
	itens,
	onChange,
	placeholder,
}: {
	rotulo: string
	itens: string[]
	onChange: (itens: string[]) => void
	placeholder?: string
}) {
	return (
		<div className="flex flex-col gap-2">
			<Label>{rotulo}</Label>
			{itens.map((item, i) => (
				<div key={i} className="flex gap-2">
					<Input
						value={item}
						onChange={(e) => onChange(itens.map((it, j) => (j === i ? e.target.value : it)))}
						placeholder={placeholder}
						aria-label={`${rotulo} ${i + 1}`}
					/>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						aria-label={`Remover ${rotulo.toLowerCase()} ${i + 1}`}
						onClick={() => onChange(itens.filter((_, j) => j !== i))}
					>
						<Trash className="size-4" />
					</Button>
				</div>
			))}
			<Button type="button" variant="outline" size="sm" className="self-start" onClick={() => onChange([...itens, ""])}>
				<Plus className="size-4" /> Adicionar
			</Button>
		</div>
	)
}
