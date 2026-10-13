// Extraído de routes/conta-generica.tsx (port do analistacontagenerica): contagens
// do painel (totais, conferentes, questões RAC, rankings de ODS, OS, UG e conta).
import { type GroupedData, getConferente, getOds, getOs, getRacInfo, RAC_QUESTIONS } from "#/lib/conta-generica/helpers"

export const computeDerivedStats = (result: GroupedData | null) => {
	const totalUGs = result ? Object.keys(result).length : 0
	let totalContas = 0
	let totalSaldoGeral = 0
	let totalInconsistencias = 0

	const ugVolumes: { ug: string; volume: number; count: number }[] = []
	const contaFrequencies: Record<string, { count: number; volume: number }> = {}
	const conferenteStats: Record<string, { ugs: string[]; count: number }> = {}
	const racStatsMap: Record<string, { count: number; volume: number; ugs: Set<string> }> = {}
	const odsStatsMap: Record<string, { count: number; volume: number; ugs: Set<string> }> = {}
	const osStatsMap: Record<string, { count: number; volume: number; ugs: Set<string> }> = {}
	const ugInconsistencies: { ug: string; count: number; volume: number }[] = []

	RAC_QUESTIONS.forEach((q) => {
		racStatsMap[q.id] = { count: 0, volume: 0, ugs: new Set() }
	})

	if (result) {
		for (const [ug, contas] of Object.entries(result)) {
			let ugVolume = 0
			let ugCount = 0
			totalContas += Object.keys(contas).length
			const conferente = getConferente(ug)
			if (!conferenteStats[conferente]) conferenteStats[conferente] = { ugs: [], count: 0 }
			conferenteStats[conferente].ugs.push(ug)

			const ods = getOds(ug)
			const os = getOs(ug)
			if (!odsStatsMap[ods]) odsStatsMap[ods] = { count: 0, volume: 0, ugs: new Set() }
			if (!osStatsMap[os]) osStatsMap[os] = { count: 0, volume: 0, ugs: new Set() }
			odsStatsMap[ods].ugs.add(ug)
			osStatsMap[os].ugs.add(ug)

			for (const [conta, regs] of Object.entries(contas)) {
				let contaVol = 0
				const racInfo = getRacInfo(conta)
				for (const reg of regs) {
					totalSaldoGeral += reg.saldo
					ugVolume += reg.saldo
					contaVol += reg.saldo
					ugCount++
					totalInconsistencias++
					if (racStatsMap[racInfo.id]) {
						racStatsMap[racInfo.id].count++
						racStatsMap[racInfo.id].volume += reg.saldo
						racStatsMap[racInfo.id].ugs.add(ug)
					}
					odsStatsMap[ods].count++
					odsStatsMap[ods].volume += reg.saldo
					osStatsMap[os].count++
					osStatsMap[os].volume += reg.saldo
				}
				if (!contaFrequencies[conta]) contaFrequencies[conta] = { count: 0, volume: 0 }
				contaFrequencies[conta].count += regs.length
				contaFrequencies[conta].volume += contaVol
			}

			conferenteStats[conferente].count += ugCount
			ugVolumes.push({ ug, volume: ugVolume, count: ugCount })
			ugInconsistencies.push({ ug, count: ugCount, volume: ugVolume })
		}
	}

	const topContasByFreq = Object.entries(contaFrequencies)
		.map(([conta, d]) => ({ conta, ...d }))
		.sort((a, b) => b.count - a.count)
		.slice(0, 10)
	const topUgsByCount = [...ugInconsistencies].sort((a, b) => b.count - a.count).slice(0, 10)
	const topOdsByCount = Object.entries(odsStatsMap)
		.map(([ods, d]) => ({ ods, ...d }))
		.sort((a, b) => b.count - a.count)
	const topOsByCount = Object.entries(osStatsMap)
		.map(([os, d]) => ({ os, ...d }))
		.sort((a, b) => b.count - a.count)

	return {
		totalUGs,
		totalContas,
		totalSaldoGeral,
		totalInconsistencias,
		conferenteStats,
		racStatsMap,
		topContasByFreq,
		topUgsByCount,
		topOdsByCount,
		topOsByCount,
	}
}

export type DerivedStats = ReturnType<typeof computeDerivedStats>
