/**
 * @module writer-profile.fn
 * Perfil do redator no schema `documents`.
 *
 * O dono vem da sessão e é a chave primária da tabela — não existe id de perfil no
 * payload para alguém trocar. É a forma mais simples de tornar o IDOR impossível em vez
 * de improvável.
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireUserId } from "@/lib/auth.server"
import { type WriterProfile, WriterProfileSchema } from "@/lib/comaer/writer-profile"
import { getDocumentsServerClient } from "@/lib/supabase.server"

const COLUMNS = "om_name, om_acronym, om_sector, om_address, om_phone, om_email, signer_name, signer_rank, signer_quadro, signer_position, city, nup_prefix"

export const loadWriterProfileFn = createServerFn({ method: "GET" }).handler(async (): Promise<WriterProfile | null> => {
	const userId = await requireUserId()
	const { data, error } = await getDocumentsServerClient().from("writer_profile").select(COLUMNS).eq("owner_id", userId).maybeSingle()
	if (error) throw new Error(error.message)
	if (!data) return null
	// Perfil gravado por uma versão anterior do formato não pode derrubar a tela: sem
	// validação, um campo a mais ou a menos vira erro de runtime na primeira leitura.
	const parsed = WriterProfileSchema.safeParse(data)
	return parsed.success ? parsed.data : null
})

export const saveWriterProfileFn = createServerFn({ method: "POST" })
	.validator(z.object({ profile: WriterProfileSchema }))
	.handler(async ({ data }) => {
		const userId = await requireUserId()
		const { error } = await getDocumentsServerClient()
			.from("writer_profile")
			.upsert({ ...data.profile, owner_id: userId }, { onConflict: "owner_id" })
		if (error) throw new Error(error.message)
		return { ok: true }
	})
