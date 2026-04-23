
export enum AccountGroup {
  CONSUMO = 'CONSUMO',
  BMP = 'BMP',
  INTANGIVEL = 'INTANGIVEL',
}

export type TimeFilter = 'MENSAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL';

export enum RiskLevel {
  BAIXO = 'Baixo Risco',
  MEDIO = 'Médio Risco',
  ALTO = 'Alto Risco',
  CRITICO = 'Crítico',
}

export enum ImpactLevel {
  INSIGNIFICANTE = 'Insignificante',
  MENOR = 'Menor',
  MODERADO = 'Moderado',
  MAIOR = 'Maior',
  CATASTROFICO = 'Catastrófico',
}

export enum ProbabilityLevel {
  RARO = 'Raro',
  OCASIONAL = 'Ocasional',
  RECORRENTE = 'Recorrente',
  PERSISTENTE = 'Persistente',
  CRONICO = 'Crônico',
}

// Represents a single normalized record (one category per UG per date)
export interface FinancialRecord {
  id: string;
  date: string; // e.g., "JULHO/2025"
  monthIndex: number; // 0-11
  year: number;
  sortableDate: string; // YYYY-MM
  cod: string;
  ug: string;
  orgaoSuperior: string;
  ods: string;
  group: AccountGroup;
  siafiValue: number;
  silomsValue: number;
  difference: number;
  
  // For Evolution Analysis
  previousDifference?: number; // Difference in the previous period
  previousSiafiValue?: number; // Added for detailed reporting
  previousSilomsValue?: number; // Added for detailed reporting
  previousDate?: string; // The date of the record used for comparison
  delta?: number; // Current - Previous (Positive = Worsened/Increased Diff)

  // Analysis field: Which system is higher?
  preponderance: 'SIAFI' | 'SILOMS' | 'EQUAL';

  // Risk Analysis Fields
  impactLevel?: ImpactLevel;
  probabilityLevel?: ProbabilityLevel;
  riskLevel?: RiskLevel;
  monthsWithDivergence?: number;
}

// Represents the raw "wide" row from the Excel
export interface RawInputRow {
  data: string;
  cod: string;
  ug: string;
  // Group 1
  g1_name: string;
  g1_siafi: number;
  g1_siloms: number;
  g1_diff: number;
  // Group 2
  g2_name: string;
  g2_siafi: number;
  g2_siloms: number;
  g2_diff: number;
  // Group 3
  g3_name: string;
  g3_siafi: number;
  g3_siloms: number;
  g3_diff: number;
}
