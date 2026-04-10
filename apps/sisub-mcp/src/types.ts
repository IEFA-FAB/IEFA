/**
 * Tipos de domínio para o MCP server do sisub.
 * Espelha apps/sisub/src/types/domain/permissions.ts sem deps React.
 */

/**
 * Módulos da aplicação sisub.
 * Idêntico ao AppModule do sisub app.
 */
export type AppModule = "diner" | "messhall" | "unit" | "kitchen" | "kitchen-production" | "global" | "analytics" | "local-analytics" | "storage"

/**
 * Permissão individual de um usuário.
 * - level 1: leitura / acesso básico
 * - level 2: escrita / edição
 * - level 3+: administração
 * Escopos nulos = permissão global (vale para qualquer cozinha/unidade/rancho).
 */
export interface UserPermission {
	module: AppModule
	level: number
	mess_hall_id: number | null
	kitchen_id: number | null
	unit_id: number | null
}

/** Escopo geográfico/operacional para validação granular. */
export type PermissionScope = { type: "unit"; id: number } | { type: "mess_hall"; id: number } | { type: "kitchen"; id: number }

/** Contexto do usuário autenticado — carregado em cada chamada de tool. */
export interface UserContext {
	userId: string
	permissions: UserPermission[]
}
