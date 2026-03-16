import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import type { EvalConfig, EvaluationResult } from "@/types/domain/admin"

export const fetchEvalConfigFn = createServerFn({ method: "GET" }).handler(async () => {
	const { data, error } = await getSupabaseServerClient().from("super_admin_controller").select("key, active, value").eq("key", "evaluation").maybeSingle()

	if (error) throw new Error(error.message)

	return {
		active: !!data?.active,
		value: typeof data?.value === "string" ? data.value : data?.value == null ? "" : String(data.value),
	} as EvalConfig
})

export const upsertEvalConfigFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ active: z.boolean(), value: z.string() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getSupabaseServerClient()
			.from("super_admin_controller")
			.upsert({ key: "evaluation", active: data.active, value: data.value }, { onConflict: "key" })
			.select("key, active, value")
			.maybeSingle()

		if (error) throw new Error(error.message)

		return {
			active: !!result?.active,
			value: typeof result?.value === "string" ? result.value : result?.value == null ? "" : String(result.value),
		} as EvalConfig
	})

export const fetchEvaluationForUserFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ userId: z.string() }))
	.handler(async ({ data }): Promise<EvaluationResult> => {
		const { data: config, error: configError } = await getSupabaseServerClient()
			.from("super_admin_controller")
			.select("key, active, value")
			.eq("key", "evaluation")
			.maybeSingle()

		if (configError) throw new Error(configError.message)

		const isActive = !!config?.active
		const question = (config?.value ?? "") as string

		if (!isActive || !question) {
			return { shouldAsk: false, question: question || null }
		}

		const { data: opinion, error: opinionError } = await getSupabaseServerClient()
			.from("opinions")
			.select("id")
			.eq("question", question)
			.eq("userId", data.userId)
			.maybeSingle()

		if (opinionError) throw new Error(opinionError.message)

		return { shouldAsk: !opinion, question }
	})

export const submitEvaluationFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ value: z.number(), question: z.string(), userId: z.string() }))
	.handler(async ({ data }) => {
		const { error } = await getSupabaseServerClient()
			.from("opinions")
			.insert([{ value: data.value, question: data.question, userId: data.userId }])

		if (error) throw new Error(error.message)
	})
