/**
 * O rótulo do eixo e o tile do treemap do `ComparisonChart` moram no escopo do módulo.
 * Definidos dentro do componente, cada render criava um tipo novo e o React remontava
 * todos os rótulos e tiles. Aqui eles são importáveis e recebem tudo por props.
 */
import { describe, expect, it } from "bun:test"
import type { ReactElement } from "react"
import { RiskLevel } from "../types"
import { CustomizedAxisTick, CustomizedTreemapContent } from "./Charts"

type Props = { children?: unknown; style?: Record<string, unknown> }

/** Texto do `<text>` do rótulo do eixo. */
function tickText(element: ReactElement): string {
	const text = (element.props as Props).children as ReactElement
	const children = (text.props as Props).children as unknown[]
	return children.join("")
}

describe("CustomizedAxisTick", () => {
	const data = [
		{ name: "BASP", riskLevel: RiskLevel.CRITICO },
		{ name: "GAP-RJ", riskLevel: RiskLevel.MEDIO },
	]

	it("põe o semáforo de risco no nível UG, a partir dos dados recebidos por props", () => {
		expect(tickText(CustomizedAxisTick({ x: 0, y: 0, payload: { value: "BASP" }, data, hierarchyLevel: "UG" }))).toBe("BASP 🔴")
		expect(tickText(CustomizedAxisTick({ x: 0, y: 0, payload: { value: "GAP-RJ" }, data, hierarchyLevel: "UG" }))).toBe("GAP-RJ 🟡")
		expect(tickText(CustomizedAxisTick({ x: 0, y: 0, payload: { value: "OUTRA" }, data, hierarchyLevel: "UG" }))).toBe("OUTRA 🟢")
	})

	it("fora do nível UG não há semáforo", () => {
		expect(tickText(CustomizedAxisTick({ x: 0, y: 0, payload: { value: "SEFA" }, data, hierarchyLevel: "ODS" }))).toBe("SEFA ")
	})
})

describe("CustomizedTreemapContent", () => {
	it("pinta o tile pela cor do ODS recebido por props", () => {
		const tile = CustomizedTreemapContent({ x: 0, y: 0, width: 100, height: 50, name: "BASP", diff: 10, ods: "COMPREP" })
		const [rect] = (tile.props as Props).children as ReactElement[]
		const other = CustomizedTreemapContent({ x: 0, y: 0, width: 100, height: 50, name: "X", diff: 10, ods: "SEFA" })
		const [otherRect] = (other.props as Props).children as ReactElement[]
		expect((rect.props as Props).style?.fill).toBe("#134e4a")
		expect((otherRect.props as Props).style?.fill).toBe("#172554")
	})
})
