import { hasPermission } from "@iefa/pbac"
import type { AppModule, PermissionScope, UserContext } from "../types/context.ts"
import { PermissionDeniedError } from "../types/errors.ts"

export function requirePermission(ctx: UserContext, module: AppModule, minLevel: 1 | 2 | 3, scope?: PermissionScope): void {
	if (!hasPermission(ctx.permissions, module, minLevel, scope)) {
		throw new PermissionDeniedError(module, minLevel, scope)
	}
}

/**
 * Passa se o usuário tiver QUALQUER um dos módulos informados no nível mínimo.
 * Para recursos compartilhados que mais de um módulo legitimamente acessa — ex.:
 * o catálogo de insumos, gerido por `global` (SDAB) mas lido/editado por `kitchen`
 * (montagem de receitas). Sem isso, a rota `/global/ingredients` (gate `global`)
 * e as operações do domínio (gate `kitchen`) divergem.
 */
export function requireAnyPermission(ctx: UserContext, modules: readonly AppModule[], minLevel: 1 | 2, scope?: PermissionScope): void {
	if (!modules.some((m) => hasPermission(ctx.permissions, m, minLevel, scope))) {
		throw new PermissionDeniedError(modules.join(" | "), minLevel, scope)
	}
}

export function requireKitchen(ctx: UserContext, level: 1 | 2, kitchenId: number): void {
	requirePermission(ctx, "kitchen", level, { type: "kitchen", id: kitchenId })
}

/**
 * Escrita "de praça" no parque de uma cozinha: `kitchen:2` (gestão) OU `kitchen-production:1`
 * (quem opera).
 *
 * Existe para UM conjunto de escritas — cadastrar a unidade que existe no salão, relatar pane,
 * registrar execução de rotina. Exigir a gestão para essas três garante parque desatualizado:
 * quem sabe o que está instalado e o que quebrou é quem trabalha lá, e o cadastro que depende
 * de um terceiro não acontece. É o mesmo raciocínio que motivou `equipment_model.is_generic` —
 * baixar a barreira de cadastro é o que faz o dado existir.
 *
 * NÃO cobre nada destrutivo nem nada que reescreva a versão oficial: editar unidade, mudar
 * `status`, dar baixa, excluir, descartar pane e mexer no catálogo seguem exigindo `kitchen:2`
 * ou a permissão de catálogo. A prova dessa metade negativa mora em `equipment.authz.test.ts`.
 */
export function requireKitchenFloorWrite(ctx: UserContext, kitchenId: number): void {
	const scope = { type: "kitchen", id: kitchenId } as const
	if (hasPermission(ctx.permissions, "kitchen", 2, scope)) return
	if (hasPermission(ctx.permissions, "kitchen-production", 1, scope)) return
	throw new PermissionDeniedError("kitchen:2 | kitchen-production:1", 2, scope)
}

/** Gate do módulo kitchen-production (Produção Cozinha), escopado por cozinha. */
export function requireKitchenProduction(ctx: UserContext, level: 1 | 2, kitchenId: number): void {
	requirePermission(ctx, "kitchen-production", level, { type: "kitchen", id: kitchenId })
}

export function requireUnit(ctx: UserContext, level: 1 | 2, unitId: number): void {
	requirePermission(ctx, "unit", level, { type: "unit", id: unitId })
}

export function requireMessHall(ctx: UserContext, level: 1 | 2, messHallId: number): void {
	requirePermission(ctx, "messhall", level, { type: "mess_hall", id: messHallId })
}
