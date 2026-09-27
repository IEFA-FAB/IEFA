/**
 * @module demand-forecast.fn
 * Previsão de demanda da cozinha: ciclo pending → sent da previsão que a cozinha envia à unidade
 * para o anexo quantitativo do TR. Casca fina sobre as operations de `@iefa/sisub-domain`
 * (`operations/demand-forecast`). Autenticação por `requireAuth()` em todo endpoint.
 * Status: "pending" (a cozinha edita) → "sent" (enviada, aguarda a unidade) → "reviewed".
 * @domain core
 * @migration done
 */

import {
	CreateDemandForecastSchema,
	createDemandForecast,
	DeleteDemandForecastSchema,
	deleteDemandForecast,
	FetchDemandForecastsSchema,
	FetchPendingDemandForecastSchema,
	fetchDemandForecasts,
	fetchPendingDemandForecast,
	recordDemandForecastImport,
	SendDemandForecastSchema,
	sendDemandForecast,
	UpdateDemandForecastSchema,
	updateDemandForecast,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"
import type { DemandForecast, DemandForecastWithSelections } from "@/types/domain/demand-forecast"

// ─── Listar previsões de demanda da cozinha ───────────────────────────────────

export const fetchDemandForecastsFn = createServerFn({ method: "GET" })
	.validator(FetchDemandForecastsSchema)
	.handler(async ({ data }): Promise<DemandForecastWithSelections[]> => {
		const ctx = await requireAuth()
		return (await fetchDemandForecasts(getDb(), ctx, data).catch(handleDomainError)) as unknown as DemandForecastWithSelections[]
	})

// ─── Buscar a previsão enviada pela cozinha ───────── ──────────────────────────

export const fetchPendingDemandForecastFn = createServerFn({ method: "GET" })
	.validator(FetchPendingDemandForecastSchema)
	.handler(async ({ data }): Promise<DemandForecastWithSelections | null> => {
		const ctx = await requireAuth()
		return (await fetchPendingDemandForecast(getDb(), ctx, data).catch(handleDomainError)) as unknown as DemandForecastWithSelections | null
	})

// ─── Criar previsão ───────────────────────────────────────────────────────────

export const createDemandForecastFn = createServerFn({ method: "POST" })
	.validator(CreateDemandForecastSchema)
	.handler(async ({ data }): Promise<DemandForecast> => {
		const ctx = await requireAuth()
		return (await createDemandForecast(getDb(), ctx, data).catch(handleDomainError)) as unknown as DemandForecast
	})

// ─── Atualizar previsão ───────────────────────────────────────────────────────

export const updateDemandForecastFn = createServerFn({ method: "POST" })
	.validator(UpdateDemandForecastSchema)
	.handler(async ({ data }): Promise<DemandForecast> => {
		const ctx = await requireAuth()
		return (await updateDemandForecast(getDb(), ctx, data).catch(handleDomainError)) as unknown as DemandForecast
	})

// ─── Enviar previsão para a gestão ───────────────────────────────────────────

export const sendDemandForecastFn = createServerFn({ method: "POST" })
	.validator(SendDemandForecastSchema)
	.handler(async ({ data }): Promise<void> => {
		const ctx = await requireAuth()
		await sendDemandForecast(getDb(), ctx, data).catch(handleDomainError)
	})

// ─── Remover previsão ─────────────────────────────────────────────────────────

export const deleteDemandForecastFn = createServerFn({ method: "POST" })
	.validator(DeleteDemandForecastSchema)
	.handler(async ({ data }): Promise<void> => {
		const ctx = await requireAuth()
		await deleteDemandForecast(getDb(), ctx, data).catch(handleDomainError)
	})

// ─── Registrar importação da previsão num anexo ──────────────────────────────

export const recordDemandForecastImportFn = createServerFn({ method: "POST" })
	.validator(z.object({ forecastId: z.uuid(), listId: z.uuid() }))
	.handler(async ({ data }): Promise<void> => {
		const ctx = await requireAuth()
		await recordDemandForecastImport(getDb(), ctx, data).catch(handleDomainError)
	})
