/**
 * @module documents-ai.fn
 * Redação assistida das comunicações oficiais (NSCA 5-3/2026, Anexo I).
 *
 * Duas decisões que moldam tudo aqui:
 *
 * 1. **O modelo escreve texto, não identidade.** Assunto, parágrafos, referências e
 *    anexos vêm dele; numeração, NUP, OM, data e signatário não. Número de ofício
 *    inventado é erro que só aparece depois do despacho, quando já virou expediente.
 * 2. **Documento classificado não vai para provider nenhum.** Grau de sigilo diferente
 *    de ostensivo é recusado antes de qualquer chamada, e a recusa fica registrada.
 */

import { createServerFn } from "@tanstack/react-start"
import { setResponseStatus } from "@tanstack/react-start/server"
import { z } from "zod"
import { generateJson } from "@/lib/ai.server"
import { requireUserId } from "@/lib/auth.server"
import { buscarEspecie, type Especie } from "@/lib/comaer/especies"
import { type RedacaoIa, RedacaoIaSchema } from "@/lib/comaer/schema"
import { getDocumentsServerClient } from "@/lib/supabase.server"
import { redacaoJsonSchema } from "./documents-ai.schema"

const SYSTEM = `Você redige comunicações oficiais do Comando da Aeronáutica segundo a NSCA 5-3/2026 (Anexo I), que adapta o Manual de Redação da Presidência da República ao COMAER.

Regras que a norma impõe ao TEXTO:
- Impessoalidade e padrão culto da língua; clareza, concisão, coesão e coerência (art. 4º e 5º).
- Não escreva "Tenho a honra de", "Tenho o prazer de" nem "Cumpre-me informar que"; prefira a forma direta (art. 38, I, a e b).
- Estruture em introdução (o que motiva a comunicação), desenvolvimento (esclarecimentos e fundamentos) e conclusão (a providência pedida ou a posição recomendada), sem trazer fato novo na conclusão (art. 38).
- Cada ideia distinta em seu próprio parágrafo (art. 38, II).
- Enumeração vira item, alínea ou subalínea, não lista dentro do parágrafo (art. 39).
- Evite cognatos repetidos, duplo sentido e expressões regionais (art. 5º, § 2º).
- Cite norma pela primeira vez com número e data por extenso: "Lei nº 12.527, de 18 de novembro de 2011" (art. 22).
- Com agente público federal — militar ou servidor —, o ÚNICO pronome de tratamento é "Senhor" (art. 9º, § 3º). Não escreva "Vossa Senhoria", "Vossa Excelência", "Ilustríssimo", "Digníssimo" nem "doutor" (art. 9º, § 4º), nem no texto nem no vocativo.
- NÃO escreva fecho de cortesia ("Respeitosamente", "Atenciosamente"): quem decide isso é a norma pelo destinatário, e o sistema o insere (art. 30).
- NÃO invente número de documento, NUP, nome de organização, data, nome ou posto de signatário. Se algum dado faltar, redija sem ele.
- O assunto é uma expressão substantiva sucinta, sem verbo conjugado e sem ponto final (art. 37, § 2º, II).`

function promptDe(especie: Especie, ambito: string, modo: "redigir" | "revisar", rascunho: string): string {
	const contexto = [
		`Espécie: ${especie.rotulo} (${especie.fundamento}). ${especie.descricao}`,
		`Âmbito: ${ambito === "externo" ? "destinatário externo ao COMAER" : ambito === "comaer" ? "entre Organizações Militares do COMAER" : "interno à própria Organização Militar"}.`,
		especie.aberturaSugerida ? `O primeiro parágrafo deve começar por "${especie.aberturaSugerida.trim()}".` : "",
		especie.paragrafosNumerados ? "" : "Esta espécie não numera parágrafos; escreva texto corrido em parágrafos distintos.",
	]
		.filter(Boolean)
		.join("\n")

	const tarefa =
		modo === "redigir"
			? "Redija o texto do documento a partir das anotações abaixo."
			: "Revise o texto abaixo para a norma: corrija tom, impessoalidade e estrutura, preserve TODOS os fatos, números e datas, e não acrescente informação que não esteja no original."

	return `${contexto}\n\n${tarefa}\n\n---\n${rascunho}\n---`
}

/**
 * Trilha da geração. Nunca derruba a resposta — mas registra também a FALHA e a recusa
 * por sigilo, que é o que torna auditável a afirmação de que documento classificado não
 * foi submetido a provider.
 */
async function registrar(entrada: { userId: string; modo: string; especie: string; rascunho: string; resultado?: RedacaoIa; erro?: string }): Promise<void> {
	try {
		await getDocumentsServerClient()
			.from("ai_generation")
			.insert({
				owner_id: entrada.userId,
				modo: entrada.modo,
				especie: entrada.especie,
				rascunho: entrada.rascunho,
				resultado: entrada.resultado ?? null,
				erro: entrada.erro ?? null,
			})
	} catch {
		// Trilha é acessória: perdê-la não pode custar ao usuário o texto já gerado.
	}
}

export const redigirComIaFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			rascunho: z.string().trim().min(10, "Escreva ao menos uma frase para a IA trabalhar.").max(8000),
			especie: z.string(),
			ambito: z.enum(["interno-om", "comaer", "externo"]),
			sigilo: z.enum(["ostensivo", "reservado", "secreto", "ultrassecreto"]),
			modo: z.enum(["redigir", "revisar"]),
		})
	)
	.handler(async ({ data }): Promise<RedacaoIa> => {
		// Dono da chamada vem da sessão: é ele que chaveia os tetos de consumo e o registro.
		const userId = await requireUserId()

		const especie = buscarEspecie(data.especie)
		if (!especie) {
			setResponseStatus(422)
			throw new Error(`Espécie desconhecida: ${data.especie}`)
		}

		if (data.sigilo !== "ostensivo") {
			await registrar({ userId, modo: data.modo, especie: data.especie, rascunho: data.rascunho, erro: `recusado: sigilo ${data.sigilo}` })
			setResponseStatus(422)
			throw new Error("Documento classificado não é enviado a provider de IA. Redija o texto manualmente (art. 7º § 2º e normas de salvaguarda).")
		}

		try {
			const bruto = await generateJson<unknown>({
				userId,
				system: SYSTEM,
				user: promptDe(especie, data.ambito, data.modo, data.rascunho),
				schema: redacaoJsonSchema,
			})
			const resultado = RedacaoIaSchema.parse(bruto)
			await registrar({ userId, modo: data.modo, especie: data.especie, rascunho: data.rascunho, resultado })
			return resultado
		} catch (error) {
			const mensagem = error instanceof Error ? error.message : "Falha desconhecida na geração."
			await registrar({ userId, modo: data.modo, especie: data.especie, rascunho: data.rascunho, erro: mensagem })
			throw error
		}
	})
