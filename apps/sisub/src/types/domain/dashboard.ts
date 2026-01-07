// Dashboard Domain Types

import type { MealKey } from "./meal";

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

/**
 * Forecast record from /api/rancho_previsoes
 * Representa a previsão de uma refeição por um usuário
 */
export interface ForecastRecord {
	user_id: string;
	date: string; // YYYY-MM-DD
	meal: MealKey;
	will_eat: boolean;
	mess_hall_id: number;
	created_at: string;
	updated_at: string;
}

/**
 * Presence record from /api/wherewhowhen
 * Representa a presença confirmada de um usuário em uma refeição
 */
export interface PresenceRecord {
	user_id: string;
	date: string; // YYYY-MM-DD
	meal: MealKey;
	mess_hall_id: number;
	created_at: string;
	updated_at: string;
}

/**
 * Mess Hall from /api/mess-halls
 */
export interface MessHallAPI {
	id: number;
	unit_id: number;
	code: string;
	display_name: string;
}

/**
 * Unit from /api/units
 */
export interface UnitAPI {
	id: number;
	code: string;
	display_name: string;
}

/**
 * User data from /api/user-data
 */
export interface UserDataAPI {
	id: string;
	created_at: string;
	email: string;
	nrOrdem: string | null;
}

/**
 * Military data from /api/user-military-data
 */
export interface UserMilitaryDataAPI {
	nrOrdem: string;
	nrCpf: string;
	nmGuerra: string | null;
	nmPessoa: string | null;
	sgPosto: string | null;
	sgOrg: string | null;
	dataAtualizacao: string;
}

// ============================================================================
// DASHBOARD AGGREGATED DATA TYPES
// ============================================================================

/**
 * Estatísticas por tipo de refeição
 */
export interface MealTypeStat {
	meal: MealKey;
	forecast: number; // quantidade prevista
	presence: number; // quantidade real (confirmada)
	percentage: number; // % do total de previsões
}

/**
 * Estatísticas de refeições por dia
 */
export interface DailyMealStat {
	date: string; // YYYY-MM-DD
	cafe: number;
	almoco: number;
	janta: number;
	ceia: number;
}

/**
 * Estatísticas por mess hall (rancho)
 */
export interface MessHallStats {
	mess_hall_id: number;
	mess_hall_name: string;
	total_forecast: number;
	total_presence: number;
	by_meal: MealTypeStat[];
}

/**
 * Métricas consolidadas do dashboard
 */
export interface DashboardMetrics {
	total_forecast: number;
	total_presence: number;
	by_meal_type: MealTypeStat[];
	daily_distribution: DailyMealStat[];
	by_mess_hall: MessHallStats[];
}

/**
 * Detalhes de um usuário para a tabela de presenças
 */
export interface UserMealDetail {
	id: string;
	email: string;
	name: string | null; // nmGuerra ou nmPessoa
	posto: string | null;
	org: string | null;
	forecast_meals: Array<{ date: string; meal: MealKey }>; // quais refeições previu
	presence_meals: Array<{ date: string; meal: MealKey }>; // quais refeições compareceu
	forecast_count: number;
	presence_count: number;
}

/**
 * Filtros do dashboard
 */
export interface DashboardFilters {
	startDate: string; // YYYY-MM-DD
	endDate: string;
	mess_hall_id?: number; // undefined = todos
	unit_id?: number; // para superadmin (filter by unit)
}

/**
 * Pessoa na lista de presença/ausência
 */
export interface PersonDetail {
	id: string;
	name: string | null;
	posto: string | null;
	org: string | null;
	email: string;
}

/**
 * Agregação de presença por dia/refeição/rancho
 */
export interface AggregatedPresenceRecord {
	date: string; // YYYY-MM-DD
	mess_hall_id: number;
	mess_hall_name: string;
	meal: MealKey;
	forecast_count: number; // quantos previram
	presence_count: number; // quantos compareceram
	difference: number; // presence - forecast (negativo = desperdício)
	attendance_rate: number; // %
	// Drill-down data
	absences: PersonDetail[]; // previram mas NÃO vieram
	attended: PersonDetail[]; // previram E vieram
	extras: PersonDetail[]; // NÃO previram mas vieram
}
