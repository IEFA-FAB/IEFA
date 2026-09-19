/**
 * @module reports.fn
 * Relatórios salvos (links) da seção — persistidos no schema `sucont`.
 * Antes viviam só em localStorage. São da SEÇÃO, não de uma divisão: leitura exige
 * nível 1 em QUALQUER divisão; escrita, nível 2 em qualquer uma.
 */

import type { Report } from "@iefa/database/sucont"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireSucontAccess, requireSucontEditor } from "#/lib/auth.server"
import { isHttpUrl } from "#/lib/safe-url"
import { getSucontServerClient } from "#/lib/supabase.server"

export const listReportsFn = createServerFn({ method: "GET" }).handler(async (): Promise<Report[]> => {
	await requireSucontAccess()
	const { data, error } = await getSucontServerClient().from("report").select("*").order("created_at", { ascending: true })
	if (error) throw new Error(error.message)
	return data ?? []
})

export const createReportFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			title: z.string().trim().min(1).max(200),
			// Só http(s): o link vira `href` para a seção inteira, e `javascript:` salvo
			// por um editor executaria no clique de qualquer colega.
			url: z.string().trim().min(1).max(2048).refine(isHttpUrl, "Informe um endereço http:// ou https://."),
			description: z.string().max(2000).optional(),
		})
	)
	.handler(async ({ data }): Promise<Report> => {
		const ctx = await requireSucontEditor()
		const { data: row, error } = await getSucontServerClient()
			.from("report")
			.insert({
				title: data.title,
				url: data.url,
				description: data.description ?? "",
				icon: "FileBarChart",
				category: "Relatórios",
				created_by: ctx.userId,
			})
			.select("*")
			.single()
		if (error) throw new Error(error.message)
		return row
	})

export const deleteReportFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.uuid() }))
	.handler(async ({ data }): Promise<{ ok: true }> => {
		await requireSucontEditor()
		const { error } = await getSucontServerClient().from("report").delete().eq("id", data.id)
		if (error) throw new Error(error.message)
		return { ok: true }
	})
