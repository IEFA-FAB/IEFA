/**
 * Módulos da aplicação — define "o quê" o usuário pode acessar.
 * - diner:               Comensal (acesso implícito para todos os usuários válidos)
 * - messhall:            Rancho (fiscal, operador de rancho) — scoped by mess_hall_id
 * - unit:                Gestão Unidade (gestão administrativa da OM) — scoped by unit_id
 * - kitchen:             Gestão Cozinha (planejamento, preparações, suprimentos) — scoped by kitchen_id
 * - kitchen-production:  Produção Cozinha (execução da produção diária) — scoped by kitchen_id
 * - global:              Administração global (permissões, avaliação, ingredientes)
 * - analytics:           Análise sistêmica global (painel superadmin, Power BI global)
 * - local-analytics:     Análises da unidade (dashboard local, indicadores da unidade)
 * - storage:             Estoque e almoxarifado
 */
export type AppModule = "diner" | "messhall" | "unit" | "kitchen" | "kitchen-production" | "global" | "analytics" | "local-analytics" | "storage"

/**
 * Permissão individual de um usuário.
 * - level 0: deny explícito (usado apenas para cancelar implicit allow)
 * - level 1: leitura / acesso básico
 * - level 2: escrita / edição
 * - level 3+: administração
 * Escopos nulos = permissão global (vale para qualquer unidade/rancho/cozinha)
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
