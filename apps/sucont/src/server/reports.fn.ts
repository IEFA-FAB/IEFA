/**
 * @module reports.fn
 * Relatórios salvos (links) da seção — persistidos no schema `sucont`.
 * Antes viviam só em localStorage. Leitura exige `sucont` nível 1; escrita, nível 2.
 */

import type { Report } from "@iefa/database/sucont"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireSucontAccess, requireSucontEditor } from "#/lib/auth.server"
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
			title: z.string().min(1),
			url: z.string().min(1),
			description: z.string().optional(),
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
	.validator(z.object({ id: z.string().uuid() }))
	.handler(async ({ data }): Promise<{ ok: true }> => {
		await requireSucontEditor()
		const { error } = await getSucontServerClient().from("report").delete().eq("id", data.id)
		if (error) throw new Error(error.message)
		return { ok: true }
	})
