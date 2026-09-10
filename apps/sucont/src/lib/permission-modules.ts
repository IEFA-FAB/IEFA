/**
 * Módulos do PBAC do sucont — o mapa entre divisão da SUCONT e módulo de
 * autorização, e nada mais.
 *
 * Fica separado de `lib/modules.ts` porque aquele arquivo carrega ícones do
 * lucide e o catálogo de ferramentas: é o registro da NAVEGAÇÃO. Os gates de
 * servidor (`lib/auth.server.ts`) só precisam do mapa, e importá-lo de lá
 * arrastaria componentes React para dentro dos módulos de servidor.
 *
 * A separação é por MÓDULO, e não por escopo do PBAC, porque o escopo é um id
 * numérico de unidade/cozinha/refeitório — divisão da SUCONT não é nenhum dos
 * três. Ver o comentário de `AppModule` em @iefa/pbac.
 */

import type { AppModule, UserPermission } from "@iefa/pbac"
import { hasAnyPermission } from "@iefa/pbac"
import type { SucontDivision } from "#/lib/types"

/** Divisão → módulo do PBAC. Os nomes coincidem; a função existe para o tipo. */
const MODULE_BY_DIVISION = {
	"sucont-1": "sucont-1",
	"sucont-3": "sucont-3",
	"sucont-4": "sucont-4",
} as const satisfies Record<SucontDivision, AppModule>

/**
 * Módulo do PBAC que administra os acessos do SUCONT.
 *
 * Não se chama só `admin` porque `access_control.user_permissions` é a tabela do
 * ERP inteiro, e `admin` já é o módulo de administração de plataforma do sisub.
 */
export const SUCONT_ADMIN_MODULE = "sucont-admin" satisfies AppModule

/**
 * Os módulos das três DIVISÕES, na ordem em que o hub as apresenta.
 *
 * `sucont-admin` fica de fora: quem só administra acessos não trabalha em divisão
 * nenhuma, e incluí-lo aqui lhe daria o catálogo e as ferramentas inteiras.
 */
export const SUCONT_DIVISION_MODULES: AppModule[] = ["sucont-4", "sucont-3", "sucont-1"]

/** Todos os módulos do PBAC que o app usa — as três divisões mais a administração. */
export const SUCONT_PERMISSION_MODULES: AppModule[] = [...SUCONT_DIVISION_MODULES, SUCONT_ADMIN_MODULE]

/** Módulo do PBAC de uma divisão. */
export function permissionModuleForDivision(division: SucontDivision): AppModule {
	return MODULE_BY_DIVISION[division]
}

/**
 * Pode entrar no hub? Basta UMA divisão.
 *
 * Quem só tem `sucont-admin` entra por `/admin`, que tem o guard próprio — o hub é
 * o catálogo de ferramentas, e administrar acessos não é abrir ferramenta nenhuma.
 */
export function canAccessHub(permissions: UserPermission[]): boolean {
	return hasAnyPermission(permissions, SUCONT_DIVISION_MODULES, 1)
}
