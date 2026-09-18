/**
 * Documentos de descoberta do Projeto α.
 *
 * Diferente dos outros apps do IEFA, esta API **aceita bearer token de verdade**:
 * o `authMiddleware` valida um JWT emitido pelo Supabase Auth. Por isso aqui o
 * `/.well-known/oauth-protected-resource` (RFC 9728) é factual, e não uma
 * capacidade anunciada sem existir.
 */

import { formatContentSignal, renderApiCatalog, renderLlmsTxt, type SiteCatalog } from "@iefa/agent-web"
import type { Env, Hono, Schema } from "hono"
import { env } from "../env"

const BASE_URL = "https://alpha.iefa.com.br"

/** Emissor dos tokens aceitos: o GoTrue do projeto Supabase configurado. */
const AUTHORIZATION_SERVER = `${env.SUPABASE_URL.replace(/\/+$/, "")}/auth/v1`

const CATALOG: SiteCatalog = {
	name: "Projeto α",
	url: BASE_URL,
	description: "API de IA aplicada ao ciclo de contratações públicas da Força Aérea Brasileira (Lei 14.133/21).",
	longDescription:
		"Mantida pelo IEFA. Responde perguntas sobre contratações públicas com base em um acervo jurídico indexado, " +
		"citando os trechos usados. Toda a API exige bearer token de usuário autenticado.",
	pages: [],
	discoveryDocuments: [
		{ path: "/llms.txt", rel: "describedby", type: "text/plain", title: "API guide for agents" },
		{ path: "/.well-known/api-catalog", rel: "api-catalog", type: "application/linkset+json", title: "API catalog" },
		{
			path: "/.well-known/oauth-protected-resource",
			rel: "describedby",
			type: "application/json",
			title: "OAuth protected resource metadata",
		},
	],
}

const NOTES = [
	"**Toda a API exige autenticação.** Envie `Authorization: Bearer <token>` com um",
	"JWT emitido pelo Supabase Auth do IEFA; sem ele a resposta é 401.",
	"Veja `/.well-known/oauth-protected-resource` para o emissor aceito.",
	"",
	"O token é de **usuário**: é obtido por login de uma pessoa do COMAER. Não há",
	"credencial de cliente para agente autônomo. Um agente só opera aqui em nome de",
	"alguém que já se autenticou.",
	"",
	"As respostas citam os trechos do acervo usados (`cited_documents`, `_links.chunks`).",
	"Ao repassar uma resposta, **preserve as citações**: é conteúdo jurídico e a",
	"rastreabilidade da fonte é o que o torna utilizável.",
]

const ENDPOINTS = [
	{ title: "POST /api/v1/sessions", summary: "Abre uma sessão de conversa." },
	{ title: "POST /api/v1/sessions/{id}/messages", summary: "Envia uma mensagem e recebe a resposta completa." },
	{ title: "POST /api/v1/sessions/{id}/messages/stream", summary: "Mesma operação com resposta em streaming (SSE)." },
	{ title: "GET /api/v1/sessions/{id}/messages", summary: "Histórico de mensagens da sessão." },
	{ title: "GET /api/v1/chunks/{id}", summary: "Trecho citado do acervo, para conferir a fonte." },
]

const LLMS_TXT = renderLlmsTxt(CATALOG, {
	notes: NOTES,
	sections: [
		{
			heading: "Endpoints (todos exigem bearer token)",
			links: ENDPOINTS.map((endpoint) => ({ ...endpoint, url: BASE_URL })),
		},
	],
	optional: [
		{ title: "Catálogo de APIs", url: `${BASE_URL}/.well-known/api-catalog`, summary: "Linkset RFC 9727." },
		{
			title: "Metadados de recurso protegido",
			url: `${BASE_URL}/.well-known/oauth-protected-resource`,
			summary: "RFC 9728 — qual emissor pode emitir token para esta API.",
		},
		{ title: "Health check", url: `${BASE_URL}/health`, summary: "Estado do serviço." },
		{
			title: "Documentos legais",
			url: `${BASE_URL}/legal`,
			summary: "Termos, privacidade e cookies. Sem autoexclusão: pedidos de acesso ou eliminação por iefa@fab.mil.br, resposta em até 7 dias.",
		},
	],
})

const API_CATALOG = renderApiCatalog([
	{
		anchor: `${BASE_URL}/api/v1`,
		serviceDoc: [{ href: `${BASE_URL}/llms.txt`, type: "text/plain", title: "Projeto α — guia da API" }],
		status: [{ href: `${BASE_URL}/health`, type: "application/json", title: "Health check" }],
	},
])

/** RFC 9728. */
const PROTECTED_RESOURCE = JSON.stringify(
	{
		resource: BASE_URL,
		authorization_servers: [AUTHORIZATION_SERVER],
		bearer_methods_supported: ["header"],
		resource_documentation: `${BASE_URL}/llms.txt`,
	},
	null,
	2
)

const ROBOTS = [
	"# https://www.robotstxt.org/robotstxt.html",
	"#",
	"# API autenticada: todo endpoint exige bearer token. Não há o que rastrear —",
	"# a exceção são os documentos de descoberta, que dizem como a API funciona.",
	"",
	"User-agent: *",
	formatContentSignal({ search: "no", aiInput: "yes", aiTrain: "no" }),
	"Allow: /llms.txt",
	"Allow: /legal",
	"Allow: /.well-known/",
	"Disallow: /",
	"",
].join("\n")

/**
 * Registra os documentos de descoberta. Recebe o app já montado para não
 * interferir na cadeia tipada usada pelo RPC do Hono.
 */
export function registerAgentDiscovery<E extends Env, S extends Schema, B extends string>(app: Hono<E, S, B>): void {
	app.get("/robots.txt", (c) => c.text(ROBOTS, 200, { "cache-control": "public, max-age=86400" }))

	app.get("/llms.txt", (c) => c.text(LLMS_TXT, 200, { "cache-control": "public, max-age=3600" }))

	app.get("/.well-known/api-catalog", (c) =>
		c.body(API_CATALOG, 200, {
			"content-type": "application/linkset+json; charset=utf-8",
			"cache-control": "public, max-age=86400",
		})
	)

	app.get("/.well-known/oauth-protected-resource", (c) =>
		c.body(PROTECTED_RESOURCE, 200, {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "public, max-age=86400",
		})
	)
}

/**
 * Valor de `WWW-Authenticate` para as respostas 401, apontando os metadados do
 * recurso. Sem isso um cliente recebe 401 sem nenhuma pista de como se autenticar
 * — que é justamente o que a RFC 9728 resolve.
 */
export const WWW_AUTHENTICATE = `Bearer resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource"`
