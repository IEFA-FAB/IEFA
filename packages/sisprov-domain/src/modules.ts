/**
 * Módulos do PBAC do SISPROV: o mapa entre papel e módulo de autorização, os níveis que
 * cada um admite e os rótulos de tela. Fonte única para o app (navegação, tela de acessos,
 * guards de rota), para as server functions (gates) e para o domínio (guards das operations).
 *
 * São TRÊS módulos, e não níveis de um `sisprov` só, porque almoxarife e elo são papéis
 * diferentes na mesma OM com o mesmo nível 2, e um não implica o outro (mesmo recorte dos
 * módulos `alpha-*`). O escopo é a OM (`unit`), com cobertura pela hierarquia de apoio. O
 * militar que preenche a própria ficha ou confirma o próprio recebimento não tem módulo: é
 * sessão autenticada. Decisão: `openspec/changes/sisprov-foundation` (D3).
 *
 * Sem React nem Drizzle aqui de propósito: este arquivo vai para o bundle do cliente (hub,
 * sidebar, tela de acessos) e para os módulos de servidor.
 */

import type { AppModule } from "@iefa/pbac"
import { z } from "zod"

export const SISPROV_PLANNING_MODULE = "sisprov-planning" satisfies AppModule
export const SISPROV_SUPPLY_MODULE = "sisprov-supply" satisfies AppModule
export const SISPROV_ADMIN_MODULE = "sisprov-admin" satisfies AppModule

export type SisprovModule = typeof SISPROV_PLANNING_MODULE | typeof SISPROV_SUPPLY_MODULE | typeof SISPROV_ADMIN_MODULE

/** Os três módulos, na ordem em que o hub os apresenta. */
export const SISPROV_MODULES: readonly SisprovModule[] = [SISPROV_PLANNING_MODULE, SISPROV_SUPPLY_MODULE, SISPROV_ADMIN_MODULE]

/** Os módulos de OPERAÇÃO (quem trabalha numa OM). `sisprov-admin` fica de fora: é a SDAB. */
export const SISPROV_OPERATION_MODULES: readonly SisprovModule[] = [SISPROV_PLANNING_MODULE, SISPROV_SUPPLY_MODULE]

/** Nível que administra os grants do SISPROV. */
export const SISPROV_GRANT_ADMIN_LEVEL = 3

/** Prefixo das operações no log de auditoria: `sisprov.permission.grant|revoke`. */
export const SISPROV_AUDIT_APP = "sisprov"

/**
 * Níveis que cada módulo ADMITE. Fora disto o grant existe na tabela e nenhum guard o lê:
 * acesso que a tela mostra como concedido e que não abre porta nenhuma.
 */
export const SISPROV_MODULE_LEVELS: Record<SisprovModule, readonly number[]> = {
	[SISPROV_PLANNING_MODULE]: [1, 2],
	[SISPROV_SUPPLY_MODULE]: [1, 2],
	[SISPROV_ADMIN_MODULE]: [2, 3],
}

export const SISPROV_MODULE_LABELS: Record<SisprovModule, string> = {
	[SISPROV_PLANNING_MODULE]: "Planejamento",
	[SISPROV_SUPPLY_MODULE]: "Almoxarifado",
	[SISPROV_ADMIN_MODULE]: "Administração",
}

/** Rótulo do nível, por módulo: o 2 é "Operação" para quem trabalha na OM e "Gestão" para a SDAB. */
export function sisprovLevelLabel(module: SisprovModule, level: number): string {
	if (level === 1) return "Consulta"
	if (level === 2) return module === SISPROV_ADMIN_MODULE ? "Gestão" : "Operação"
	if (level >= SISPROV_GRANT_ADMIN_LEVEL) return "Administrador"
	return `Nível ${level}`
}

export function isSisprovModule(value: unknown): value is SisprovModule {
	return typeof value === "string" && (SISPROV_MODULES as readonly string[]).includes(value)
}

/**
 * Par (módulo, nível) que o cliente pode pedir à tela de acessos. Validado JUNTO, e não em
 * dois campos independentes: `sisprov-admin` nível 1 ou `sisprov-supply` nível 3 gravariam
 * grant que nenhum guard lê. O `enum` do módulo é a trava que impede esta tela de conceder
 * `global`, `kitchen` ou qualquer outro módulo do ERP na tabela compartilhada.
 */
export const SisprovGrantTargetSchema = z.discriminatedUnion("module", [
	z.object({ module: z.enum([SISPROV_PLANNING_MODULE, SISPROV_SUPPLY_MODULE]), level: z.union([z.literal(1), z.literal(2)]) }),
	z.object({ module: z.literal(SISPROV_ADMIN_MODULE), level: z.union([z.literal(2), z.literal(3)]) }),
])

export type SisprovGrantTarget = z.infer<typeof SisprovGrantTargetSchema>
