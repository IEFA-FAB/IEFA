import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import type { Handler } from "hono"
import { createApiHandler } from "./factory.js"

// Schemas de resposta base
const ErrorSchema = z.object({
	error: z.string(),
	details: z.string().optional(),
	timestamp: z.string().optional(),
}) as any

// Schemas específicos para cada endpoint
const OpinionSchema = z.object({
	id: z.uuid(),
	created_at: z.iso.datetime(),
	value: z.string(),
	question: z.string(),
	userId: z.uuid(),
})

const MealForecastSchema = z.object({
	user_id: z.uuid(),
	date: z.iso.date(),
	meal: z.enum(["cafe", "almoco", "janta", "ceia"]),
	will_eat: z.boolean(),
	mess_hall_id: z.number(),
	created_at: z.iso.datetime(),
	updated_at: z.iso.datetime(),
})

const MealPresenceSchema = z.object({
	user_id: z.uuid(),
	date: z.iso.date(),
	meal: z.enum(["cafe", "almoco", "janta", "ceia"]),
	mess_hall_id: z.number(),
	created_at: z.iso.datetime(),
	updated_at: z.iso.datetime(),
})

const UserMilitaryDataSchema = z.object({
	nrOrdem: z.string(),
	nrCpf: z.string(),
	nmGuerra: z.string(),
	nmPessoa: z.string(),
	sgPosto: z.string(),
	sgOrg: z.string(),
	dataAtualizacao: z.iso.datetime(),
})

const UserDataSchema = z.object({
	id: z.uuid(),
	created_at: z.iso.datetime(),
	email: z.string().email(),
	nrOrdem: z.string(),
})

const UnitSchema = z.object({
	id: z.number(),
	code: z.string(),
	display_name: z.string(),
})

const MessHallSchema = z.object({
	id: z.number(),
	unit_id: z.number(),
	code: z.string(),
	display_name: z.string(),
})

// Schema para parâmetros de filtro com múltiplos valores
const MultiValueParamSchema = z.string() as any

export const api = new OpenAPIHono()

// Helper para criar rotas documentadas
function createDocumentedRoute(config: {
	path: string
	tags: string[]
	summary: string
	description: string
	parameters?: any[]
	responseSchema: z.ZodTypeAny
	handler: Handler
}) {
	const route = createRoute({
		method: "get",
		path: config.path,
		tags: config.tags,
		summary: config.summary,
		description: config.description,
		parameters: [
			...(config.parameters || []),
			{
				name: "limit",
				in: "query" as const,
				schema: {
					type: "integer",
					minimum: 1,
					maximum: 100000,
					default: 100000,
				},
				description: "Número máximo de registros",
			},
			{
				name: "order",
				in: "query" as const,
				schema: { type: "string" },
				description: "Ordenação: coluna:asc/desc",
			},
		],
		responses: {
			200: {
				description: "Sucesso",
				content: {
					"application/json": {
						schema: z.array(config.responseSchema) as any,
					},
				},
			},
			500: {
				description: "Erro interno do servidor",
				content: {
					"application/json": {
						schema: ErrorSchema,
					},
				},
			},
		},
	})

	// biome-ignore lint/suspicious/noExplicitAny: Type mismatch between generic Handler and OpenAPI handler requires casting
	return api.openapi(route, config.handler as any)
}

// /api/opinion -> opinions
{
	const [_headersMw, handler] = createApiHandler({
		table: "opinions",
		select: 'id, created_at, value, question, "userId"',
		dateColumn: "created_at",
		dateColumnType: "timestamp",
		defaultOrder: [{ column: "created_at", ascending: false }],
		mapParams: {
			userId: "userId",
			question: "question",
		},
		cacheControl: "public, max-age=300",
	})

	createDocumentedRoute({
		path: "/opinion",
		tags: ["Opiniões"],
		summary: "Lista opiniões dos usuários",
		description:
			"Retorna todas as opiniões registradas com filtros opcionais por usuário e pergunta",
		parameters: [
			{
				name: "userId",
				in: "query",
				schema: MultiValueParamSchema,
				description: "Filtrar por ID(s) do usuário",
			},
			{
				name: "question",
				in: "query",
				schema: MultiValueParamSchema,
				description: "Filtrar por texto da pergunta (exato)",
			},
			{
				name: "question_ilike",
				in: "query",
				schema: { type: "string" },
				description: "Filtrar por texto da pergunta (contém, case-insensitive)",
			},
		],
		responseSchema: OpinionSchema,
		handler,
	})
}

// /api/rancho_previsoes -> meal_forecasts
{
	const [_headersMw, handler] = createApiHandler({
		table: "meal_forecasts",
		select: "user_id, date, meal, will_eat, mess_hall_id, created_at, updated_at",
		dateColumn: "date",
		dateColumnType: "date",
		defaultOrder: [
			{ column: "date", ascending: false },
			{ column: "mess_hall_id", ascending: true },
			{ column: "meal", ascending: true },
		],
		mapParams: {
			user_id: "user_id",
			meal: "meal",
			mess_hall_id: "mess_hall_id",
			will_eat: "will_eat",
		},
		cacheControl: "public, max-age=300",
	})

	createDocumentedRoute({
		path: "/rancho_previsoes",
		tags: ["Previsões de Refeições"],
		summary: "Lista previsões de refeições",
		description: "Retorna previsões de quem vai comer em cada refeitório",
		parameters: [
			{
				name: "user_id",
				in: "query",
				schema: MultiValueParamSchema,
				description: "Filtrar por ID(s) do usuário",
			},
			{
				name: "meal",
				in: "query",
				schema: {
					type: "string",
					enum: ["cafe", "almoco", "janta", "ceia"],
				},
				description: "Filtrar por tipo de refeição",
			},
			{
				name: "mess_hall_id",
				in: "query",
				schema: MultiValueParamSchema,
				description: "Filtrar por ID(s) do refeitório",
			},
			{
				name: "will_eat",
				in: "query",
				schema: { type: "boolean" },
				description: "Filtrar por quem vai comer (true/false)",
			},
		],
		responseSchema: MealForecastSchema,
		handler,
	})
}

// /api/wherewhowhen -> meal_presences
{
	const [_headersMw, handler] = createApiHandler({
		table: "meal_presences",
		select: "user_id, date, meal, mess_hall_id, created_at, updated_at",
		dateColumn: "date",
		dateColumnType: "date",
		defaultOrder: [
			{ column: "date", ascending: false },
			{ column: "mess_hall_id", ascending: true },
			{ column: "user_id", ascending: true },
		],
		mapParams: {
			user_id: "user_id",
			meal: "meal",
			mess_hall_id: "mess_hall_id",
		},
		cacheControl: "public, max-age=300",
	})

	createDocumentedRoute({
		path: "/wherewhowhen",
		tags: ["Presenças"],
		summary: "Lista presenças em refeições",
		description: "Retorna registros de presença confirmada nos refeitórios",
		parameters: [
			{
				name: "user_id",
				in: "query",
				schema: MultiValueParamSchema,
				description: "Filtrar por ID(s) do usuário",
			},
			{
				name: "meal",
				in: "query",
				schema: {
					type: "string",
					enum: ["cafe", "almoco", "janta", "ceia"],
				},
				description: "Filtrar por tipo de refeição",
			},
			{
				name: "mess_hall_id",
				in: "query",
				schema: MultiValueParamSchema,
				description: "Filtrar por ID(s) do refeitório",
			},
		],
		responseSchema: MealPresenceSchema,
		handler,
	})
}

// /api/user-military-data -> user_military_data
{
	const [_headersMw, handler] = createApiHandler({
		table: "user_military_data",
		select: '"nrOrdem", "nrCpf", "nmGuerra", "nmPessoa", "sgPosto", "sgOrg", "dataAtualizacao"',
		dateColumn: "dataAtualizacao",
		dateColumnType: "timestamp",
		defaultOrder: [
			{ column: "dataAtualizacao", ascending: false },
			{ column: "sgOrg", ascending: true },
			{ column: "sgPosto", ascending: true },
			{ column: "nmGuerra", ascending: true },
		],
		mapParams: {
			nrOrdem: "nrOrdem",
			nrCpf: "nrCpf",
			nmGuerra: "nmGuerra",
			nmPessoa: "nmPessoa",
			sgPosto: "sgPosto",
			sgOrg: "sgOrg",
		},
		cacheControl: "public, max-age=300",
	})

	createDocumentedRoute({
		path: "/user-military-data",
		tags: ["Dados Militares"],
		summary: "Lista dados militares dos usuários",
		description: "Retorna dados cadastrais militares com informações de posto, organização, etc",
		parameters: [
			{
				name: "nrOrdem",
				in: "query",
				schema: MultiValueParamSchema,
				description: "Filtrar por número de ordem",
			},
			{
				name: "nrCpf",
				in: "query",
				schema: MultiValueParamSchema,
				description: "Filtrar por CPF",
			},
			{
				name: "nmGuerra",
				in: "query",
				schema: MultiValueParamSchema,
				description: "Filtrar por nome de guerra (exato)",
			},
			{
				name: "nmGuerra_ilike",
				in: "query",
				schema: { type: "string" },
				description: "Filtrar por nome de guerra (contém, case-insensitive)",
			},
			{
				name: "nmPessoa",
				in: "query",
				schema: MultiValueParamSchema,
				description: "Filtrar por nome completo (exato)",
			},
			{
				name: "nmPessoa_ilike",
				in: "query",
				schema: { type: "string" },
				description: "Filtrar por nome completo (contém, case-insensitive)",
			},
			{
				name: "sgPosto",
				in: "query",
				schema: MultiValueParamSchema,
				description: "Filtrar por sigla do posto",
			},
			{
				name: "sgOrg",
				in: "query",
				schema: MultiValueParamSchema,
				description: "Filtrar por sigla da organização (exato)",
			},
			{
				name: "sgOrg_ilike",
				in: "query",
				schema: { type: "string" },
				description: "Filtrar por sigla da organização (contém, case-insensitive)",
			},
		],
		responseSchema: UserMilitaryDataSchema,
		handler,
	})
}

// /api/user-data -> user_data
{
	const [_headersMw, handler] = createApiHandler({
		table: "user_data",
		select: 'id, created_at, email, "nrOrdem"',
		dateColumn: "created_at",
		dateColumnType: "timestamp",
		defaultOrder: [
			{ column: "created_at", ascending: false },
			{ column: "email", ascending: true },
		],
		mapParams: {
			id: "id",
			email: "email",
			nrOrdem: "nrOrdem",
		},
		cacheControl: "public, max-age=300",
	})

	createDocumentedRoute({
		path: "/user-data",
		tags: ["Dados de Usuário"],
		summary: "Lista dados básicos dos usuários",
		description: "Retorna informações básicas de cadastro dos usuários",
		parameters: [
			{
				name: "id",
				in: "query",
				schema: MultiValueParamSchema,
				description: "Filtrar por ID(s) do usuário",
			},
			{
				name: "email",
				in: "query",
				schema: MultiValueParamSchema,
				description: "Filtrar por email (exato)",
			},
			{
				name: "email_ilike",
				in: "query",
				schema: { type: "string" },
				description: "Filtrar por email (contém, case-insensitive)",
			},
			{
				name: "nrOrdem",
				in: "query",
				schema: MultiValueParamSchema,
				description: "Filtrar por número de ordem (exato)",
			},
			{
				name: "nrOrdem_ilike",
				in: "query",
				schema: { type: "string" },
				description: "Filtrar por número de ordem (contém)",
			},
		],
		responseSchema: UserDataSchema,
		handler,
	})
}

// /api/units -> sisub.units
{
	const [_headersMw, handler] = createApiHandler({
		table: "units",
		select: "id, code, display_name",
		defaultOrder: [
			{ column: "code", ascending: true },
			{ column: "id", ascending: true },
		],
		mapParams: {
			id: "id",
			code: "code",
			display_name: "display_name",
		},
		cacheControl: "public, max-age=300",
	})

	createDocumentedRoute({
		path: "/units",
		tags: ["Unidades"],
		summary: "Lista unidades organizacionais",
		description: "Retorna todas as unidades cadastradas no sistema",
		parameters: [
			{
				name: "id",
				in: "query",
				schema: MultiValueParamSchema,
				description: "Filtrar por ID(s) da unidade",
			},
			{
				name: "code",
				in: "query",
				schema: MultiValueParamSchema,
				description: "Filtrar por código (exato)",
			},
			{
				name: "code_ilike",
				in: "query",
				schema: { type: "string" },
				description: "Filtrar por código (contém, case-insensitive)",
			},
			{
				name: "display_name",
				in: "query",
				schema: MultiValueParamSchema,
				description: "Filtrar por nome de exibição (exato)",
			},
			{
				name: "display_name_ilike",
				in: "query",
				schema: { type: "string" },
				description: "Filtrar por nome de exibição (contém, case-insensitive)",
			},
		],
		responseSchema: UnitSchema,
		handler,
	})
}

// /api/mess-halls -> sisub.mess_halls
{
	const [_headersMw, handler] = createApiHandler({
		table: "mess_halls",
		select: "id, unit_id, code, display_name",
		defaultOrder: [
			{ column: "unit_id", ascending: true },
			{ column: "code", ascending: true },
		],
		mapParams: {
			id: "id",
			unit_id: "unit_id",
			code: "code",
			display_name: "display_name",
		},
		cacheControl: "public, max-age=300",
	})

	createDocumentedRoute({
		path: "/mess-halls",
		tags: ["Refeitórios"],
		summary: "Lista refeitórios",
		description: "Retorna todos os refeitórios cadastrados",
		parameters: [
			{
				name: "id",
				in: "query",
				schema: MultiValueParamSchema,
				description: "Filtrar por ID(s) do refeitório",
			},
			{
				name: "unit_id",
				in: "query",
				schema: MultiValueParamSchema,
				description: "Filtrar por ID(s) da unidade",
			},
			{
				name: "code",
				in: "query",
				schema: MultiValueParamSchema,
				description: "Filtrar por código (exato)",
			},
			{
				name: "code_ilike",
				in: "query",
				schema: { type: "string" },
				description: "Filtrar por código (contém, case-insensitive)",
			},
			{
				name: "display_name",
				in: "query",
				schema: MultiValueParamSchema,
				description: "Filtrar por nome de exibição (exato)",
			},
			{
				name: "display_name_ilike",
				in: "query",
				schema: { type: "string" },
				description: "Filtrar por nome de exibição (contém, case-insensitive)",
			},
		],
		responseSchema: MessHallSchema,
		handler,
	})
}
