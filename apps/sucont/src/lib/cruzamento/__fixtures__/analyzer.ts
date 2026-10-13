import { CONTA_EXECUCAO_RESPONSABILIDADE as C8972, CONTA_RESPONSABILIDADE as C8971, type RawRecord } from "../analyzer"

// Massa de caracterização do `analyzeData`: cada linha exercita um ramo da análise.

const rec = (UG: string, ContaContabil: string, ContaCorrente: string, Saldo: number): RawRecord => ({ UG, ContaContabil, ContaCorrente, Saldo })

export const AMPLO: RawRecord[] = [
	rec("120062", "123119905", "X0", 999), // fora do par
	rec("170999", C8972, "STN", 10), // perna da STN: conta corrente sai
	rec("120062", C8971, "STN", 10),
	rec("120062", C8972, "Z1", 0), // UG indevida com saldo zerado nos dois lados: regular
	rec("120075", C8971, "Z1", 0),
	rec("120075", C8972, "I1", 100), // UG indevida com saldo: crítica, alvo = 1ª indevida ordenada
	rec("120062", C8972, "I1", 50),
	rec("120052", C8971, "I1", 150),
	rec("120062", C8972, "I2", 0), // indevida zerada na 8972, divergência pela 8971
	rec("120075", C8971, "I2", 100),
	rec("120052", C8972, "R1", 300), // espelhado: regular, mas a UG entra no mapa
	rec("120090", C8971, "R1", 300),
	rec("120052", C8972, "A1", -80), // só 8972: ausência na 8971, alvo = 120052
	rec("999999", C8971, "A2", 70), // só 8971, UG desconhecida
	rec("120090", C8971, "D1", 40), // divergência numa UG sem crítica: atenção
	rec("120052", C8972, "D1", 10),
	rec("120075", C8971, "D2", 5), // divergência simples (a indevida de I1/I2 é a 120062)
	rec("120052", C8972, "D2", 1),
	rec("120100", C8971, "T1", 30), // empate de impacto com 120101, desempata por contagem
	rec("120052", C8972, "T1", 10),
	rec("120101", C8971, "T2", 30),
	rec("120052", C8972, "T2", 20),
	rec("120101", C8971, "T3", 20),
	rec("120052", C8972, "T3", 10),
	rec("120110", C8971, "D3", 50), // divergência e depois ausência na mesma UG: vira crítica
	rec("120052", C8972, "D3", 40),
	rec("120110", C8971, "A3", 5),
	rec("120062", C8971, "D4", 5), // divergência numa UG já crítica (I1): segue crítica
	rec("120052", C8972, "D4", 1),
	rec("120052", C8972, "R2", 70), // espelhado: a UG 120120 fica regular no mapa
	rec("120120", C8971, "R2", 70),
]

export const SO_ATENCAO: RawRecord[] = [rec("120090", C8971, "D1", 40), rec("120052", C8972, "D1", 10)]

export const CRITICA_SEM_IMPACTO: RawRecord[] = [rec("120062", C8972, "I1", 100), rec("120062", C8971, "I1", 100)]
