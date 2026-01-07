// Admin and Super Admin Domain Types

// ============================================================================
// PROFILE TYPES
// ============================================================================

export type UserDataRow = {
	id: string;
	email: string;
	nrOrdem: string | null;
};

export type MilitaryDataRow = {
	nrOrdem: string | null;
	nrCpf: string;
	nmGuerra: string | null;
	nmPessoa: string | null;
	sgPosto: string | null;
	sgOrg: string | null;
	dataAtualizacao: string | null; // timestamp with time zone -> string
};

// ============================================================================
// SUPER ADMIN TYPES
// ============================================================================

export interface EvalConfig {
	active: boolean;
	value: string;
}

export type EvaluationResult = {
	shouldAsk: boolean;
	question: string | null;
};

export type UserLevel = "user" | "admin" | "superadmin";
export type UserLevelOrNull = UserLevel | null;

export type ProfileAdmin = {
	id: string;
	saram: string | null;
	name: string | null;
	email: string;
	role: UserLevelOrNull;
	om: string | null;
	created_at: string;
	updated_at: string;
};

export type NewUserPayload = {
	id: string;
	email: string;
	name: string;
	saram: string;
	role: UserLevelOrNull;
	om?: string | null;
};

export type EditUserPayload = {
	saram: string;
	role: UserLevelOrNull;
	om?: string | null;
};

export type AdminStatus = "checking" | "authorized" | "unauthorized";
