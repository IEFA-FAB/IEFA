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

import { conciliarEspecieAmbito } from "./especies"
import type { RedacaoIa } from "./schema"
import type { DocumentoInput } from "./tipos"

export function aplicarRedacao(atual: DocumentoInput, redacao: RedacaoIa): DocumentoInput {
	// Espécie e âmbito andam juntos: aceitar um sem o outro produziria par que a norma não
	// admite (ofício externo dentro do COMAER, declaração entre OM).
	const { especie, ambito } = conciliarEspecieAmbito({ especie: atual.especie, ambito: atual.ambito }, { especie: redacao.especie, ambito: redacao.ambito })

	const destinatarios = redacao.destinatarios?.filter((d) => d.cargo.trim() !== "")

	return {
		...atual,
		especie,
		ambito,
		prioridade: redacao.prioridade ?? atual.prioridade,
		precedencia: redacao.precedencia ?? atual.precedencia,
		remetente: redacao.remetente?.cargo.trim() ? { ...atual.remetente, ...redacao.remetente } : atual.remetente,
		destinatarios: destinatarios?.length ? destinatarios : atual.destinatarios,
		// Só o que veio preenchido: um endereçamento parcial não pode zerar o tratamento já
		// escolhido nem o gênero da concordância.
		enderecamento: redacao.enderecamento
			? {
					tratamento: redacao.enderecamento.tratamento ?? atual.enderecamento?.tratamento ?? "senhoria",
					genero: redacao.enderecamento.genero ?? atual.enderecamento?.genero ?? "m",
					nome: redacao.enderecamento.nome ?? atual.enderecamento?.nome,
					cargo: redacao.enderecamento.cargo ?? atual.enderecamento?.cargo,
					linhasEndereco: redacao.enderecamento.linhasEndereco ?? atual.enderecamento?.linhasEndereco,
				}
			: atual.enderecamento,
		vocativo: redacao.vocativo ?? atual.vocativo,
		decisao: redacao.decisao ?? atual.decisao,
		assunto: redacao.assunto ?? atual.assunto,
		referencias: redacao.referencias ?? atual.referencias,
		anexos: redacao.anexos ?? atual.anexos,
		paragrafos: redacao.paragrafos,
	}
}
