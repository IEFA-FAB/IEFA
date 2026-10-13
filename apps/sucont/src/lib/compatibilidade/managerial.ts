/**
 * @module lib/compatibilidade/managerial
 * Extraído de routes/analista-compatibilidade.tsx (port do analistacompatibilidade):
 * números do painel gerencial (RAC) a partir dos relatórios por UG.
 */

import { PAIR_COLORS, PAIRS, type UGReport } from "./parser"

export interface GroupStat {
	name: string
	count: number
	volume: number
	ugs: string[]
}

export type ManagerialData = NonNullable<ReturnType<typeof buildManagerialData>>

export function buildManagerialData(reports: UGReport[]) {
	if (reports.length === 0) return null

	let totalVolume = 0
	const pairStats = PAIRS.map((p) => ({
		name: `Par ${p.id}`,
		description: `${p.formattedA} × ${p.formattedB}`,
		count: 0,
		volume: 0,
		color: PAIR_COLORS[p.id - 1],
		// `fill` além de `color`: o recharts só lê `fill` da linha — para o setor, para a
		// legenda e para o marcador do tooltip. `color` segue servindo as listas em HTML.
		fill: PAIR_COLORS[p.id - 1],
	}))
	const conferenteStatsMap: Record<string, GroupStat> = {}
	const superiorStatsMap: Record<string, GroupStat> = {}
	const odsStatsMap: Record<string, GroupStat> = {}

	reports.forEach((r) => {
		totalVolume += r.totalDiff
		r.pairs.forEach((rp) => {
			const pairIndex = PAIRS.findIndex((p) => p.id === rp.id)
			if (pairIndex !== -1) {
				pairStats[pairIndex].count += 1
				pairStats[pairIndex].volume += rp.diff
			}
		})

		if (!conferenteStatsMap[r.conferente]) {
			conferenteStatsMap[r.conferente] = { name: r.conferente, count: 0, volume: 0, ugs: [] }
		}
		conferenteStatsMap[r.conferente].count += 1
		conferenteStatsMap[r.conferente].volume += r.totalDiff
		conferenteStatsMap[r.conferente].ugs.push(r.ug)

		if (!superiorStatsMap[r.superior]) {
			superiorStatsMap[r.superior] = { name: r.superior, count: 0, volume: 0, ugs: [] }
		}
		superiorStatsMap[r.superior].count += 1
		superiorStatsMap[r.superior].volume += r.totalDiff
		superiorStatsMap[r.superior].ugs.push(r.ug)

		if (!odsStatsMap[r.ods]) {
			odsStatsMap[r.ods] = { name: r.ods, count: 0, volume: 0, ugs: [] }
		}
		odsStatsMap[r.ods].count += 1
		odsStatsMap[r.ods].volume += r.totalDiff
		odsStatsMap[r.ods].ugs.push(r.ug)
	})

	const topUGs = [...reports]
		.sort((a, b) => b.totalDiff - a.totalDiff)
		.slice(0, 5)
		.map((r) => ({
			name: r.ug.includes(" - ") ? `${r.ug.split(" - ")[1]} (${r.ug.split(" - ")[0]})` : r.ug,
			volume: r.totalDiff,
			conferente: r.conferente,
		}))

	const conferenteStats = Object.values(conferenteStatsMap).sort((a, b) => b.count - a.count)
	const superiorStats = Object.values(superiorStatsMap).sort((a, b) => b.count - a.count)
	const odsStats = Object.values(odsStatsMap).sort((a, b) => b.count - a.count)

	return { totalVolume, pairStats, topUGs, conferenteStats, superiorStats, odsStats }
}
