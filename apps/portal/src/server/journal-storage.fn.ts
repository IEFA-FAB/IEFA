/**
 * @module journal-storage.fn
 * Server functions para geração de signed URLs de upload/download.
 * O upload de bytes é feito client-side via signed URL — nunca trafega pelo servidor.
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { envServer } from "@/lib/env.server"
import { createClient } from "@supabase/supabase-js"

function getStorageClient() {
	return createClient(envServer.VITE_IEFA_SUPABASE_URL, envServer.IEFA_SUPABASE_SECRET_KEY, {
		auth: { persistSession: false },
	})
}

export const getSignedUploadUrlFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ filePath: z.string().min(1) }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getStorageClient().storage.from("journal-submissions").createSignedUploadUrl(data.filePath)
		if (error) throw new Error(error.message)
		return result // { signedUrl, token, path }
	})

export const getSignedDownloadUrlFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ bucket: z.string(), path: z.string(), expiresIn: z.number().optional() }))
	.handler(async ({ data }) => {
		const { data: result, error } = await getStorageClient()
			.storage.from(data.bucket)
			.createSignedUrl(data.path, data.expiresIn ?? 3600)
		if (error) throw new Error(error.message)
		return result.signedUrl
	})
