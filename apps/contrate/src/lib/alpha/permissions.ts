import { myModulePermissionsQueryConfig } from "@iefa/pbac"
import { queryOptions } from "@tanstack/react-query"
import { fetchMyAlphaPermissionsFn } from "@/server/access.fn"

/**
 * Grants do PRÓPRIO usuário nos módulos `alpha`/`alpha-admin`, resolvidos no servidor
 * pela sessão. Serve à navegação e ao guard da tela de acessos; o que o usuário pode
 * fazer no copiloto quem decide é a API do α (`alphaAccessQueryOptions`).
 */
export const myAlphaPermissionsQueryOptions = () => queryOptions(myModulePermissionsQueryConfig(["alpha", "alpha-admin"], () => fetchMyAlphaPermissionsFn()))
