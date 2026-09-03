/**
 * @module comaer/tipos
 * Modelo de dados das comunicações oficiais do COMAER (NSCA 5-3/2026, Anexo I).
 *
 * O documento é DADO, não JSX. Preview em tela, impressão e a saída que vai para o
 * SIGADAER leem a mesma estrutura montada — foi a lição da ferramenta do sucont, onde a
 * estrutura só existia dentro do componente e por isso não havia como copiar campo a
 * campo, nem como ter uma segunda espécie de documento sem duplicar a folha inteira.
 */

/** Art. 7º § 1º — âmbito, e art. 51: o ofício muda de forma conforme para onde vai. */
export type Scope = "interno-om" | "comaer" | "externo"

/** Art. 7º § 2º — natureza do assunto. Governa o prefixo da numeração (art. 31 § 2º). */
export type Classification = "ostensivo" | "reservado" | "secreto" | "ultrassecreto"

/** Art. 7º § 3º. */
export type Priority = "rotina" | "urgente"

/** Art. 30 — decide entre "Respeitosamente" e "Atenciosamente". */
export type Precedence = "superior" | "igual" | "inferior"

export type Gender = "m" | "f"

/** Parte do preâmbulo (art. 36): quem envia e quem recebe, pelo CARGO, não pelo nome. */
export interface Party {
	/** Cargo ("Chefe do Grupamento de Apoio dos Afonsos") ou sigla da OM ("CO-DCTA"). */
	position: string
	/** Decide "Do/Da" e "Ao/À" — a norma usa as duas formas nos exemplos do art. 36. */
	gender?: Gender
	/** Art. 36, parágrafo único, III: autoridade intermediária que deve conhecer o assunto. */
	via?: string
}

export interface Signer {
	/** Nome completo; sai em caixa alta (art. 40). */
	name: string
	/** Sigla do posto/graduação — ver `comaer/postos`. */
	rank?: string
	/** Quadro/especialidade ("Int", "Av"). */
	quadro?: string
	position?: string
	/** Sigla da OM; vira nome por extenso no documento externo (art. 40 § 2º). */
	om?: string
	/** Art. 40 § 7º — assinatura do substituto legal ("No Imp"). */
	noImp?: { name: string; rank?: string; quadro?: string }
	/** Art. 40 § 9º — "Por ordem do ..." / "Incumbiu-me o ...". */
	byOrderOf?: string
}

export interface Subalinea {
	text: string
}
export interface Alinea {
	text: string
	subalineas?: Subalinea[]
}
export interface Item {
	text: string
	alineas?: Alinea[]
}
/** Art. 39 — parágrafo › item › alínea › subalínea. */
export interface Paragraph {
	text: string
	items?: Item[]
}

export interface MilitaryUnit {
	/** Nome por extenso, em caixa alta na epígrafe (art. 35, I). */
	name: string
	acronym?: string
	/** Setor emissor — só aparece no ofício de trâmite interno à OM (art. 51 § 5º, I, c). */
	sector?: string
	/** Art. 51 § 9º, III — obrigatórios no ofício externo. */
	address?: string
	phone?: string
	email?: string
}

export interface Numbering {
	/** `null` = s/nº (art. 51 § 6º e § 7º, b: assunto de interesse particular). */
	sequence: number | null
	/** Indicativo do setor que elabora (art. 31 § 1º, III). */
	sector?: string
	/** Numeração de ordem geral da organização (art. 31 § 1º, IV). */
	organizationNumber?: string
	/** Só no Parecer, que numera por ano (art. 53 § 2º, III). */
	year?: number
}

/** Endereçamento do ofício externo (art. 51 § 9º, VIII). */
export interface Addressing {
	/** Art. 9º § 8º: "Vossa Excelência" fora do Executivo Federal; senão, "Vossa Senhoria". */
	formOfAddress: "excelencia" | "senhoria"
	gender: Gender
	name?: string
	position?: string
	addressLines?: string[]
}

export interface DocumentInput {
	kind: string
	scope: Scope
	classification: Classification
	priority?: Priority
	om: MilitaryUnit
	numbering: Numbering
	/** Protocolo COMAER / NUP — só dígitos ou já mascarado. */
	nup?: string
	city: string
	date: Date
	sender?: Party
	recipients: Party[]
	/** Art. 51 § 8º, II — o ofício a vários destinatários. */
	distribution?: "circular" | "difral"
	subject?: string
	references?: string[]
	annexes?: string[]
	/** Art. 51 § 9º, X — vocativo do ofício externo, seguido de vírgula. */
	vocativo?: string
	addressing?: Addressing
	/** Posição do destinatário em relação ao signatário (art. 30, II e III). */
	precedence?: Precedence
	paragraphs: Paragraph[]
	signer: Signer
	/** Art. 48 § 3º, II, b / art. 49 § 2º, II, c — processo e documento de origem. */
	process?: { nup?: string; reference?: string }
	/** Ordinal do despacho (art. 48 § 3º, II, c): 1º, 2º, 3º… */
	despachoOrder?: number
	/** Art. 49 § 2º, III. */
	decision?: "DEFERIDO" | "DEFERIDA" | "INDEFERIDO" | "INDEFERIDA" | "ARQUIVE-SE"
	/** Veio de minuta importada: a conferência cobra a identidade que NÃO foi herdada. */
	derivedFromDraft?: boolean
}

export type Alignment = "esquerda" | "centro" | "direita" | "justificado"

/**
 * De onde a linha veio, quando ela pode ser editada no próprio papel.
 *
 * A folha renderiza um documento MONTADO — texto derivado, com marcador e prefixo. Editar
 * ali exige saber escrever de volta na origem: o alvo diz qual campo é, e `value` traz o
 * texto cru, sem o "1." nem o "Assunto: " que a montagem acrescentou.
 */
export type EditTarget =
	| { field: "subject" }
	| { field: "paragraph"; paragraph: number }
	| { field: "item"; paragraph: number; item: number }
	| { field: "alinea"; paragraph: number; item: number; alinea: number }
	| { field: "subalinea"; paragraph: number; item: number; alinea: number; subalinea: number }
	| { field: "reference"; index: number }
	| { field: "annex"; index: number }

export interface Line {
	text: string
	/** Presente quando a linha é editável direto na folha. */
	edit?: { target: EditTarget; value: string }
	alignment?: Alignment
	bold?: boolean
	/** Recuo em cm, como a norma mede (2,5 cm do parágrafo, 1,5 cm da continuação). */
	indentCm?: number
	/** Linha à direita na MESMA linha da anterior (numeração × localidade e data). */
	rightOnSameLine?: string
}

export interface AssembledBlock {
	id: BlockId
	/** Rótulo do campo, usado como alvo de cópia individual para o SIGADAER. */
	label: string
	lines: Line[]
}

export type BlockId =
	| "timbre"
	| "epigrafe"
	| "titulo"
	| "numeracao"
	| "nup"
	| "localidade-data"
	| "processo"
	| "enderecamento"
	| "preambulo"
	| "ementa"
	| "vocativo"
	| "texto"
	| "fecho"
	| "signatario"
	| "rodape-om"

export interface AssembledDocument {
	kind: string
	blocks: AssembledBlock[]
	/** Avisos de conformidade — o que a norma exige e o preenchimento não trouxe. */
	warnings: string[]
}
