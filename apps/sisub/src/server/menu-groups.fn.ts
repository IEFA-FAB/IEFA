/**
 * @module menu-groups.fn
 * Conjuntos de grupos do cardápio ("templates de grupos") — wrappers finos sobre
 * @iefa/sisub-domain (operations/menu-groups).
 * @domain core
 * @migration done
 */

import {
	CreateMenuGroupSetSchema,
	createMenuGroupSet,
	DeleteMenuGroupSetSchema,
	deleteMenuGroupSet,
	FetchMenuGroupSetsSchema,
	fetchMenuGroupSets,
	UpdateMenuGroupSetSchema,
	updateMenuGroupSet,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

export const fetchMenuGroupSetsFn = createServerFn({ method: "GET" })
	.validator(FetchMenuGroupSetsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchMenuGroupSets(getDb(), ctx, data).catch(handleDomainError)
	})

export const createMenuGroupSetFn = createServerFn({ method: "POST" })
	.validator(CreateMenuGroupSetSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return createMenuGroupSet(getDb(), ctx, data).catch(handleDomainError)
	})

export const updateMenuGroupSetFn = createServerFn({ method: "POST" })
	.validator(UpdateMenuGroupSetSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updateMenuGroupSet(getDb(), ctx, data).catch(handleDomainError)
	})

export const deleteMenuGroupSetFn = createServerFn({ method: "POST" })
	.validator(DeleteMenuGroupSetSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return deleteMenuGroupSet(getDb(), ctx, data).catch(handleDomainError)
	})
