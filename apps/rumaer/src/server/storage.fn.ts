/**
 * @module storage.fn
 * Signed URLs para imagens dos uniformes (bucket privado rumaer-uniforms).
 * Download: qualquer um (a app é read-only pública).
 * Upload: usado pelo admin — protegido pelo guard de rota /admin.
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getRumaerServerClient } from "@/lib/supabase.server"

const BUCKET = "rumaer-uniforms"

export const getSignedImageUrlFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ imagePath: z.string().min(1), expiresIn: z.number().optional() }))
	.handler(async ({ data }): Promise<string> => {
		const { data: result, error } = await getRumaerServerClient()
			.storage.from(BUCKET)
			.createSignedUrl(data.imagePath, data.expiresIn ?? 3600)
		if (error) throw new Error(error.message)
		return result.signedUrl
	})

export const getSignedUploadUrlFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ filePath: z.string().min(1) }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getRumaerServerClient().storage.from(BUCKET).createSignedUploadUrl(data.filePath)
		if (error) throw new Error(error.message)
		return result // { signedUrl, token, path }
	})
