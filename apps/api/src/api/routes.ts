import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { createApiHandler } from "./factory.js"

// Schemas de resposta base
const ErrorSchema = z.object({
	error: z.string(),
	details: z.string().optional(),
	timestamp: z.string().optional(),
})

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
const MultiValueParamSchema = z.string()

// Helper para criar rotas documentadas — retorna o route config tipado, sem chamar openapi()
function defineDocRoute<TSchema extends z.ZodType>(config: {
	path: string
	tags: string[]
	summary: string
	description: string
	parameters?: any[]
	responseSchema: TSchema
}) {
	return createRoute({
		method: "get" as const,
		path: config.path,
		tags: config.tags,
		summary: config.summary,
		description: config.description,
		parameters: [
			...(config.parameters ?? []),
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
						schema: z.array(config.responseSchema),
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
}

// /api/opinion -> opinions
const [, opinionHandler] = createApiHandler({
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
const opinionRoute = defineDocRoute({
	path: "/opinion",
	tags: ["Opiniões"],
	summary: "Lista opiniões dos usuários",
	description: "Retorna todas as opiniões registradas com filtros opcionais por usuário e pergunta",
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
})

// /api/rancho_previsoes -> meal_forecasts
const [, forecastHandler] = createApiHandler({
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
const forecastRoute = defineDocRoute({
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
})

// /api/wherewhowhen -> meal_presences
const [, presenceHandler] = createApiHandler({
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
const presenceRoute = defineDocRoute({
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
})

// /api/user-military-data -> user_military_data
const [, militaryDataHandler] = createApiHandler({
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
const militaryDataRoute = defineDocRoute({
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
})

// /api/user-data -> user_data
const [, userDataHandler] = createApiHandler({
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
const userDataRoute = defineDocRoute({
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
})

// /api/units -> sisub.units
const [, unitsHandler] = createApiHandler({
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
const unitsRoute = defineDocRoute({
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
})

// /api/mess-halls -> sisub.mess_halls
const [, messHallsHandler] = createApiHandler({
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
const messHallsRoute = defineDocRoute({
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
})

export const api = new OpenAPIHono()
	.openapi(opinionRoute, opinionHandler as any)
	.openapi(forecastRoute, forecastHandler as any)
	.openapi(presenceRoute, presenceHandler as any)
	.openapi(militaryDataRoute, militaryDataHandler as any)
	.openapi(userDataRoute, userDataHandler as any)
	.openapi(unitsRoute, unitsHandler as any)
	.openapi(messHallsRoute, messHallsHandler as any)
