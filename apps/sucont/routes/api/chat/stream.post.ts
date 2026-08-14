import { createAdapterFromEnv, enforceRequestRateLimit, RateLimitError } from "@iefa/ai-provider"
import { hasPermission, resolveUserPermissions } from "@iefa/pbac"
import { createCookieAuthClient } from "@iefa/supabase-kit"
import { chat, chatParamsFromRequestBody, toServerSentEventsResponse } from "@tanstack/ai"
import { defineHandler } from "nitro"
import { createError, getHeader, type H3Event, readBody, setResponseHeader } from "nitro/h3"
import { getServerCapabilities } from "#/lib/capabilities.server"
import { envServer } from "#/lib/env.server"
import { getAccessControlClient } from "#/lib/supabase.server"
import { UG_INFO } from "#/subitens/constants"

function buildSystemPrompt(contextSummary?: string): string {
	return `Você é o Oráculo SUCONT, um assistente técnico e estratégico especializado em Contabilidade Pública Federal para o Comando da Aeronáutica (COMAER). Sua missão é apoiar a Seção de Acompanhamento Contábil (SUCONT-3.1) na análise de dados, governança financeira e suporte às unidades gestoras.

🚨 HIERARQUIA E DESTAQUES CRÍTICOS (SETORIAL E STN)
Sempre considere o peso normativo superior destas unidades:
- SETORIAL CONTÁBIL DO COMAER (SEFA): 120002 (DIREF - SEFA), 120701 (DIREF/SUCONT - SEFA), 120702 (DIREF/SUCONV - SEFA), 121002 (DIREF - FAer - SEFA).
- ÓRGÃO CENTRAL DE CONTABILIDADE (STN): 120999 (MAER - DIF. CAMBIAL - SEFA) – Exclusiva para lançamentos da Secretaria do Tesouro Nacional.

BASE DE DADOS: UNIDADES GESTORAS (UG) POR ODS E ÓRGÃO SUPERIOR
Sempre utilize esta lista para identificar a sigla, o órgão superior e o ODS corretos:
${JSON.stringify(UG_INFO, null, 2)}

DIRETRIZES DE RESPOSTA E ANÁLISE:
1. Ao citar uma UG, identifique-a no formato: "UG [Código] ([Nome Reduzido]), subordinada ao [Órgão Superior] / [ODS]".
2. MAPA DE RISCO: Quando solicitado um panorama ou mapa de risco, apresente a distribuição por ODS, Órgão Superior e UG, incluindo saldo e % do total.
3. NÍVEIS CRÍTICOS: Identifique automaticamente o ODS, Órgão Superior e UGs mais críticos (por quantidade e por saldo).
4. ANÁLISE DE PARETO: Aplique a regra 80/20 para identificar a concentração de inconsistências.
5. PRIORIZAÇÃO: Sugira prioridades de atuação considerando volume financeiro, recorrência RAC e impacto patrimonial.
6. RIGOR TÉCNICO: Respostas devem ser estritamente profissionais, analíticas e orientadas ao rigor do PCASP (Manual de Contabilidade Aplicada ao Setor Público).
7. Se o usuário questionar sobre inconsistências contábeis, verifique sempre se a solução sugerida respeita as normas da DIREF.

Responda de forma clara, objetiva e profissional. Se a pergunta não puder ser respondida com os dados fornecidos, informe educadamente.${
		contextSummary
			? `

DADOS DO CONTEXTO ATUAL (JSON dos dados carregados na interface):
${contextSummary}`
			: ""
	}`
}

/**
 * Rota Nitro — fora do contexto de request do TanStack Start, então os helpers de
 * `#/lib/auth.server` (que dependem de `getRequest()`) não valem aqui. A sessão é
 * lida do header `Cookie` do H3Event, e a permissão pela mesma engine PBAC do resto
 * do app.
 */
async function requireSucontUser(event: H3Event): Promise<{ id: string }> {
	const auth = createCookieAuthClient({
		url: envServer.VITE_SUCONT_SUPABASE_URL,
		key: envServer.VITE_SUCONT_SUPABASE_PUBLISHABLE_KEY,
		cookieHeader: getHeader(event, "cookie"),
	})

	const {
		data: { user },
		error,
	} = await auth.auth.getUser()
	if (!user || error) throw createError({ statusCode: 401, message: "Não autenticado" })

	const permissions = await resolveUserPermissions(user.id, getAccessControlClient())
	if (!hasPermission(permissions, "sucont", 1)) {
		throw createError({ statusCode: 403, message: "Permissão insuficiente" })
	}

	return { id: user.id }
}

export default defineHandler(async (event: H3Event) => {
	// Capability gate — sem SUCONT_AI_* o oráculo não está configurado neste
	// ambiente: 503 em vez de estourar na montagem do adapter.
	if (!getServerCapabilities().oracle) {
		throw createError({ statusCode: 503, message: "Oráculo indisponível — IA não configurada neste ambiente" })
	}

	// O guard de rota do __root é client-side: não alcança esta rota Nitro. Sem a
	// checagem aqui, o endpoint seria um caminho aberto para o Bedrock da conta.
	const user = await requireSucontUser(event)

	const rawBody = await readBody(event)

	let params: Awaited<ReturnType<typeof chatParamsFromRequestBody>>
	try {
		params = await chatParamsFromRequestBody(rawBody)
	} catch (err) {
		if (err instanceof Response) {
			throw createError({ statusCode: 400, message: "Corpo da requisição inválido (AG-UI format esperado)" })
		}
		throw err
	}

	const { messages, forwardedProps } = params
	const contextSummary = forwardedProps.contextSummary as string | undefined

	// Teto de requisições ANTES de abrir o SSE: depois que o stream começa não há
	// mais status HTTP para devolver, e o erro viraria conexão cortada sem mensagem.
	try {
		enforceRequestRateLimit("SUCONT", user.id)
	} catch (error) {
		if (error instanceof RateLimitError) {
			setResponseHeader(event, "Retry-After", String(error.retryAfterSeconds))
			throw createError({ statusCode: 429, message: error.message, data: { retryAfterSeconds: error.retryAfterSeconds } })
		}
		throw error
	}

	const adapter = createAdapterFromEnv("SUCONT", { rateLimitKey: user.id })
	const stream = chat({
		adapter,
		messages,
		systemPrompts: [buildSystemPrompt(contextSummary)],
	})

	return toServerSentEventsResponse(stream)
})
