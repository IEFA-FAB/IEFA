/**
 * @module comaer/redacao
 * Aplicação da proposta do modelo sobre o documento em edição.
 *
 * Puro e testável de propósito: é aqui que se decide o que a IA pode sobrescrever, e essa
 * é a regra que mais importa na ferramenta inteira. Duas invariantes:
 *
 * 1. **Campo que o modelo não devolveu não é apagado.** A proposta é aditiva; o que o
 *    usuário já digitou sobrevive a ela.
 * 2. **Identidade do documento é intocável.** Numeração, NUP, OM, localidade, data, ordem
 *    do despacho e signatário não estão no schema da IA e não passam por aqui.
 */

import { reconcileKindAndScope } from "./catalog"
import type { AiProposal } from "./schema"
import type { DocumentInput } from "./types"

export function applyProposal(current: DocumentInput, proposal: AiProposal): DocumentInput {
	// Espécie e âmbito andam juntos: aceitar um sem o outro produziria par que a norma não
	// admite (ofício externo dentro do COMAER, declaração entre OM).
	const { kind, scope } = reconcileKindAndScope({ kind: current.kind, scope: current.scope }, { kind: proposal.kind, scope: proposal.scope })

	const recipients = proposal.recipients?.filter((d) => d.position.trim() !== "")

	return {
		...current,
		kind,
		scope,
		priority: proposal.priority ?? current.priority,
		precedence: proposal.precedence ?? current.precedence,
		sender: proposal.sender?.position.trim() ? { ...current.sender, ...proposal.sender } : current.sender,
		recipients: recipients?.length ? recipients : current.recipients,
		// Só o que veio preenchido: um endereçamento parcial não pode zerar o tratamento já
		// escolhido nem o gênero da concordância.
		addressing: proposal.addressing
			? {
					formOfAddress: proposal.addressing.formOfAddress ?? current.addressing?.formOfAddress ?? "senhoria",
					gender: proposal.addressing.gender ?? current.addressing?.gender ?? "m",
					name: proposal.addressing.name ?? current.addressing?.name,
					position: proposal.addressing.position ?? current.addressing?.position,
					addressLines: proposal.addressing.addressLines ?? current.addressing?.addressLines,
				}
			: current.addressing,
		vocativo: proposal.vocativo ?? current.vocativo,
		decision: proposal.decision ?? current.decision,
		subject: proposal.subject ?? current.subject,
		references: proposal.references ?? current.references,
		annexes: proposal.annexes ?? current.annexes,
		paragraphs: proposal.paragraphs,
	}
}
