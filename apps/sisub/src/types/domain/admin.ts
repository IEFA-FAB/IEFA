// Admin and Super Admin Domain Types

import type { ProfileAdmin, ProfileAdminInsert, ProfileAdminUpdate, UserData, UserMilitaryData } from "@iefa/database/sisub"

// ============================================================================
// BASE TYPES (Re-export com aliases para compatibilidade)
// ============================================================================

/**
 * Perfil de administrador (tabela profiles_admin)
 */
export type { ProfileAdmin }

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
 * Níveis de acesso do sistema
 */
export type UserLevel = "user" | "admin" | "superadmin"
export type UserLevelOrNull = UserLevel | null

/**
 * Payload para criação de novo usuário admin
 * Usa ProfileAdminInsert como base com validação de domínio
 */
export type NewUserPayload = Pick<ProfileAdminInsert, "id" | "email" | "name" | "saram"> & {
	role: UserLevelOrNull
	om?: string | null
}

/**
 * Payload para edição de usuário existente
 * Apenas campos editáveis no domínio
 */
export type EditUserPayload = Pick<ProfileAdminUpdate, "saram" | "om"> & {
	role: UserLevelOrNull
}

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
