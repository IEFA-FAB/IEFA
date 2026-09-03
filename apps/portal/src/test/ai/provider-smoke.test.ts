/**
 * Smoke do provider de IA do portal — a pergunta é só uma: **a IA responde?**
 *
 * Fala com o Bedrock configurado de verdade (`PORTAL_AI_*`), com o MESMO JSON Schema que a
 * redação assistida publica em produção, e valida a resposta com o mesmo Zod do boundary.
 *
 * Fica em skip por padrão: custa tokens e depende de rede e de credencial AWS.
 *
 *   PORTAL_RUN_AI_SMOKE=true bun run test:ai
 *
 * (em dev local, com `AWS_PROFILE` apontando para a conta que tem o modelo habilitado)
 *
 * O que ele pega e nenhum teste offline pega: id de modelo inválido, modelo não habilitado
 * na conta (`not available for this account`), região sem acesso, credencial faltando, e
 * `structuredOutput` que volta sem os campos obrigatórios do schema.
 *
 * O que ele NÃO garante: regressão de contrato — o que o modelo devolve varia de run para
 * run. A garantia determinística é `src/lib/comaer/schema.test.ts`.
 */

import { describe, expect, test } from "bun:test"
import { createAdapterFromEnv } from "@iefa/ai-provider"
import { buildChatOptions } from "@/lib/ai-options"
import { describeCatalog, findKind } from "@/lib/comaer/catalog"
import { AiProposalSchema } from "@/lib/comaer/schema"
import { aiProposalJsonSchema } from "@/server/document-extraction.schema"

const enabled = process.env.PORTAL_RUN_AI_SMOKE === "true"
const describeAiSmoke = enabled ? describe : describe.skip

const RASCUNHO = `pedir ao COMGEP prorrogacao de 30 dias no prazo do levantamento de contratacoes nao alimentares;
prazo atual vence em 30 de setembro de 2026; motivo: 12 das 31 OM ainda nao responderam`

describeAiSmoke("provider de IA do portal", () => {
	test(
		"devolve uma redação estruturada válida",
		async () => {
			const adapter = createAdapterFromEnv("PORTAL", { rateLimitKey: "smoke" })
			type StructuredArgs = Parameters<typeof adapter.structuredOutput>[0]

			// As MESMAS opções da produção (`maxTokens`, `temperature`, logger): montar um
			// objeto parecido aqui deixaria de cobrir a opção que a server function manda.
			const resposta = await adapter.structuredOutput({
				chatOptions: buildChatOptions(
					`Redija o texto de um Ofício entre OM do COMAER a partir das anotações:\n${RASCUNHO}`,
					"Você redige comunicações oficiais do COMAER segundo a NSCA 5-3/2026. Impessoal, direto, sem fecho de cortesia."
				) as unknown as StructuredArgs["chatOptions"],
				outputSchema: aiProposalJsonSchema as unknown as StructuredArgs["outputSchema"],
			})

			const proposal = AiProposalSchema.parse(resposta.data)
			expect(proposal.paragraphs.length).toBeGreaterThan(0)
			expect(proposal.paragraphs[0].text.length).toBeGreaterThan(20)
			// O fecho é decisão da norma pelo destinatário (art. 30), e o app o insere: o
			// modelo escrevendo "Atenciosamente" no corpo duplicaria o fecho no documento.
			const body = proposal.paragraphs.map((p) => p.text).join("\n")
			expect(body).not.toMatch(/^(Respeitosamente|Atenciosamente)/im)
		},
		{ timeout: 120_000 }
	)

	test(
		"escolhe a espécie que o rascunho pede, não a que estava no formulário",
		async () => {
			// O rascunho é um pleito pessoal: a espécie certa é Requerimento (art. 55), não o
			// Ofício que o formulário abre por padrão. É o erro que o redator ocasional comete,
			// e é para isso que o catálogo vai no prompt.
			const adapter = createAdapterFromEnv("PORTAL", { rateLimitKey: "smoke" })
			type StructuredArgs = Parameters<typeof adapter.structuredOutput>[0]

			const resposta = await adapter.structuredOutput({
				chatOptions: buildChatOptions(
					`Espécie escolhida no formulário: oficio-comaer. Troque-a se o rascunho pedir outra.\n\nRascunho: o 1º Ten QOAP L. Santos vem requerer ao Comandante do IEFA a concessão de licença especial de 30 dias referente ao decênio 2016-2026, prevista em lei.`,
					`Você redige comunicações oficiais do COMAER segundo a NSCA 5-3/2026 e escolhe a espécie adequada.\n\nCATÁLOGO DE ESPÉCIES:\n${describeCatalog()}`
				) as unknown as StructuredArgs["chatOptions"],
				outputSchema: aiProposalJsonSchema as unknown as StructuredArgs["outputSchema"],
			})

			const proposal = AiProposalSchema.parse(resposta.data)
			expect(proposal.kind).toBe("requerimento")
			// Espécie fora do catálogo é pior que espécie ausente: ela viaja até o formulário.
			expect(findKind(proposal.kind ?? "")).toBeDefined()
		},
		{ timeout: 120_000 }
	)
})
