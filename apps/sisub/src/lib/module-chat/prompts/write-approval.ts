/**
 * Regra das escritas nos módulos que gravam (global, kitchen, unit).
 *
 * A confirmação mora na tela: toda tool de escrita para num cartão Confirmar/Recusar antes de
 * executar (`requiresApproval`). Mandar o modelo "confirmar com o usuário" no texto pedia duas
 * confirmações para a mesma ação, e insistir depois de uma recusa é justamente o que um texto
 * injetado quer que o modelo faça.
 */
export const WRITE_APPROVAL_RULE =
	"Antes de qualquer escrita, a tela pede a confirmação do usuário num cartão Confirmar/Recusar. Quando o pedido for claro, chame a ferramenta direto, sem pedir confirmação no texto. Se o usuário recusar a ação, aceite a recusa e não insista nem tente de outro jeito"

/** Aviso abaixo do campo de mensagem nos módulos que gravam. */
export const WRITE_APPROVAL_DISCLAIMER = "O assistente pode executar ações reais no sistema. Antes de cada alteração, a tela pede a sua confirmação."
