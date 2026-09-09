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

import type { Scope } from "./types"

/**
 * Proibidos SEMPRE (art. 9º, § 4º): não existe destinatário que os receba.
 *
 * "doutor" fica de fora de propósito. A norma o proíbe como tratamento, mas ele aparece
 * legitimamente dentro de nome de instituição e de citação transcrita ("Hospital Dr. …"),
 * e barrar a escrita inteira por causa disso custa mais do que o erro que evita — quem
 * cuida dele é a regra no prompt.
 */
const ALWAYS_FORBIDDEN = /\b(?:ilustr[íi]ssim[oa]s?|ilmo\.?|ilma\.?|dign[íi]ssim[oa]s?|dd\.)/i

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
