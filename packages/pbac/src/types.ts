/**
 * Módulos da aplicação — define "o quê" o usuário pode acessar.
 *
 * O módulo é a fronteira entre apps do ERP: cada app resolve a MESMA tabela
 * `access_control.user_permissions` e filtra a própria visão pelos seus módulos.
 *
 * - diner:               Comensal (acesso implícito para todos os usuários válidos) — sisub
 * - messhall:            Rancho (fiscal, operador) — sisub, scoped by mess_hall_id
 * - unit:                Gestão Unidade — sisub, scoped by unit_id
 * - kitchen:             Gestão Cozinha — sisub, scoped by kitchen_id
 * - kitchen-production:  Produção Cozinha — sisub, scoped by kitchen_id
 * - global:              Administração global — sisub
 * - analytics:           Análise sistêmica global — sisub
 * - local-analytics:     Análises da unidade — sisub, scoped by unit_id
 * - storage:             Estoque e almoxarifado — sisub
 * - rumaer:              Uniformes RUMAER — rumaer, unscoped/global
 *                          level 2 = editar uniformes; level 3 = gerenciar grants do rumaer.
 * - sucont:              HUB SUCONT-4 (acompanhamento contábil) — sucont, unscoped/global.
 *                          level 1 = acessar o hub e ferramentas; level 2 = editar dados da
 *                          seção (área de trabalho, relatórios, mensagens); level 3 = gerenciar
 *                          grants do sucont.
 */
export type AppModule =
	| "diner"
	| "messhall"
	| "unit"
	| "kitchen"
	| "kitchen-production"
	| "global"
	| "analytics"
	| "local-analytics"
	| "storage"
	| "rumaer"
	| "sucont"

/**
 * Permissão individual de um usuário.
 * - level 0: deny explícito
 * - level 1: leitura / acesso básico
 * - level 2: escrita / edição
 * - level 3+: administração
 * Escopos nulos = permissão global (vale para qualquer contexto).
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

/**
 * Contexto de um usuário autenticado após resolução das permissões.
 * Compartilhado entre apps (sisub, rumaer) — cada app monta o seu no
 * `requireAuth()` do próprio runtime a partir de `resolveUserPermissions`.
 */
export interface UserContext {
	userId: string
	permissions: UserPermission[]
}
