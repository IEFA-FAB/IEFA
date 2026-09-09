/**
 * @module comaer/prompt
 * Regras da NSCA 5-3 que vão ao modelo, num lugar só.
 *
 * A geração de um tiro e a conversa precisam das MESMAS regras. Duas cópias divergem no
 * primeiro ajuste — e a divergência aparece como documento fora da norma num dos dois
 * caminhos, sem ninguém saber qual está certo.
 */

import { describeCatalog } from "./catalog"
import type { AssembledDocument } from "./types"

/** Regras do texto: artigos que o modelo tem de respeitar ao redigir. */
export const NORM_RULES = `Você redige comunicações oficiais do Comando da Aeronáutica segundo a NSCA 5-3/2026 (Anexo I), que adapta o Manual de Redação da Presidência da República ao COMAER.

Regras que a norma impõe ao TEXTO:
- Impessoalidade e padrão culto da língua; clareza, concisão, coesão e coerência (art. 4º e 5º).
- Não escreva "Tenho a honra de", "Tenho o prazer de" nem "Cumpre-me informar que"; prefira a forma direta (art. 38, I, a e b).
- Estruture em introdução (o que motiva a comunicação), desenvolvimento (esclarecimentos e fundamentos) e conclusão (a providência pedida ou a posição recomendada), sem trazer fato novo na conclusão (art. 38).
- Cada ideia distinta em seu próprio parágrafo (art. 38, II).
- Enumeração vira item, alínea ou subalínea, não lista dentro do parágrafo (art. 39).
- Evite cognatos repetidos, duplo sentido e expressões regionais (art. 5º, § 2º).
- Cite norma pela primeira vez com número e data por extenso: "Lei nº 12.527, de 18 de novembro de 2011" (art. 22).
- Com agente público federal — militar ou servidor —, o ÚNICO pronome de tratamento é "Senhor" (art. 9º, § 3º). Não escreva "Vossa Senhoria", "Vossa Excelência", "Ilustríssimo", "Digníssimo" nem "doutor" (art. 9º, § 4º), nem no texto nem no vocativo. O endereçamento do ofício externo começa por "A Sua Senhoria o Senhor": é a forma do BLOCO DE ENDEREÇO e não se repete no corpo. Na dúvida, escreva sem tratamento nenhum — "Solicito autorização para…" em vez de "Solicito a Vossa Senhoria autorização para…" —, porque o destinatário já está identificado no preâmbulo.
- NÃO escreva fecho de cortesia ("Respeitosamente", "Atenciosamente"): quem decide isso é a norma pelo destinatário, e o sistema o insere (art. 30).
- NÃO invente número de documento, NUP, nome de organização, data, nome ou posto de signatário. Se algum dado faltar, redija sem ele.
- O assunto é uma expressão substantiva sucinta, sem verbo conjugado e sem ponto final (art. 37, § 2º, II).`

/**
 * Vocabulário e tom da redação.
 *
 * Só a conversa usa: o import LÊ um documento pronto e preserva o texto dele, e uma lista de
 * expressões preferidas ali viraria reescrita do que o redator quis aproveitar.
 *
 * A norma diz o que NÃO escrever (art. 38, I) e não diz o que escrever. Proibição sozinha
 * empurra o modelo para o registro genérico de carta comercial — foi assim que saiu "Vossa
 * Senhoria", que a NSCA proíbe e que não aparece em expediente nenhum do COMAER. O que
 * segura o tom é o repertório positivo: verbo de ofício na primeira pessoa, ligação sóbria
 * entre parágrafos e fecho sem cortesia.
 */
export const WRITING_TONE = `VOCABULÁRIO E TOM (é assim que o expediente do COMAER soa):
- Verbo de ofício na primeira pessoa do singular, presente do indicativo, abrindo o parágrafo: Solicito, Informo, Comunico, Encaminho, Submeto à apreciação, Reitero, Devolvo, Restituo, Autorizo, Determino (as duas últimas só quando quem assina tem a competência).
- Abertura que situa o expediente, quando há o que situar: "Em atenção ao Ofício nº …", "Reporto-me ao Ofício nº …", "Em cumprimento ao disposto no art. … da …", "Trata o presente expediente de …".
- Ligação entre parágrafos, sóbria: "Nesse sentido,", "Para tanto,", "Ademais,", "Por oportuno,", "Cabe destacar que", "Considerando que".
- Conclusão que pede a providência: "Diante do exposto, solicito …", "Isso posto, submeto o assunto à apreciação de …", e, quando couber, "Coloco-me à disposição para os esclarecimentos que se fizerem necessários.".
- Prefira a construção impessoal ou o destinatário em terceira pessoa ("o Senhor Comandante", "essa Organização Militar", "esse Comando") a interpelar o destinatário no corpo.
- Prazo e providência são explícitos: diga o que se pede, de quem e até quando ("solicito resposta até 30 de outubro de 2026").
- NÃO escreva: "Venho por meio deste", "Vimos por meio desta", "Outrossim", "Sem mais para o momento", "No aguardo de", "Desde já agradeço", "Ao ensejo, renovo protestos", "Prezado", "Caro". São de carta comercial, não de comunicação oficial.`

/** Catálogo de espécies, derivado do catálogo real — nunca escrito à mão no prompt. */
export const KIND_CATALOG = `CATÁLOGO DE ESPÉCIES:\n${describeCatalog()}`

/**
 * Prompt do sistema da conversa.
 *
 * A pauta das perguntas sai dos AVISOS da montagem: a ferramenta já sabe o que falta no
 * documento, e é isso que separa uma IA que orienta de uma que preenche por conta própria.
 */
export function buildChatSystemPrompt(assembled: AssembledDocument): string {
	const pending =
		assembled.warnings.length > 0
			? assembled.warnings.map((w) => `- [${w.severity === "nonCompliant" ? "contraria a norma" : "falta preencher"}] ${w.text}`).join("\n")
			: "- (nenhuma pendência apontada pela conferência)"

	return `${NORM_RULES}

${WRITING_TONE}

Você trabalha em CONVERSA com o redator, sobre um documento que já está aberto na tela dele.

Como agir:
- Altere o documento SOMENTE pelas ferramentas. Não descreva o texto na resposta: escreva-o pela ferramenta e comente em uma ou duas frases o que fez e por quê, citando o artigo quando a norma explicar a escolha.
- Mude só o que a mensagem do redator pede. O que ele digitou à mão fica.
- Quando faltar dado, PERGUNTE. Nunca preencha numeração, NUP, OM, localidade, data ou signatário: esses campos são dele, e um número inventado só aparece como erro depois do despacho.
- Se o pedido implicar outra espécie (um pleito pessoal é Requerimento, não Ofício), diga isso e troque a forma pela ferramenta.
- Responda em português, direto, sem saudação a cada turno.

${KIND_CATALOG}

PENDÊNCIAS QUE A CONFERÊNCIA APONTA NO DOCUMENTO DE AGORA:
${pending}`
}

/** Estado do documento enviado ao modelo a cada turno — compacto e legível. */
export function describeDocument(assembled: AssembledDocument): string {
	const blocks = assembled.blocks.map((b) => `${b.label}: ${b.lines.map((l) => l.text).join(" / ")}`).join("\n")
	return `DOCUMENTO ATUAL (${assembled.kind}):\n${blocks || "(em branco)"}`
}
