import type { AlphaRole, UnitSet } from "@iefa/alpha-client/access"
import {
	type AppModule,
	coversUnit,
	isEmptyCoverage,
	needsSupportGraph,
	resolveModuleUnitCoverage,
	type UnitSupportEdge,
	type UserPermission,
	unionCoverage,
} from "@iefa/pbac"

export type { AlphaRole, UnitSet }
export { coversUnit, isEmptyCoverage }

/**
 * Perfil do usuário no Projeto α, derivado do PBAC (`@iefa/pbac`) — a mesma engine e a
 * mesma tabela `access_control.user_permissions` do sisub, rumaer e sucont.
 *
 * ## Um módulo por papel, escopado por OM
 *
 *   alpha-requester    (level 1) — vê todas as submissões das OMs que cobre
 *   alpha-procurement  (level 1) — fila e processos das OMs que cobre
 *   alpha-aci          (level 1) — triagem e parecer nos processos das OMs que cobre; com
 *                                  grant GLOBAL, também a curadoria de regras e fontes
 *   alpha-admin        (level 3) — concede e revoga os quatro (quem administra é o contrate)
 *
 * Grant com `unit_id` nulo é global. O escopo desce pela HIERARQUIA DE APOIO
 * (`core.units.supporting_unit_id`): grant no GAP-SJ cobre IAE, DCTA e IEFA; o inverso não.
 * A expansão é resolvida UMA vez por request (`authMiddleware`) e a cobertura de cada papel
 * chega às rotas já pronta, como `UnitSet`.
 *
 * Antes daqui, os papéis eram níveis aninhados de um módulo `alpha` único e sem escopo —
 * licitações e ACI enxergavam a FAB inteira. Esse módulo saiu do `AppModule` e as linhas
 * dele foram apagadas (20260921090000); uma linha que tenha sobrado não é lida aqui.
 *
 * ## Papéis se acumulam — sem segregação de funções
 *
 * A mesma pessoa pode ter os quatro papéis ao mesmo tempo, inclusive na mesma OM: cada papel
 * é resolvido sozinho, e as decisões usam a UNIÃO deles. Não há exclusão mútua entre
 * requisitante, licitações, ACI e administração, nem entre ser autor e ser ACI do processo.
 * Decisão do mantenedor (2026-09-19), por versatilidade das OMs pequenas e para teste; os
 * testes de `alpha-access.test.ts` ("acúmulo de papéis") fixam isso — mudar exige decisão
 * nova, não correção de bug.
 *
 * ## Enviar documento não exige papel
 *
 * Qualquer autenticado envia, atribuindo o documento a uma OM, e sempre enxerga o que enviou.
 * O único bloqueio é o deny SEM escopo em `alpha-requester`: ele fecha o envio. Não há mais
 * "deny que fecha a API inteira" — o chat e a leitura do próprio documento ficam de pé, como
 * para quem nunca teve grant. Deny ESCOPADO só recorta cobertura (inclusive de um allow
 * global): ele não impede enviar para aquela OM, porque enviar não depende de papel.
 */

export const ROLE_MODULE = {
	requester: "alpha-requester",
	procurement: "alpha-procurement",
	aci: "alpha-aci",
	admin: "alpha-admin",
} as const satisfies Record<AlphaRole, AppModule>

/** Nível mínimo que conta para o papel: os de fluxo usam 1; a administração segue em 3. */
const ROLE_MIN_LEVEL: Record<AlphaRole, number> = { requester: 1, procurement: 1, aci: 1, admin: 3 }

export const ALPHA_ROLE_MODULES: readonly AppModule[] = Object.values(ROLE_MODULE)

export type AlphaAccess = {
	roles: Record<AlphaRole, UnitSet>
	/** `false` só com deny sem escopo em `alpha-requester`. */
	canSubmit: boolean
}

/** `true` quando a resolução precisa do grafo de apoio — só com grant/deny escopado. */
export function needsUnitGraph(permissions: readonly UserPermission[]): boolean {
	return needsSupportGraph(permissions, ALPHA_ROLE_MODULES)
}

/**
 * Resolve os quatro papéis. `graph` é o grafo de apoio de `core.units`; pode ser `null` quando
 * {@link needsUnitGraph} é `false` (ninguém paga a leitura por um grant só global).
 */
export function resolveAlphaAccess(permissions: UserPermission[], graph: readonly UnitSupportEdge[] | null): AlphaAccess {
	const roles = {} as Record<AlphaRole, UnitSet>
	for (const role of Object.keys(ROLE_MODULE) as AlphaRole[]) {
		const coverage = resolveModuleUnitCoverage(permissions, ROLE_MODULE[role], graph, ROLE_MIN_LEVEL[role])
		roles[role] = coverage === "all" ? "all" : [...coverage]
	}

	const submitDenied = permissions.some(
		(p) => p.module === ROLE_MODULE.requester && p.level <= 0 && p.unit_id === null && p.kitchen_id === null && p.mess_hall_id === null
	)

	return { roles, canSubmit: !submitDenied }
}

/** União da cobertura dos papéis pedidos. */
export function unitsFor(access: AlphaAccess, ...roles: AlphaRole[]): UnitSet {
	const union = unionCoverage(...roles.map((role) => access.roles[role]))
	return union === "all" ? "all" : [...union]
}

/** O usuário tem o papel em alguma OM — ou, com `global`, sem recorte nenhum. */
export function hasRole(access: AlphaAccess, role: AlphaRole, options: { global?: true } = {}): boolean {
	const coverage = access.roles[role]
	return options.global ? coverage === "all" : !isEmptyCoverage(coverage)
}

/**
 * O que decide o acesso a uma submissão: quem enviou e a OM a que foi atribuída. A OM é
 * obrigatória no banco (`alpha.submission.unit_id` NOT NULL desde 20260921090000).
 */
export type SubmissionOwnership = { user_id: string; unit_id: number }

/** Papéis que leem as submissões da OM: requisitante, licitações e ACI. */
export const READER_ROLES: readonly AlphaRole[] = ["requester", "procurement", "aci"]

/**
 * O usuário pode ler esta submissão (e tudo o que pende dela: extração, texto, execução,
 * parecer, relatório)?
 *
 * Allow-list: o autor, ou um papel de leitura que cubra a OM da submissão.
 */
export function decideSubmissionRead(access: AlphaAccess, userId: string, submission: SubmissionOwnership): boolean {
	if (submission.user_id === userId) return true
	return coversUnit(unitsFor(access, ...READER_ROLES), submission.unit_id)
}

/**
 * O usuário pode triar achado e emitir parecer nesta submissão? Só o ACI que cobre a OM
 * dela — ser o autor, sozinho, NÃO basta, e ser ACI de outra OM também não.
 *
 * Ser o autor também NÃO impede: o ACI da OM que enviou o próprio documento tria e emite
 * parecer sobre ele. A segregação de funções (quem elabora não confere) NÃO é aplicada, por
 * decisão do mantenedor em 2026-09-19 — ver "Papéis se acumulam" no topo do arquivo. Por
 * isso a função nem recebe quem pede: o autor não entra na conta.
 */
export function decideSubmissionReview(access: AlphaAccess, submission: SubmissionOwnership): boolean {
	return coversUnit(access.roles.aci, submission.unit_id)
}
