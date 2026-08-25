/**
 * @module image-placeholder.server
 * Geração do LQIP com `Bun.Image` — baixa o objeto do bucket privado e devolve o
 * data URL do thumbhash. Só roda no servidor (usa o global `Bun` e a service role).
 *
 * Por que Bun.Image e não uma lib: `placeholder()` é uma chamada, sem dependência
 * nativa para compilar na imagem Alpine e sem postinstall — o custo que o `sharp`
 * cobraria aqui (binário por plataforma, ~30 MB na imagem, gate de `trustedDependencies`
 * no Bun 1.4) para gerar um PNG de 32px.
 *
 * As regras de QUANDO gerar são puras e moram em `./image-placeholder` — este módulo
 * só executa.
 */

import { isPlaceholderDataUrl } from "@/lib/image-placeholder"
import { getRumaerServerClient } from "@/lib/supabase.server"

const BUCKET = "rumaer-uniforms"

/**
 * Placeholder de um objeto do bucket, ou `null` se não der para gerar.
 *
 * Falha aqui NUNCA derruba a operação que chamou: o upload já aconteceu e a linha já
 * é válida sem blur — quem não tem placeholder cai no estado de carregamento antigo.
 * Derrubar o save por causa da prévia trocaria uma degradação visual por perda de
 * trabalho do usuário.
 */
export async function buildImagePlaceholder(imagePath: string): Promise<string | null> {
	try {
		const { data, error } = await getRumaerServerClient().storage.from(BUCKET).download(imagePath)
		if (error || !data) {
			console.warn(`[rumaer] placeholder: download falhou para ${imagePath}: ${error?.message ?? "sem corpo"}`)
			return null
		}

		const placeholder = await new Bun.Image(await data.arrayBuffer()).placeholder()
		const chars = placeholder.length // antes do guard: ele estreita o ramo negativo para `never`

		// `placeholder()` promete PNG de ≤32px; conferimos porque o valor vai para o banco
		// e de lá para o `src` de toda listagem — um data URL gordo aqui é payload em massa.
		if (!isPlaceholderDataUrl(placeholder)) {
			console.warn(`[rumaer] placeholder: formato inesperado para ${imagePath} (${chars} chars)`)
			return null
		}
		return placeholder
	} catch (e) {
		// ERR_IMAGE_UNKNOWN_FORMAT (arquivo que não é imagem), ERR_IMAGE_FORMAT_UNSUPPORTED
		// (HEIC/AVIF — o backend `bun`, usado no Linux, não decodifica esses dois), rede.
		const code = e && typeof e === "object" && "code" in e ? String(e.code) : undefined
		console.warn(`[rumaer] placeholder: ${code ?? (e instanceof Error ? e.message : String(e))} para ${imagePath}`)
		return null
	}
}
