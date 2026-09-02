/**
 * @module comaer/montar
 * Monta o documento: entrada do usuário + espécie ⇒ blocos prontos para renderizar,
 * imprimir ou copiar para o SIGADAER.
 *
 * É o único lugar que sabe a ordem e a forma dos blocos. A tela desenha o que sai daqui, e
 * o serializador copia o que sai daqui — se a folha e a área de transferência tivessem
 * cada uma a sua montagem, o que o usuário confere na tela não seria o que ele cola no
 * sistema, e o erro só apareceria depois do despacho.
 */

import { buscarEspecie, type Especie } from "./especies"
import {
	dataPorExtenso,
	fechoDeCortesia,
	formatarEnumeracao,
	formatarNup,
	identificacaoSignatario,
	letraAnexo,
	linhaNumeracao,
	linhasEnderecamento,
	linhasPreambulo,
	nupValido,
	renderDivisoes,
	textoTemAberturaPorOrdem,
	vocativoPadrao,
} from "./format"
import { postoPorExtenso } from "./postos"
import type { BlocoId, BlocoMontado, DocumentoInput, DocumentoMontado, Linha } from "./tipos"

const ROTULOS: Record<BlocoId, string> = {
	timbre: "Timbre",
	epigrafe: "Epígrafe",
	titulo: "Título",
	numeracao: "Numeração",
	nup: "Protocolo COMAER (NUP)",
	"localidade-data": "Localidade e data",
	processo: "Processo de origem",
	enderecamento: "Endereçamento",
	preambulo: "Preâmbulo",
	ementa: "Ementa",
	vocativo: "Vocativo",
	texto: "Texto",
	fecho: "Fecho de cortesia",
	signatario: "Identificação do signatário",
	"rodape-om": "Dados da organização emitente",
}

function localidadeEData(input: DocumentoInput): string {
	// Sem localidade preenchida a linha começaria por vírgula (", 2 de setembro de 2026.").
	return input.localidade.trim() ? `${input.localidade}, ${dataPorExtenso(input.data)}.` : `${dataPorExtenso(input.data)}.`
}

function blocoTimbre(especie: Especie): Linha[] {
	// Art. 8º § 1º: o timbre 7 é uma linha só, sem emblema; o timbre 5 leva o emblema S2.
	if (especie.timbre === 7) return [{ texto: "MINISTÉRIO DA DEFESA - COMANDO DA AERONÁUTICA", alinhamento: "centro", negrito: true }]
	return [
		{ texto: "MINISTÉRIO DA DEFESA", alinhamento: "centro", negrito: true },
		{ texto: "COMANDO DA AERONÁUTICA", alinhamento: "centro", negrito: true },
	]
}

function blocoEpigrafe(input: DocumentoInput, especie: Especie): Linha[] {
	const linhas: Linha[] = [{ texto: input.om.nome.trim().toUpperCase(), alinhamento: "centro", negrito: true }]
	// Art. 51 § 5º, I, c: só o ofício de trâmite interno acrescenta o setor emissor.
	if (especie.id === "oficio-interno-om" && input.om.setor) linhas.push({ texto: input.om.setor.toUpperCase(), alinhamento: "centro" })
	// Art. 51 § 9º, III: no ofício externo, os dados de contato vêm logo abaixo da epígrafe.
	if (especie.id === "oficio-externo") {
		const contato = [input.om.endereco, input.om.telefone, input.om.email].filter(Boolean).join(" - ")
		if (contato) linhas.push({ texto: contato, alinhamento: "centro" })
	}
	return linhas
}

function blocoTitulo(input: DocumentoInput, especie: Especie): Linha[] {
	if (especie.id === "despacho") {
		const ordem = input.ordemDespacho ?? 1
		return [{ texto: `${ordem}º DESPACHO`, alinhamento: "centro", negrito: true }]
	}
	if (!especie.titulo) return []
	// Art. 46 § 4º, III: na Certidão a numeração acompanha o título, não uma linha própria.
	const sufixo = especie.id === "certidao" ? linhaNumeracao("", input.numeracao, input.sigilo, especie.numeracao).trim() : ""
	return [{ texto: [especie.titulo, sufixo].filter(Boolean).join(" ").trim(), alinhamento: "centro", negrito: true }]
}

function blocoEmenta(input: DocumentoInput, especie: Especie): Linha[] {
	const linhas: Linha[] = []
	if (input.assunto) {
		// Art. 51 § 9º, IX: no ofício externo o assunto vai em negrito e sozinho.
		linhas.push({ texto: `Assunto: ${input.assunto.replace(/\.?$/, ".")}`, negrito: especie.id === "oficio-externo" })
	}
	if (especie.id !== "oficio-externo") {
		// Art. 37 § 2º, II: a primeira linha leva o rótulo; as seguintes alinham sob ela.
		const refs = formatarEnumeracao(input.referencias ?? [], (i) => `${i + 1}.`)
		for (const [i, texto] of refs.entries()) linhas.push({ texto: i === 0 ? `Referência: ${texto}` : texto, recuoCm: i === 0 ? 0 : 2.5 })
		const anexos = formatarEnumeracao(input.anexos ?? [], (i) => `${letraAnexo(i)}.`)
		for (const [i, texto] of anexos.entries()) linhas.push({ texto: i === 0 ? `Anexo: ${texto}` : texto, recuoCm: i === 0 ? 0 : 2.5 })
	}
	return linhas
}

function blocoPreambulo(input: DocumentoInput, especie: Especie): Linha[] {
	// Art. 51 § 7º, c: no ofício de interesse particular, o preâmbulo traz o NOME do
	// signatário no lugar do cargo — é o que separa o expediente pessoal do institucional.
	if (especie.id === "oficio-particular") {
		const s = input.signatario
		const identificacao = [s.posto, s.quadro, s.nome.toUpperCase()].filter(Boolean).join(" ")
		return [{ texto: `Do ${identificacao}` }, ...linhasPreambulo(undefined, input.destinatarios).map((texto) => ({ texto }))]
	}
	return linhasPreambulo(input.remetente, input.destinatarios).map((texto) => ({ texto }))
}

function blocoTexto(input: DocumentoInput, especie: Especie): Linha[] {
	const linhas = renderDivisoes(input.paragrafos, especie.paragrafosNumerados)
	// Art. 49 § 2º, III: o despacho decisório abre pela decisão, em caixa alta, seguida de vírgula.
	if (especie.id === "despacho-decisorio" && input.decisao && linhas.length > 0) {
		linhas[0] = { ...linhas[0], texto: `${input.decisao}, ${linhas[0].texto}` }
	}
	return linhas
}

function blocoSignatario(input: DocumentoInput, especie: Especie): Linha[] {
	// Art. 51 § 7º, d: no ofício de interesse particular omitem-se cargo e função.
	const signatario = especie.id === "oficio-particular" ? { ...input.signatario, cargo: undefined, om: undefined } : input.signatario
	return identificacaoSignatario(signatario, input.ambito).map((texto) => ({ texto, alinhamento: "centro" as const }))
}

function blocoRodape(input: DocumentoInput): Linha[] {
	const dados = [input.om.endereco, input.om.telefone, input.om.email].filter(Boolean)
	return dados.length > 0 ? [{ texto: dados.join(" - ") }] : []
}

/** Conferências que a norma faz e o formulário sozinho não faz. */
function conferir(input: DocumentoInput, especie: Especie): string[] {
	const avisos: string[] = []

	if (especie.blocos.includes("nup") && !(input.nup && nupValido(input.nup))) {
		avisos.push("Protocolo COMAER (NUP) ausente ou incompleto — são 17 dígitos (art. 48 § 4º).")
	}
	if (input.paragrafos.length === 0) avisos.push("O documento está sem texto (art. 38).")

	if (input.signatario.porOrdemDe && input.paragrafos.length > 0 && !textoTemAberturaPorOrdem(input.paragrafos[0].texto)) {
		avisos.push('Documento assinado por ordem: o texto deve começar por "Por ordem do…" ou "Incumbiu-me o…" (art. 40 § 9º).')
	}
	if (input.ambito === "externo" && input.signatario.posto && postoPorExtenso(input.signatario.posto) === input.signatario.posto) {
		avisos.push(`Posto "${input.signatario.posto}" não está na tabela do art. 18 — em documento externo ele precisa sair por extenso (art. 26).`)
	}
	if (especie.id === "oficio-externo" && ((input.referencias?.length ?? 0) > 0 || (input.anexos?.length ?? 0) > 0)) {
		avisos.push("No ofício externo, referências e anexos são citados no texto, não na ementa (art. 51 § 9º, IX).")
	}
	if (input.difusao) {
		if (input.destinatarios.some((d) => /cmtaer|comandante da aeron[áa]utica/i.test(d.cargo))) {
			avisos.push("Ofício circular não pode ser endereçado ao CMTAER — confeccione documento específico (art. 51 § 8º, IV).")
		}
		avisos.push("Ofício circular ou DIFRAL não inaugura processo (art. 51 § 8º, III).")
	}
	if (especie.aberturaSugerida && input.paragrafos.length > 0 && !input.paragrafos[0].texto.trimStart().startsWith(especie.aberturaSugerida.trim())) {
		avisos.push(`${especie.rotulo}: o texto deve começar por “${especie.aberturaSugerida.trim()}…” (${especie.fundamento}).`)
	}
	// A Ata não tem linha de data: o art. 44 § 3º, I manda data, hora e local nas linhas
	// INICIAIS DO TEXTO. O campo Data do formulário não tem para onde ir, e sem este aviso
	// o usuário o preenche achando que apareceu em algum lugar.
	if (especie.id === "ata") {
		avisos.push("Na Ata, data, hora e local abrem o próprio texto (art. 44 § 3º, I) — o campo Data não é impresso.")
	}
	if (especie.permiteFecho === false && input.ambito === "externo") {
		avisos.push(`${especie.rotulo} não é a espécie para destinatário externo ao COMAER — o fecho de cortesia não se aplica (art. 30).`)
	}
	return avisos
}

export function montarDocumento(input: DocumentoInput): DocumentoMontado {
	const especie = buscarEspecie(input.especie)
	if (!especie) throw new Error(`Espécie desconhecida: ${input.especie}`)

	const blocos: BlocoMontado[] = []
	const push = (id: BlocoId, linhas: Linha[]) => {
		// Campo em branco não vira linha, e bloco sem linha não vira bloco: o painel de
		// cópia lista um botão por bloco, e um botão que copia string vazia mente.
		const preenchidas = linhas.filter((l) => l.texto.trim() !== "" || (l.mesmaLinhaDireita ?? "").trim() !== "")
		if (preenchidas.length > 0) blocos.push({ id, rotulo: ROTULOS[id], linhas: preenchidas })
	}

	for (const id of especie.blocos) {
		switch (id) {
			case "timbre":
				push(id, blocoTimbre(especie))
				break
			case "epigrafe":
				push(id, blocoEpigrafe(input, especie))
				break
			case "titulo":
				push(id, blocoTitulo(input, especie))
				break
			case "numeracao": {
				const texto = linhaNumeracao(especie.rotuloNumeracao, input.numeracao, input.sigilo, especie.numeracao)
				if (texto) push(id, [{ texto, mesmaLinhaDireita: especie.dataNaLinha === "numeracao" ? localidadeEData(input) : undefined }])
				else if (especie.dataNaLinha === "numeracao") push("localidade-data", [{ texto: localidadeEData(input), alinhamento: "direita" }])
				break
			}
			case "nup": {
				// A data viaja na linha do NUP no requerimento (art. 55 § 2º, III) e na da
				// numeração nas demais. Quando essa linha não existe — requerimento ainda sem
				// NUP —, a data tem de cair em linha própria: antes ela sumia junto, e o
				// documento saía sem data nenhuma sem nada avisar.
				if (!input.nup) {
					if (especie.dataNaLinha === "nup") push("localidade-data", [{ texto: localidadeEData(input), alinhamento: "direita" }])
					break
				}
				push(id, [
					{
						texto: `Protocolo COMAER nº ${formatarNup(input.nup)}`,
						mesmaLinhaDireita: especie.dataNaLinha === "nup" ? localidadeEData(input) : undefined,
					},
				])
				break
			}
			case "localidade-data":
				push(id, [{ texto: localidadeEData(input), alinhamento: "direita" }])
				break
			case "processo": {
				const partes = [
					input.processo?.nup ? `Proc nº ${formatarNup(input.processo.nup)}` : "",
					input.processo?.referencia ? `Ref ${input.processo.referencia}` : "",
				]
					.filter(Boolean)
					.join(" - ")
				if (partes) push(id, [{ texto: `(${partes})`, alinhamento: "centro" }])
				break
			}
			case "enderecamento":
				push(id, input.enderecamento ? linhasEnderecamento(input.enderecamento).map((texto) => ({ texto })) : [])
				break
			case "preambulo":
				push(id, blocoPreambulo(input, especie))
				break
			case "ementa":
				push(id, blocoEmenta(input, especie))
				break
			case "vocativo":
				push(id, [{ texto: input.vocativo?.trim() || vocativoPadrao(input.enderecamento) }])
				break
			case "texto":
				push(id, blocoTexto(input, especie))
				break
			case "fecho": {
				const fecho = especie.permiteFecho ? fechoDeCortesia(input.ambito, input.precedencia) : null
				if (fecho) push(id, [{ texto: fecho, recuoCm: 2.5 }])
				break
			}
			case "signatario":
				push(id, blocoSignatario(input, especie))
				break
			case "rodape-om":
				push(id, blocoRodape(input))
				break
		}
	}

	return { especie: especie.rotulo, blocos, avisos: conferir(input, especie) }
}
