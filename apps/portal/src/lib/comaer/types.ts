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
export type Ambito = "interno-om" | "comaer" | "externo"

/** Art. 7º § 2º — natureza do assunto. Governa o prefixo da numeração (art. 31 § 2º). */
export type Sigilo = "ostensivo" | "reservado" | "secreto" | "ultrassecreto"

/** Art. 7º § 3º. */
export type Prioridade = "rotina" | "urgente"

/** Art. 30 — decide entre "Respeitosamente" e "Atenciosamente". */
export type Precedencia = "superior" | "igual" | "inferior"

export type Genero = "m" | "f"

/** Parte do preâmbulo (art. 36): quem envia e quem recebe, pelo CARGO, não pelo nome. */
export interface Parte {
	/** Cargo ("Chefe do Grupamento de Apoio dos Afonsos") ou sigla da OM ("CO-DCTA"). */
	cargo: string
	/** Decide "Do/Da" e "Ao/À" — a norma usa as duas formas nos exemplos do art. 36. */
	genero?: Genero
	/** Art. 36, parágrafo único, III: autoridade intermediária que deve conhecer o assunto. */
	via?: string
}

export interface Signatario {
	/** Nome completo; sai em caixa alta (art. 40). */
	nome: string
	/** Sigla do posto/graduação — ver `comaer/postos`. */
	posto?: string
	/** Quadro/especialidade ("Int", "Av"). */
	quadro?: string
	cargo?: string
	/** Sigla da OM; vira nome por extenso no documento externo (art. 40 § 2º). */
	om?: string
	/** Art. 40 § 7º — assinatura do substituto legal ("No Imp"). */
	noImp?: { nome: string; posto?: string; quadro?: string }
	/** Art. 40 § 9º — "Por ordem do ..." / "Incumbiu-me o ...". */
	porOrdemDe?: string
}

export interface Subalinea {
	texto: string
}
export interface Alinea {
	texto: string
	subalineas?: Subalinea[]
}
export interface Item {
	texto: string
	alineas?: Alinea[]
}
/** Art. 39 — parágrafo › item › alínea › subalínea. */
export interface Paragrafo {
	texto: string
	itens?: Item[]
}

export interface OrganizacaoMilitar {
	/** Nome por extenso, em caixa alta na epígrafe (art. 35, I). */
	nome: string
	sigla?: string
	/** Setor emissor — só aparece no ofício de trâmite interno à OM (art. 51 § 5º, I, c). */
	setor?: string
	/** Art. 51 § 9º, III — obrigatórios no ofício externo. */
	endereco?: string
	telefone?: string
	email?: string
}

export interface Numeracao {
	/** `null` = s/nº (art. 51 § 6º e § 7º, b: assunto de interesse particular). */
	sequencial: number | null
	/** Indicativo do setor que elabora (art. 31 § 1º, III). */
	setor?: string
	/** Numeração de ordem geral da organização (art. 31 § 1º, IV). */
	ordemGeral?: string
	/** Só no Parecer, que numera por ano (art. 53 § 2º, III). */
	ano?: number
}

/** Endereçamento do ofício externo (art. 51 § 9º, VIII). */
export interface Enderecamento {
	/** Art. 9º § 8º: "Vossa Excelência" fora do Executivo Federal; senão, "Vossa Senhoria". */
	tratamento: "excelencia" | "senhoria"
	genero: Genero
	nome?: string
	cargo?: string
	linhasEndereco?: string[]
}

export interface DocumentoInput {
	especie: string
	ambito: Ambito
	sigilo: Sigilo
	prioridade?: Prioridade
	om: OrganizacaoMilitar
	numeracao: Numeracao
	/** Protocolo COMAER / NUP — só dígitos ou já mascarado. */
	nup?: string
	localidade: string
	data: Date
	remetente?: Parte
	destinatarios: Parte[]
	/** Art. 51 § 8º, II — o ofício a vários destinatários. */
	difusao?: "circular" | "difral"
	assunto?: string
	referencias?: string[]
	anexos?: string[]
	/** Art. 51 § 9º, X — vocativo do ofício externo, seguido de vírgula. */
	vocativo?: string
	enderecamento?: Enderecamento
	/** Posição do destinatário em relação ao signatário (art. 30, II e III). */
	precedencia?: Precedencia
	paragrafos: Paragrafo[]
	signatario: Signatario
	/** Art. 48 § 3º, II, b / art. 49 § 2º, II, c — processo e documento de origem. */
	processo?: { nup?: string; referencia?: string }
	/** Ordinal do despacho (art. 48 § 3º, II, c): 1º, 2º, 3º… */
	ordemDespacho?: number
	/** Art. 49 § 2º, III. */
	decisao?: "DEFERIDO" | "DEFERIDA" | "INDEFERIDO" | "INDEFERIDA" | "ARQUIVE-SE"
}

export type Alinhamento = "esquerda" | "centro" | "direita" | "justificado"

export interface Linha {
	texto: string
	alinhamento?: Alinhamento
	negrito?: boolean
	/** Recuo em cm, como a norma mede (2,5 cm do parágrafo, 1,5 cm da continuação). */
	recuoCm?: number
	/** Linha à direita na MESMA linha da anterior (numeração × localidade e data). */
	mesmaLinhaDireita?: string
}

export interface BlocoMontado {
	id: BlocoId
	/** Rótulo do campo, usado como alvo de cópia individual para o SIGADAER. */
	rotulo: string
	linhas: Linha[]
}

export type BlocoId =
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

export interface DocumentoMontado {
	especie: string
	blocos: BlocoMontado[]
	/** Avisos de conformidade — o que a norma exige e o preenchimento não trouxe. */
	avisos: string[]
}
