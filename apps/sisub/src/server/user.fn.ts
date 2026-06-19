/**
 * @module user.fn
 * User profile and military data sync in the sisub schema.
 * Thin wrappers over @iefa/sisub-domain (operations/user).
 * Unauthenticated by design — used during login / profile bootstrap.
 * @domain core
 * @migration done
 */

import {
	FetchMilitaryDataSchema,
	FetchUserDataSchema,
	FetchUserNrOrdemSchema,
	fetchMilitaryData,
	fetchSisubUserData,
	fetchUserNrOrdem,
	SyncUserEmailSchema,
	SyncUserNrOrdemSchema,
	syncUserEmail,
	syncUserNrOrdem,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

export const fetchUserDataFn = createServerFn({ method: "GET" })
	.inputValidator(FetchUserDataSchema)
	.handler(async ({ data }) => fetchSisubUserData(getDb(), data).catch(handleDomainError))

export const fetchMilitaryDataFn = createServerFn({ method: "GET" })
	.inputValidator(FetchMilitaryDataSchema)
	.handler(async ({ data }) => fetchMilitaryData(getDb(), data).catch(handleDomainError))

export const fetchUserNrOrdemFn = createServerFn({ method: "GET" })
	.inputValidator(FetchUserNrOrdemSchema)
	.handler(async ({ data }) => fetchUserNrOrdem(getDb(), data).catch(handleDomainError))

export const syncUserNrOrdemFn = createServerFn({ method: "POST" })
	.inputValidator(SyncUserNrOrdemSchema)
	.handler(async ({ data }) => syncUserNrOrdem(getDb(), data).catch(handleDomainError))

export const syncUserEmailFn = createServerFn({ method: "POST" })
	.inputValidator(SyncUserEmailSchema)
	.handler(async ({ data }) => syncUserEmail(getDb(), data).catch(handleDomainError))
