/**
 * @module comaer/format
 * Formatadores puros da NSCA 5-3/2026, Anexo I. Sem React, sem I/O — cada função
 * responde por um artigo, para que a regra possa ser testada contra o texto da norma.
 */

import { isOficialGeneral, postoPorExtenso, quadroPorExtenso } from "./postos"
import type { Ambito, Enderecamento, Linha, Numeracao, Paragrafo, Parte, Precedencia, Sigilo, Signatario } from "./tipos"

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"] as const

/**
 * Art. 12 § 4º — data por extenso, usada nos textos externos.
 * Sem zero à esquerda ("3 de setembro", não "03") e com ordinal no primeiro dia do mês.
 * Os modelos de epígrafe da própria norma escrevem "03 de julho"; o artigo é explícito em
 * sentido contrário, e é ele que vale.
 */
export function dataPorExtenso(data: Date): string {
	const dia = data.getDate()
	return `${dia === 1 ? "1º" : dia} de ${MESES[data.getMonth()]} de ${data.getFullYear()}`
}

export type EstiloDataAbreviada = "ponto" | "barra" | "mes" | "mes-maiusculo"

/** Art. 12 § 5º — formas abreviadas admitidas em texto interno. Maio nunca é abreviado. */
export function dataAbreviada(data: Date, estilo: EstiloDataAbreviada = "mes"): string {
	const dia = String(data.getDate()).padStart(2, "0")
	const ano = data.getFullYear()
	if (estilo === "ponto" || estilo === "barra") {
		const mes = String(data.getMonth() + 1).padStart(2, "0")
		return [dia, mes, String(ano)].join(estilo === "ponto" ? "." : "/")
	}
	const nome = MESES[data.getMonth()]
	// "excetuando-se o mês de maio, que é escrito sempre por extenso"
	const abreviado = nome === "maio" ? nome : `${nome.slice(0, 3)}.`
	return estilo === "mes-maiusculo" ? `${dia} ${abreviado.replace(".", "").toUpperCase()} ${ano}` : `${dia} ${abreviado} ${ano}`
}

/** NUP / Protocolo COMAER: 17 dígitos. Entrada já mascarada ou crua. */
export function formatarNup(entrada: string): string {
	const digitos = entrada.replace(/\D/g, "")
	if (digitos.length !== 17) return entrada.trim()
	return `${digitos.slice(0, 5)}.${digitos.slice(5, 11)}/${digitos.slice(11, 15)}-${digitos.slice(15)}`
}

export function nupValido(entrada: string): boolean {
	return entrada.replace(/\D/g, "").length === 17
}

const PREFIXO_SIGILO: Record<Sigilo, string> = { ostensivo: "", reservado: "R-", secreto: "S-", ultrassecreto: "US-" }

/** Escopo da linha de numeração — muda com a espécie e com o âmbito (art. 31 e art. 51 § 5º). */
export type EscopoNumeracao = "completa" | "interna" | "parecer" | "nenhuma"

/**
 * Art. 31 — `Ofício nº 34/GAB/255`; com sigilo, `Ofício R-34/GAB/255` (a norma troca o
 * "nº" pelo prefixo do grau, não o acumula). No trâmite interno à OM a numeração é só
 * sequencial e setor (art. 51 § 5º, I, d), e o assunto de interesse particular recebe
 * "s/nº" (art. 51 § 6º e § 7º, b).
 */
export function linhaNumeracao(especie: string, numeracao: Numeracao, sigilo: Sigilo = "ostensivo", escopo: EscopoNumeracao = "completa"): string {
	if (escopo === "nenhuma") return ""
	if (numeracao.sequencial === null) return `${especie} s/nº`
	const partes: string[] = [String(numeracao.sequencial)]
	if (escopo === "parecer") {
		if (numeracao.ordemGeral) partes.push(numeracao.ordemGeral)
		partes.push(String(numeracao.ano ?? new Date().getFullYear()))
	} else {
		if (numeracao.setor) partes.push(numeracao.setor)
		if (escopo === "completa" && numeracao.ordemGeral) partes.push(numeracao.ordemGeral)
	}
	const corpo = partes.join("/")
	const prefixo = PREFIXO_SIGILO[sigilo]
	// O Despacho já se numera por "Nº 183/GABGEP/2377" (art. 48 § 3º, II, d): repetir o
	// "nº" produziria "Nº nº 183".
	if (especie.trim() === "Nº") return `Nº ${prefixo}${corpo}`
	return prefixo ? `${especie} ${prefixo}${corpo}` : `${especie} nº ${corpo}`
}

/** Art. 21 § 3º — A…Z e, esgotado o alfabeto, letras dobradas (AA, AB…). */
export function letraAnexo(indice: number): string {
	const letra = (n: number) => String.fromCharCode(65 + n)
	if (indice < 26) return letra(indice)
	return letra(Math.floor(indice / 26) - 1) + letra(indice % 26)
}

/**
 * Art. 37 § 2º, III e V — itens de referência e de anexo: ponto e vírgula em todos,
 * "; e" no penúltimo, ponto final no último.
 */
export function formatarEnumeracao(itens: string[], marcador: (indice: number) => string): string[] {
	const limpos = itens.map((t) => t.trim().replace(/[;.]+$/, "")).filter((t) => t.length > 0)
	return limpos.map((texto, i) => {
		const fim = i === limpos.length - 1 ? "." : i === limpos.length - 2 ? "; e" : ";"
		return `${marcador(i)} ${texto}${fim}`
	})
}

/**
 * Art. 30 — o fecho de cortesia só existe quando o destinatário é externo ao COMAER.
 * Entre OM do COMAER, o parágrafo único proíbe: devolver "Atenciosamente" aqui seria
 * inserir no documento uma linha que a norma manda não existir.
 */
export function fechoDeCortesia(ambito: Ambito, precedencia: Precedencia = "igual"): string | null {
	if (ambito !== "externo") return null
	return precedencia === "superior" ? "Respeitosamente," : "Atenciosamente,"
}

function juntarComE(itens: string[]): string {
	if (itens.length <= 1) return itens[0] ?? ""
	return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`
}

/** Art. 36 — preâmbulo pelo CARGO; "via" quando há autoridade intermediária. */
export function linhasPreambulo(remetente: Parte | undefined, destinatariosBrutos: Parte[]): string[] {
	const linhas: string[] = []
	// Parte sem cargo não vira linha: "Do" sozinho no preâmbulo é o tipo de sobra que se
	// copia para o SIGADAER sem ninguém reler.
	const destinatarios = destinatariosBrutos.filter((d) => d.cargo.trim() !== "")
	if (remetente?.cargo.trim()) linhas.push(`${remetente.genero === "f" ? "Da" : "Do"} ${remetente.cargo}`)
	if (destinatarios.length === 1) {
		const d = destinatarios[0]
		linhas.push(`${d.genero === "f" ? "À" : "Ao"} ${d.cargo}${d.via ? `, via ${d.via}` : ""}`)
	} else if (destinatarios.length > 1) {
		// Art. 36, parágrafo único, I: siglas em ordem de antiguidade, vírgula entre elas e
		// "e" antes da última. A ordem vem de quem preenche — a norma não a deriva de nada
		// que o app conheça, e reordenar sozinho seria inventar antiguidade.
		const plural = destinatarios.every((d) => d.genero === "f") ? "Às" : "Aos"
		linhas.push(`${plural} ${juntarComE(destinatarios.map((d) => d.cargo))}`)
	}
	return linhas
}

/** Art. 51 § 9º, VIII — bloco de endereçamento do ofício externo. */
export function linhasEnderecamento(e: Enderecamento): string[] {
	const artigo = e.genero === "f" ? "a Senhora" : "o Senhor"
	const linhas = [`A Sua ${e.tratamento === "excelencia" ? "Excelência" : "Senhoria"} ${artigo}`]
	if (e.nome) linhas.push(e.nome.toUpperCase())
	if (e.cargo) linhas.push(e.cargo)
	for (const l of e.linhasEndereco ?? []) linhas.push(l)
	return linhas
}

/** Art. 10 — vocativo: "Senhor" + cargo, salvo tratamento especial. */
export function vocativoPadrao(e: Enderecamento | undefined): string {
	if (!e) return "Senhor,"
	const pronome = e.genero === "f" ? "Senhora" : "Senhor"
	return e.cargo ? `${pronome} ${e.cargo},` : `${pronome},`
}

/**
 * Art. 40 — identificação do signatário.
 * Oficial-General leva o posto ANTES do nome; os demais, depois. Documento externo grafa
 * posto, quadro, cargo e OM por extenso (art. 26 e art. 40 § 2º).
 */
export function identificacaoSignatario(s: Signatario, ambito: Ambito): string[] {
	const externo = ambito === "externo"
	const montarPatente = (posto?: string, quadro?: string) =>
		[posto ? (externo ? postoPorExtenso(posto) : posto) : "", quadro ? (externo ? quadroPorExtenso(quadro) : quadro) : ""].filter(Boolean).join(" ")

	const patente = montarPatente(s.posto, s.quadro)
	const nome = s.nome.toUpperCase()
	const principal = s.posto && isOficialGeneral(s.posto) ? [patente, nome].filter(Boolean).join(" ") : [nome, patente].filter(Boolean).join(" ")

	const cargoLinha = (() => {
		if (!s.cargo && !s.om) return null
		if (!s.cargo) return s.om ?? null
		if (!s.om || s.cargo.toLowerCase().includes(s.om.toLowerCase())) return s.cargo
		return `${s.cargo} - ${s.om}`
	})()

	// Art. 40 § 7º: o substituto assina ACIMA do nome da autoridade substituída, e o cargo
	// aparece só sob a substituída.
	if (s.noImp) {
		const substituto = (() => {
			const p = montarPatente(s.noImp.posto, s.noImp.quadro)
			const n = s.noImp.nome.toUpperCase()
			return s.noImp.posto && isOficialGeneral(s.noImp.posto) ? [p, n].filter(Boolean).join(" ") : [n, p].filter(Boolean).join(" ")
		})()
		return [`No Imp ${principal}`, ...(cargoLinha ? [cargoLinha] : []), substituto]
	}

	return [principal, ...(cargoLinha ? [cargoLinha] : [])]
}

/** Art. 40 § 9º — o texto do documento assinado por ordem tem abertura obrigatória. */
export const ABERTURAS_POR_ORDEM = ["Por ordem d", "Incumbiu-me "] as const

export function textoTemAberturaPorOrdem(primeiroParagrafo: string): boolean {
	return ABERTURAS_POR_ORDEM.some((abertura) => primeiroParagrafo.trimStart().startsWith(abertura))
}

/**
 * Art. 39 — divisões do texto: parágrafo (1.), item (1.1), alínea (a) e subalínea (-).
 * Documento de parágrafo único dispensa a numeração (art. 39, parágrafo único, I).
 */
export function renderDivisoes(paragrafos: Paragrafo[], numerar = true): Linha[] {
	const linhas: Linha[] = []
	const numerarParagrafos = numerar && paragrafos.length > 1
	paragrafos.forEach((p, i) => {
		linhas.push({ texto: numerarParagrafos ? `${i + 1}. ${p.texto}` : p.texto, alinhamento: "justificado", recuoCm: 2.5 })
		p.itens?.forEach((item, j) => {
			linhas.push({ texto: `${i + 1}.${j + 1} ${item.texto}`, alinhamento: "justificado", recuoCm: 3.5 })
			item.alineas?.forEach((alinea, k) => {
				linhas.push({ texto: `${String.fromCharCode(97 + k)}) ${alinea.texto}`, alinhamento: "justificado", recuoCm: 4.5 })
				for (const sub of alinea.subalineas ?? []) linhas.push({ texto: `- ${sub.texto}`, alinhamento: "justificado", recuoCm: 5.5 })
			})
		})
	})
	return linhas
}
