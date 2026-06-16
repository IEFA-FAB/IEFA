import type { CategoriaMilitar, CirculoHierarquico, EquivalenciaCivil, Genero, GrupoUniforme, Obrigatoriedade, TipoPeca } from "@iefa/database/rumaer"

export const GRUPO_LABELS: Record<GrupoUniforme, string> = {
	historicos: "Históricos",
	representacao: "Representação",
	servicos: "Serviços",
	educacao_fisica: "Educação Física",
	desfile: "Desfile",
}

export const GRUPO_DESCRIPTIONS: Record<GrupoUniforme, string> = {
	historicos: "Uniformes de tradição e cerimônias históricas.",
	representacao: "Gala, passeio e situações de representação.",
	servicos: "Uniformes de serviço administrativo e operacional.",
	educacao_fisica: "Agasalho, camiseta e tênis para EF.",
	desfile: "Composições específicas para desfiles e formaturas.",
}

export const GRUPO_ORDER: GrupoUniforme[] = ["representacao", "servicos", "educacao_fisica", "desfile", "historicos"]

export const CATEGORIA_LABELS: Record<CategoriaMilitar, string> = {
	oficiais: "Oficiais",
	cadetes: "Cadetes",
	suboficiais: "Suboficiais",
	sargentos: "Sargentos",
	alunos_formacao: "Alunos em formação",
	pracas: "Praças",
}

export const CIRCULO_LABELS: Record<CirculoHierarquico, string> = {
	oficiais_generais: "Oficiais-Generais",
	oficiais: "Oficiais",
	sargentos: "Sargentos",
	suboficiais: "Suboficiais",
	cadetes: "Cadetes",
	alunos: "Alunos",
	pracas: "Praças",
}

export const GENERO_LABELS: Record<Genero, string> = {
	masculino: "Masculino",
	feminino: "Feminino",
	unissex: "Unissex",
}

export const OBRIGATORIEDADE_LABELS: Record<Obrigatoriedade, string> = {
	obrigatorio: "Obrigatório",
	facultativo: "Facultativo",
	eventual: "Eventual",
}

export const OBRIGATORIEDADE_ORDER: Obrigatoriedade[] = ["obrigatorio", "facultativo", "eventual"]

export const EQ_CIVIL_LABELS: Record<EquivalenciaCivil, string> = {
	esporte: "Esporte",
	esporte_fino: "Esporte fino",
	passeio: "Passeio",
	passeio_completo: "Passeio completo",
	gala: "Gala",
}

export const TIPO_PECA_LABELS: Record<TipoPeca, string> = {
	cabeca: "Cabeça",
	torso: "Torso",
	pernas: "Pernas",
	calcado: "Calçado",
	acessorio: "Acessório",
	insignia: "Insígnia",
	distintivo: "Distintivo",
	identificacao: "Identificação",
	arma: "Arma",
}

/**
 * Nome de peça para exibição: apenas a primeira letra maiúscula (sentence case).
 * O catálogo guarda os nomes como vêm da especificação FAB (maioria minúscula,
 * alguns em CAIXA ALTA). Esta normalização é só visual — o dado no banco não muda.
 * Acrônimos (tokens ≥2 letras todas maiúsculas, ex.: INCAER, EDA, REPOUSAR) são
 * preservados, exceto quando o nome inteiro está em caixa alta.
 */
export function formatPieceName(nome: string): string {
	if (!nome) return nome
	const allCaps = nome === nome.toLocaleUpperCase("pt-BR") && /\p{Lu}/u.test(nome)
	const lowered = allCaps ? nome.toLocaleLowerCase("pt-BR") : nome.replace(/\S+/g, (w) => (/^\p{Lu}{2,}$/u.test(w) ? w : w.toLocaleLowerCase("pt-BR")))
	return lowered.replace(/\p{L}/u, (c) => c.toLocaleUpperCase("pt-BR"))
}

/** Rótulo curto do uniforme: "5º Uniforme A" / nome para históricos. */
export function uniformTitle(u: { numero: number | null; letra: string | null; nome: string }): string {
	if (u.numero != null) return `${u.numero}º Uniforme${u.letra ? ` ${u.letra}` : ""}`
	return u.nome
}

/** Atributos preenchidos de um item de venda, como chips "rótulo: valor". */
export function pieceItemAttrs(item: {
	tamanho: string | null
	cor: string | null
	posto: string | null
	quadro: string | null
	especialidade: string | null
	genero: Genero | null
}): { label: string; value: string }[] {
	const attrs: { label: string; value: string | null }[] = [
		{ label: "Tam.", value: item.tamanho },
		{ label: "Cor", value: item.cor },
		{ label: "Posto", value: item.posto },
		{ label: "Quadro", value: item.quadro },
		{ label: "Espec.", value: item.especialidade },
		{ label: "Gênero", value: item.genero ? GENERO_LABELS[item.genero] : null },
	]
	return attrs.filter((a): a is { label: string; value: string } => !!a.value)
}
