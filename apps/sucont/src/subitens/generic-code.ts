// Classificação do código genérico da conta corrente (subitem 99 × favorecido 999), usada
// pelo parser, pela tela e pelas mensagens.
import type { GenericCodeKind } from "#/subitens/types"

/**
 * Código genérico na conta corrente: 99 ou 999 isolados (sem dígito colado dos dois lados).
 * Antes uma regex única, `/(^|\D)(99|999)($|\D)/`, marcava os dois juntos; hoje cada um tem a
 * sua (`SUBITEM_99_REGEX`, `FAVORECIDO_999_REGEX`) e `classifyGenericCode` dá marca própria a
 * cada um. A união das duas reconhece exatamente o que a regex única reconhecia
 * (`parser.test.ts` trava isso).
 * Igual ao upstream (sucontsubitem, src/App.tsx), que dá como exemplos "99, 999, P99, /99".
 *
 * O que a norma diz (conferido em 2026-10-14):
 * - Subitem 99 é o residual "Outros…" do elemento (339030.99 Outros Materiais de Consumo,
 *   339039.99, 449052.99). Subitem é facultativo (Port. Interministerial 163/2001, art. 3º
 *   §5º); a tabela >CONCONTA do SIAFI consolidada pela 8ª ICFEx traz os residuais:
 *   https://www.educacao.ufrj.br/wp-content/uploads/2024/02/Plano_de_Contas_SIAFI.pdf
 * - 96 não é genérico: é pagamento antecipado (transitório, com prazo de regularização),
 *   e por isso fica de fora:
 *   https://www.ufmg.br/proplan/wp-content/uploads/2023/04/Pilulas-do-Conhecimento-Suprimento-de-Fundos-Orientacoes-Gerais-e-Regularizacao-de-Inconsistencias.pdf
 * - 999 NÃO é subitem (subitem tem dois dígitos): é o favorecido genérico do tipo de conta
 *   corrente 002 "CNPJ, CPF, UG, IG OU 999", gravado como "P + Favorecido" (Macrofunção
 *   02.12.13, item 3.2.5.2):
 *   https://www.ufmg.br/proplan/wp-content/uploads/MACROFUN%C3%87%C3%83O-021213-ROTINA-PARA-EMISS%C3%83O-DE-NOTA-DE-EMPENHO.pdf
 *   É ele que a 02.03.18 item 5.1 manda evitar no encerramento:
 *   https://proad.ifes.edu.br/images/stories/020318_-_ENCERRAMENTO_DO_EXERC%C3%8DCIO.pdf
 *
 * Formato da conta corrente: em estoque (115610100) o c/c é ISF + subitem, e o SIAFI exibe
 * "P 04", "P 99" ("TOTAL COM ISF P - PERMANENTE"), conforme o balancete por conta corrente
 * do POP HC-UFTM SCONT.006 v3, figuras 25 a 27:
 * https://www.gov.br/hubrasil/pt-br/hospitais-universitarios/regiao-sudeste/hc-uftm/documentos/procedimentos-e-rotinas-operacionais-padrao/pops/POP.HCUFTM.SCONT.006ConciliacaodosSaldosdoSistemadeControledeEstoquescomoSistemadeAdministracaoFinanceiraversao3.pdf
 * Esse formato, com ou sem espaço, as regexes já pegam. O que NÃO dá para afirmar sem uma
 * planilha real do relatório "ACOMPANHAMENTO CONTÁBIL - SUCONT-3.1" é quais contas
 * contábeis ele traz e, portanto, quais tipos de c/c chegam aqui. Consequências que ficam
 * em aberto, por isso o que é reconhecido não mudou:
 * - c/c com o subitem colado a outros dígitos (NDD de 8 dígitos "33903099", NE + subitem)
 *   não é marcado;
 * - "999" e "P999" continuam reconhecidos, agora com marca própria (`favorecido-999`),
 *   separada do subitem 99 (`subitem-99`).
 *
 * PENDÊNCIA: validar o formato do c/c (subitem e favorecido) contra uma planilha real do
 * SUCONT-3.1. Até lá, o que é reconhecido fica igual ao da regex única; só a classificação
 * foi separada.
 *
 * O tipo 002 também grava CPF/CNPJ do favorecido. Formatado, o DV "-99" ficaria isolado e
 * seria lido como subitem; por isso `classifyGenericCode` descarta antes CPF e CNPJ com
 * pontuação completa (`FORMATTED_TAX_ID_REGEX`). Limite: CPF/CNPJ com pontuação parcial
 * (ex.: "12345678/0001-99") ainda é marcado; só dígitos (o formato do SIAFI) nunca foi.
 */

/** Subitem 99 isolado: o residual "Outros…" da natureza de despesa ("P 99", "P99", "12/99"). */
export const SUBITEM_99_REGEX = /(^|\D)99($|\D)/

/** 999 isolado: o favorecido genérico do c/c tipo 002 ("999", "P999"). Não é subitem. */
export const FAVORECIDO_999_REGEX = /(^|\D)999($|\D)/

/** CNPJ `00.000.000/0000-00` ou CPF `000.000.000-00`, com a pontuação completa. */
export const FORMATTED_TAX_ID_REGEX = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}/g

/** Ordem fixa das marcas: é a ordem em que aparecem na tela, no filtro e na mensagem. */
export const GENERIC_CODE_KINDS: readonly GenericCodeKind[] = ["subitem-99", "favorecido-999"]

/** Rótulo de cada marca, o mesmo na tabela, no filtro, nos cards e na mensagem. */
export const GENERIC_CODE_LABELS: Record<GenericCodeKind, string> = {
	"subitem-99": "Subitem genérico (99)",
	"favorecido-999": "Favorecido genérico (999)",
}

/**
 * Marcas de código genérico da conta corrente, na ordem de `GENERIC_CODE_KINDS`. Lista
 * vazia: a conta corrente não tem código genérico e a linha fica fora do relatório.
 *
 * Conta corrente com os dois (ex.: "999 / 99") recebe as DUAS marcas: aparece nos dois
 * filtros e conta uma vez em cada tipo, enquanto o total de ocorrências a conta uma vez só.
 * Escolher uma das duas esconderia a outra do filtro, e as duas pedem providência.
 */
export function classifyGenericCode(contaCorrente: string): GenericCodeKind[] {
	const value = contaCorrente.replace(FORMATTED_TAX_ID_REGEX, " ")
	const kinds: GenericCodeKind[] = []
	if (SUBITEM_99_REGEX.test(value)) kinds.push("subitem-99")
	if (FAVORECIDO_999_REGEX.test(value)) kinds.push("favorecido-999")
	return kinds
}
