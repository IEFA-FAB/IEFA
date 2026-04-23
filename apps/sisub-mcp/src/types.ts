/**
 * Tipos de domínio para o MCP server do sisub.
 * AppModule, UserPermission e PermissionScope vêm de @iefa/pbac (fonte canônica).
 */

export type { AppModule, PermissionScope, UserPermission } from "@iefa/pbac"

/** Contexto do usuário autenticado — carregado em cada chamada de tool. */
export interface UserContext {
	userId: string
	permissions: import("@iefa/pbac").UserPermission[]
}
