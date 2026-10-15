// UserContext é canônico em @iefa/pbac (compartilhado entre os apps do ERP). Re-exportado
// aqui para as operations e guards do sisprov-domain importarem de um lugar só.
export type { AppModule, PermissionScope, UserContext, UserPermission } from "@iefa/pbac"
