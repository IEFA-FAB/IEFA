/**
 * @module comaer/treatment
 * Pronome de tratamento proibido no TEXTO da comunicação (Anexo I, art. 9º).
 *
 * Uma implementação só, consumida por dois caminhos que precisam concordar: o remendo do
 * modelo (`tools/patch`), que recusa a escrita e devolve a correção para ele tentar de
 * novo, e a conferência (`assemble`), que aponta o mesmo achado no texto digitado à mão.
 * Fossem duas cópias, a IA seria barrada por uma regra que o formulário aceita.
 *
 * Por que existe, sendo que o prompt já proíbe: o modelo LÊ o documento a cada turno, e o
 * endereçamento do ofício externo começa por "A Sua Senhoria o Senhor" — forma do bloco de
 * endereço, não tratamento do texto. Ele espelhava isso no corpo como "Vossa Senhoria".
 * Instrução negativa não segura o que o contexto sugere; verificação segura.
 */

import type { Paragraph, Scope } from "./types"

/**
 * Proibidos SEMPRE (art. 9º, § 4º): não existe destinatário que os receba.
 *
 * Duas ausências deliberadas, porque a verificação RECUSA a escrita e um falso positivo
 * custa mais do que o erro que evitaria:
 *
 * - **"doutor"**: a norma o proíbe como tratamento, mas ele é parte de nome de instituição
 *   e de citação transcrita ("Hospital Dr. …"). Quem cuida dele é a regra no prompt.
 * - **"DD."**, abreviatura arcaica de Digníssimo: casa com "dd.mm.aaaa" num texto que fale
 *   de formato de data. A forma por extenso continua barrada, e é a que aparece.
 *
 * O ponto das abreviaturas é OBRIGATÓRIO, e por isso: sem ele, "Ilma"/"Ilmar" — nome de
 * gente, e "Ilma" é nome de servidora — casava com a regra, e a escrita do modelo era
 * recusada em laço enquanto a conferência acusava norma contrariada no texto de quem digitou.
 */
const ALWAYS_FORBIDDEN = /\b(?:ilustr[íi]ssim[oa]s?|dign[íi]ssim[oa]s?|ilmo\.|ilma\.)/i

/**
 * Proibidos com agente público federal (art. 9º, § 3º): militar ou servidor é tratado por
 * "Senhor", e só. Vale para o que circula dentro do COMAER — no âmbito externo o
 * destinatário pode ser autoridade de outro poder, e aí quem escolhe a forma é o campo de
 * endereçamento do formulário, não esta regra.
 */
// A abreviatura termina em "ª" ou em ponto, que não são caractere de palavra: fechar com
// `\b` faria a captura parar antes deles ("V. S" em vez de "V. Sª"). O que delimita é não
// vir letra depois.
const FEDERAL_FORBIDDEN = /\bvossas?\s+(?:senhorias?|excel[êe]ncias?)\b|\bv\.\s?(?:s\.?ª?|ex\.?(?:ª|a)?\.?)(?![a-zà-úA-ZÀ-Ú])/i

/** Âmbitos em que o destinatário é, por definição, agente público federal. */
const FEDERAL_SCOPES: readonly Scope[] = ["interno-om", "comaer"]

/**
 * A expressão proibida encontrada no texto, ou `null`.
 *
 * @param text trecho a conferir — parágrafo, item ou alínea.
 * @param scope âmbito do documento: decide se "Vossa Senhoria"/"Vossa Excelência" cabem.
 */
export function findForbiddenTreatment(text: string, scope: Scope): string | null {
	const always = ALWAYS_FORBIDDEN.exec(text)
	if (always) return always[0]
	if (!FEDERAL_SCOPES.includes(scope)) return null
	const federal = FEDERAL_FORBIDDEN.exec(text)
	return federal ? federal[0] : null
}

/** A mesma explicação nos dois consumidores: o modelo lê como erro de tool, o redator como achado. */
export function forbiddenTreatmentMessage(found: string): string {
	return `“${found}” não é tratamento admitido no texto: com agente público federal, militar ou servidor, o pronome é “Senhor” (art. 9º, § 3º e § 4º). O “A Sua Senhoria o Senhor” do endereçamento é a forma do bloco de endereço e não se repete no corpo.`
}

/**
 * O mesmo exame descendo ao parágrafo inteiro — texto, itens e alíneas.
 *
 * Mora aqui, e não em cada consumidor, porque a assimetria é o defeito: a conferência olhava
 * só o `text` enquanto o remendo do modelo já olhava os itens, e um item digitado à mão com
 * "Vossa Senhoria" era impresso enquanto o modelo era recusado pelo mesmo texto.
 */
export function findForbiddenTreatmentInParagraph(paragraph: Paragraph, scope: Scope): string | null {
	const texts = [paragraph.text, ...(paragraph.items ?? []).flatMap((item) => [item.text, ...(item.alineas ?? []).map((alinea) => alinea.text)])]
	for (const text of texts) {
		const found = findForbiddenTreatment(text, scope)
		if (found) return found
	}
	return null
}
