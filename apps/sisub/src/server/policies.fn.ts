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
	FetchPolicySchema,
	FetchUserPermissionsSchema,
	fetchPolicy,
	ListPoliciesSchema,
	ListUserPoliciesSchema,
	listEffectiveUserPermissionsWithOrigin,
	listPolicies,
	listUserPolicies,
	RemovePolicyStatementSchema,
	removePolicyStatement,
	UpdatePolicySchema,
	UpdatePolicyStatementSchema,
	updatePolicy,
	updatePolicyStatement,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

export const fetchPoliciesFn = createServerFn({ method: "GET" })
	.validator(ListPoliciesSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listPolicies(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchPolicyFn = createServerFn({ method: "GET" })
	.validator(FetchPolicySchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchPolicy(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchUserPoliciesFn = createServerFn({ method: "GET" })
	.validator(ListUserPoliciesSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listUserPolicies(getDb(), ctx, data).catch(handleDomainError)
	})

/** Permissões efetivas COM a origem de cada uma — a resposta canônica do console. */
export const fetchEffectivePermissionsFn = createServerFn({ method: "GET" })
	.validator(FetchUserPermissionsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listEffectiveUserPermissionsWithOrigin(getDb(), ctx, data).catch(handleDomainError)
	})

export const createPolicyFn = createServerFn({ method: "POST" })
	.validator(CreatePolicySchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return createPolicy(getDb(), ctx, data).catch(handleDomainError)
	})

export const updatePolicyFn = createServerFn({ method: "POST" })
	.validator(UpdatePolicySchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updatePolicy(getDb(), ctx, data).catch(handleDomainError)
	})

export const deletePolicyFn = createServerFn({ method: "POST" })
	.validator(DeletePolicySchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return deletePolicy(getDb(), ctx, data).catch(handleDomainError)
	})

export const addPolicyStatementFn = createServerFn({ method: "POST" })
	.validator(AddPolicyStatementSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return addPolicyStatement(getDb(), ctx, data).catch(handleDomainError)
	})

export const updatePolicyStatementFn = createServerFn({ method: "POST" })
	.validator(UpdatePolicyStatementSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updatePolicyStatement(getDb(), ctx, data).catch(handleDomainError)
	})

export const removePolicyStatementFn = createServerFn({ method: "POST" })
	.validator(RemovePolicyStatementSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return removePolicyStatement(getDb(), ctx, data).catch(handleDomainError)
	})

export const attachPolicyFn = createServerFn({ method: "POST" })
	.validator(AttachPolicySchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return attachPolicy(getDb(), ctx, data).catch(handleDomainError)
	})

export const detachPolicyFn = createServerFn({ method: "POST" })
	.validator(DetachPolicySchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return detachPolicy(getDb(), ctx, data).catch(handleDomainError)
	})
