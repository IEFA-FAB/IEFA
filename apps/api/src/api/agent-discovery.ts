/**
 * Documentos de descoberta da Sisub API: `robots.txt`, `llms.txt` e
 * `/.well-known/api-catalog`.
 *
 * O `llms.txt` é gerado a partir do próprio documento OpenAPI do app, então
 * endpoint novo aparece sozinho — não há lista paralela para dessincronizar.
 */

import type { OpenAPIHono } from "@hono/zod-openapi"
import {
	ASSISTANT_USER_AGENTS,
	formatContentSignal,
	type LlmsLink,
	renderApiCatalog,
	renderLlmsTxt,
	type SiteCatalog,
	TRAINING_USER_AGENTS,
} from "@iefa/agent-web"

const BASE_URL = "https://api.iefa.com.br"

const CATALOG: SiteCatalog = {
	name: "Sisub API",
	url: BASE_URL,
	description: "API pública de consulta a dados do sistema de subsistência da Força Aérea Brasileira.",
	longDescription:
		"Mantida pelo IEFA. A leitura pública sob /api cobre catálogo e estrutura organizacional. " +
		"Os endpoints que devolvem dado pessoal e os de /api/admin exigem o header x-admin-secret e não são públicos.",
	pages: [],
	discoveryDocuments: [
		{ path: "/llms.txt", rel: "describedby", type: "text/plain", title: "API guide for agents" },
		{ path: "/doc", rel: "service-desc", type: "application/json", title: "OpenAPI 3.0 specification" },
		{ path: "/.well-known/api-catalog", rel: "api-catalog", type: "application/linkset+json", title: "API catalog" },
	],
}

const NOTES = [
	"API REST de leitura, documentada em OpenAPI 3.0 em `/doc`.",
	"Referência navegável (Scalar) na raiz `/`.",
	"",
	"Os endpoints listados abaixo são **abertos**: não exigem autenticação e aceitam CORS",
	"de qualquer origem. Eles cobrem o catálogo de itens e a estrutura organizacional.",
	"",
	"O que devolve DADO PESSOAL não está listado e não é público: exige o header",
	"`x-admin-secret`, igual aos endpoints sob `/api/admin`. O segredo não é distribuído —",
	"não tente adivinhá-lo.",
	"",
	"Prefira consumir esta API a raspar as interfaces do SISUB: os dados são os mesmos,",
	"em formato estruturado e estável.",
]

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"] as const

interface OpenApiOperation {
	summary?: string
	description?: string
	tags?: string[]
	/** Requisito de segurança do OpenAPI; presente = a rota exige credencial. */
	security?: unknown[]
}

/**
 * Uma rota é pública quando o próprio documento OpenAPI não lhe atribui `security`.
 *
 * Derivar disso, em vez de manter uma lista aqui, é o que impede o llms.txt de voltar a
 * anunciar como aberta uma rota que passou a exigir credencial — foi assim que as cinco
 * rotas de dado pessoal ficaram listadas por nome enquanto eram anônimas.
 */
function isPublicOperation(operation: OpenApiOperation): boolean {
	return !operation.security || operation.security.length === 0
}

/** Forma mínima que interessa aqui — o tipo do OpenAPI completo não agrega nada. */
type OpenApiPaths = Record<string, Record<string, unknown>>

function asOperation(value: unknown): OpenApiOperation | null {
	return typeof value === "object" && value !== null ? (value as OpenApiOperation) : null
}

/** Endpoints públicos, agrupados pela tag do OpenAPI. */
function endpointSections(paths: OpenApiPaths): Array<{ heading: string; links: LlmsLink[] }> {
	const byTag = new Map<string, LlmsLink[]>()

	for (const [path, operations] of Object.entries(paths)) {
		// Rotas administrativas exigem segredo compartilhado; não são superfície pública.
		if (path.startsWith("/api/admin")) continue

		for (const method of HTTP_METHODS) {
			const operation = asOperation(operations[method])
			if (!operation) continue
			if (!isPublicOperation(operation)) continue

			const tag = operation.tags?.[0] ?? "Endpoints"
			const links = byTag.get(tag) ?? []
			links.push({
				title: `${method.toUpperCase()} ${path}`,
				url: `${BASE_URL}${path}`,
				summary: operation.summary ?? operation.description ?? "Endpoint da Sisub API.",
			})
			byTag.set(tag, links)
		}
	}

	return Array.from(byTag.entries()).map(([heading, links]) => ({ heading, links }))
}

function renderLlms(paths: OpenApiPaths): string {
	return renderLlmsTxt(CATALOG, {
		notes: NOTES,
		sections: endpointSections(paths),
		optional: [
			{ title: "Especificação OpenAPI", url: `${BASE_URL}/doc`, summary: "Documento OpenAPI 3.0 completo, incluindo schemas." },
			{ title: "Catálogo de APIs", url: `${BASE_URL}/.well-known/api-catalog`, summary: "Linkset RFC 9727." },
			{ title: "Health check", url: `${BASE_URL}/health`, summary: "Estado do serviço." },
		],
	})
}

/** Caminhos com requisito de segurança — a mesma fonte que o llms.txt usa para omiti-los. */
function restrictedPaths(paths: OpenApiPaths): string[] {
	const restricted: string[] = []
	for (const [path, operations] of Object.entries(paths)) {
		if (path.startsWith("/api/admin")) continue
		const hasRestricted = HTTP_METHODS.some((method) => {
			const operation = asOperation(operations[method])
			return operation != null && !isPublicOperation(operation)
		})
		if (hasRestricted) restricted.push(path)
	}
	return restricted.sort()
}

const PUBLIC_SIGNAL = formatContentSignal({ search: "yes", aiInput: "yes", aiTrain: "no" })
const TRAINING_SIGNAL = formatContentSignal({ search: "no", aiInput: "no", aiTrain: "no" })

function group(userAgents: readonly string[], signal: string, rules: string[]): string {
	return [...userAgents.map((agent) => `User-agent: ${agent}`), signal, ...rules].join("\n")
}

function renderRobots(restrictedPaths: string[]): string {
	// Rota que exige segredo não é superfície de rastreio: geraria 401 em série, e listá-la
	// como permitida é o convite que colocou dado pessoal na mira de crawler de IA.
	const rules = ["Allow: /", "Disallow: /api/admin/", ...restrictedPaths.map((path) => `Disallow: ${path}`)]

	return [
		"# https://www.robotstxt.org/robotstxt.html",
		"#",
		"# API pública de dados de subsistência. Para entender a superfície, comece por",
		"# /llms.txt e /doc — não é preciso rastrear endpoint por endpoint.",
		"",
		group(["*"], PUBLIC_SIGNAL, rules),
		"",
		"# --- Assistentes de IA e buscadores com IA -------------------------------",
		"",
		group(ASSISTANT_USER_AGENTS, PUBLIC_SIGNAL, rules),
		"",
		"# --- Coletores voltados a treinamento de modelos -------------------------",
		"",
		group(TRAINING_USER_AGENTS, TRAINING_SIGNAL, ["Disallow: /"]),
		"",
	].join("\n")
}

const API_CATALOG = renderApiCatalog([
	{
		anchor: BASE_URL,
		serviceDesc: [{ href: `${BASE_URL}/doc`, type: "application/json", title: "Sisub API — OpenAPI 3.0" }],
		serviceDoc: [{ href: `${BASE_URL}/`, type: "text/html", title: "Sisub API — referência navegável" }],
		status: [{ href: `${BASE_URL}/health`, type: "application/json", title: "Health check" }],
		describedby: [{ href: `${BASE_URL}/llms.txt`, type: "text/plain", title: "Guia da API para agentes" }],
	},
])

/**
 * Registra as rotas de descoberta. Recebe o app para ler o documento OpenAPI já
 * montado, em vez de manter uma segunda lista de endpoints.
 */
export function registerAgentDiscovery(app: OpenAPIHono, openApiConfig: Parameters<OpenAPIHono["getOpenAPIDocument"]>[0]): void {
	app.get("/robots.txt", (c) => {
		const document = app.getOpenAPIDocument(openApiConfig) as unknown as { paths?: OpenApiPaths }
		return c.text(renderRobots(restrictedPaths(document.paths ?? {})), 200, { "cache-control": "public, max-age=86400" })
	})

	app.get("/llms.txt", (c) => {
		const document = app.getOpenAPIDocument(openApiConfig) as unknown as { paths?: OpenApiPaths }
		return c.text(renderLlms(document.paths ?? {}), 200, { "cache-control": "public, max-age=3600" })
	})

	app.get("/.well-known/api-catalog", (c) =>
		c.body(API_CATALOG, 200, {
			"content-type": "application/linkset+json; charset=utf-8",
			"cache-control": "public, max-age=86400",
		})
	)
}
