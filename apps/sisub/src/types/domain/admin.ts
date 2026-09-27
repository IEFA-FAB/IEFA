// Admin and Super Admin Domain Types

import type { UserData, UserMilitaryData } from "@iefa/database/sisub"

// ============================================================================
// BASE TYPES (Re-export com aliases para compatibilidade)
// ============================================================================

/**
 * Dados do usuário (tabela user_data)
 */
export type UserDataRow = UserData

/**
 * Dados militares da própria conta, como chegam ao navegador (`fetchMilitaryDataFn`):
 * a linha de `user_military_data` SEM o CPF inteiro — só a versão mascarada. O documento
 * completo não sai do servidor (LGPD; ver `maskCpf`).
 */
export type MilitaryDataRow = Omit<UserMilitaryData, "nrCpf"> & { nrCpfMasked: string | null }

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
