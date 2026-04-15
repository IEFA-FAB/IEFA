/**
 * @module evaluation.fn
 * Super-admin evaluation feature toggle and user opinion collection.
 * CLIENT: getSupabaseServerClient (service role) — all functions.
 * TABLES: super_admin_controller (key="evaluation"), opinions.
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import type { EvalConfig, EvaluationResult } from "@/types/domain/admin"

/**
 * Returns the current evaluation config (active flag + question text). Never throws on missing row — returns { active: false, value: "" }.
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchEvalConfigFn = createServerFn({ method: "GET" }).handler(async () => {
	const { data, error } = await getSupabaseServerClient().from("super_admin_controller").select("key, active, value").eq("key", "evaluation").maybeSingle()

	if (error) throw new Error(error.message)

	return {
		active: !!data?.active,
		value: typeof data?.value === "string" ? data.value : data?.value == null ? "" : String(data.value),
	} as EvalConfig
})

/**
 * Upserts the evaluation config (conflict on key="evaluation") and returns the saved state.
 *
 * @remarks
 * SIDE EFFECTS: writes to super_admin_controller with key "evaluation".
 *
 * @throws {Error} on Supabase upsert failure.
 */
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

/**
 * Determines whether a user should be shown the evaluation prompt: checks if active and user hasn't already answered the current question.
 *
 * @remarks
 * Two-step: (1) fetch config — returns { shouldAsk: false } early if inactive or question is blank;
 * (2) check opinions table for (user_id, question) pair.
 *
 * @throws {Error} on config or opinion query failure.
 */
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

/**
 * Records a user's evaluation answer for a specific question.
 *
 * @remarks
 * SIDE EFFECTS: inserts into opinions. No uniqueness enforcement — duplicate answers are silently allowed.
 *
 * @throws {Error} on Supabase insert failure.
 */
export const submitEvaluationFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ value: z.number(), question: z.string(), userId: z.string() }))
	.handler(async ({ data }) => {
		const { error } = await getSupabaseServerClient()
			.from("opinions")
			.insert([{ value: data.value, question: data.question, userId: data.userId }])

		if (error) throw new Error(error.message)
	})
