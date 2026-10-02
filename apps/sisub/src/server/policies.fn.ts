/**
 * @module policies.fn
 * Políticas nomeadas de acesso (modelo IAM) — wrappers finos sobre @iefa/sisub-domain.
 * Toda operação exige `global` nível 2; o gate vive na operação de domínio.
 * @domain core
 * @migration done
 */

import {
	AddPolicyStatementSchema,
	AttachPolicySchema,
	addPolicyStatement,
	attachPolicy,
	CreatePolicySchema,
	createPolicy,
	DeletePolicySchema,
	DetachPolicySchema,
	deletePolicy,
	detachPolicy,
	FetchManagedPolicySchema,
	FetchPolicySchema,
	FetchUserPermissionsSchema,
	fetchManagedPolicyByName,
	fetchPolicy,
	ListPoliciesSchema,
	ListPolicyMembersSchema,
	ListUserPoliciesSchema,
	listEffectiveUserPermissionsWithOrigin,
	listPolicies,
	listPolicyMembers,
	listUserPolicies,
	RemovePolicyStatementSchema,
	removePolicyStatement,
	UpdatePolicySchema,
	UpdatePolicyStatementSchema,
	updatePolicy,
	updatePolicyStatement,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { withAtomicAudit } from "@/lib/audit.server"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"
import { requireAuthThenRun } from "@/lib/domain-handler.server"
import { tryRevokeRecoveryCodesIfProtected } from "@/lib/mfa-recovery.server"

export const fetchPoliciesFn = createServerFn({ method: "GET" }).validator(ListPoliciesSchema).handler(requireAuthThenRun(listPolicies))

export const fetchPolicyFn = createServerFn({ method: "GET" }).validator(FetchPolicySchema).handler(requireAuthThenRun(fetchPolicy))

/** Turma de uma política: quem a tem anexada. Visão reversa de `fetchUserPoliciesFn`. */
export const fetchPolicyMembersFn = createServerFn({ method: "GET" }).validator(ListPolicyMembersSchema).handler(requireAuthThenRun(listPolicyMembers))

/** Política gerenciada pelo nome — o id vem de migration e varia por ambiente. */
export const fetchManagedPolicyFn = createServerFn({ method: "GET" }).validator(FetchManagedPolicySchema).handler(requireAuthThenRun(fetchManagedPolicyByName))

export const fetchUserPoliciesFn = createServerFn({ method: "GET" }).validator(ListUserPoliciesSchema).handler(requireAuthThenRun(listUserPolicies))

/** Permissões efetivas COM a origem de cada uma — a resposta canônica do console. */
export const fetchEffectivePermissionsFn = createServerFn({ method: "GET" })
	.validator(FetchUserPermissionsSchema)
	.handler(requireAuthThenRun(listEffectiveUserPermissionsWithOrigin))

/*
 * Toda escrita de política, statement e anexo grava a mudança e a linha de auditoria na MESMA
 * transação, pela função SQL que a operação de domínio chama (`withAtomicAudit`, migration
 * 20260921130000). O log registra antes → depois e, quando a mudança alcança todos os
 * anexados (statement, remoção, restauração), QUEM são eles.
 */

export const createPolicyFn = createServerFn({ method: "POST" })
	.validator(CreatePolicySchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return withAtomicAudit("createPolicyFn", ({ assurance, audit }) => createPolicy(getDb(), ctx, data, assurance, audit)).catch(handleDomainError)
	})

export const updatePolicyFn = createServerFn({ method: "POST" })
	.validator(UpdatePolicySchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return withAtomicAudit("updatePolicyFn", ({ assurance, audit }) => updatePolicy(getDb(), ctx, data, assurance, audit)).catch(handleDomainError)
	})

export const deletePolicyFn = createServerFn({ method: "POST" })
	.validator(DeletePolicySchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return withAtomicAudit("deletePolicyFn", ({ assurance, audit }) => deletePolicy(getDb(), ctx, data, assurance, audit)).catch(handleDomainError)
	})

export const addPolicyStatementFn = createServerFn({ method: "POST" })
	.validator(AddPolicyStatementSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return withAtomicAudit("addPolicyStatementFn", ({ assurance, audit }) => addPolicyStatement(getDb(), ctx, data, assurance, audit)).catch(handleDomainError)
	})

export const updatePolicyStatementFn = createServerFn({ method: "POST" })
	.validator(UpdatePolicyStatementSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return withAtomicAudit("updatePolicyStatementFn", ({ assurance, audit }) => updatePolicyStatement(getDb(), ctx, data, assurance, audit)).catch(
			handleDomainError
		)
	})

export const removePolicyStatementFn = createServerFn({ method: "POST" })
	.validator(RemovePolicyStatementSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return withAtomicAudit("removePolicyStatementFn", ({ assurance, audit }) => removePolicyStatement(getDb(), ctx, data, assurance, audit)).catch(
			handleDomainError
		)
	})

export const attachPolicyFn = createServerFn({ method: "POST" })
	.validator(AttachPolicySchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return withAtomicAudit("attachPolicyFn", async ({ assurance, audit }) => {
			const attached = await attachPolicy(getDb(), ctx, data, assurance, audit)
			// Política anexada é grant como outro qualquer: ela pode ter acabado de tornar a
			// conta PROTEGIDA, e conta protegida não dispõe de código de recuperação (D9).
			await tryRevokeRecoveryCodesIfProtected(data.userId)
			return attached
		}).catch(handleDomainError)
	})

export const detachPolicyFn = createServerFn({ method: "POST" })
	.validator(DetachPolicySchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return withAtomicAudit("detachPolicyFn", ({ assurance, audit }) => detachPolicy(getDb(), ctx, data, assurance, audit)).catch(handleDomainError)
	})
