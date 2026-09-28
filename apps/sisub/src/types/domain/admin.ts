// Admin and Super Admin Domain Types

import type { UserData } from "@iefa/database/sisub"

// ============================================================================
// BASE TYPES (Re-export com aliases para compatibilidade)
// ============================================================================

/**
 * Dados do usuário (tabela user_data)
 */
export type UserDataRow = UserData

/**
 * Dados militares da própria conta, como chegam ao navegador (`fetchMilitaryDataFn`): a
 * identificação de `core.military_identity` e o CPF MASCARADO (`***.456.789-**`), montado no banco
 * (`core.military_masked_cpf`). O documento inteiro e o nome completo não saem do banco (LGPD,
 * change `lgpd-military-roster-key`).
 */
export type MilitaryDataRow = {
	nrOrdem: string | null
	nmGuerra: string | null
	sgPosto: string | null
	sgOrg: string | null
	dataAtualizacao: string | null
	maskedCpf: string | null
}

// ============================================================================
// DOMAIN TYPES (Tipos de Negócio)
// ============================================================================

/**
 * Estado de autorização do admin (tipo de domínio, não existe no banco)
 */
export type AdminStatus = "checking" | "authorized" | "unauthorized"

// ============================================================================
// SUPER ADMIN TYPES
// ============================================================================

/**
 * Configuração de avaliação do sistema
 */
export interface EvalConfig {
	active: boolean
	value: string
}

/**
 * Resultado da verificação de avaliação
 */
export type EvaluationResult = {
	shouldAsk: boolean
	question: string | null
}
