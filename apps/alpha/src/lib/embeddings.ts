/**
 * Embedder do α.
 *
 * Fábrica única porque a **identidade do modelo importa tanto quanto o vetor**:
 * comparar um embedding gerado por um modelo com outro gerado por outro produz
 * distâncias sem significado — a busca continua respondendo, só que errado. Por
 * isso todo chunk grava `embedding_model`, e a recuperação só considera chunks
 * do modelo corrente.
 *
 * Trocar `ALPHA_EMBEDDING_MODEL` exige, portanto, reingerir o corpus. É uma
 * troca declarada, não um efeito colateral silencioso.
 */

import { BedrockEmbeddings } from "@langchain/aws"
import type { Embeddings } from "@langchain/core/embeddings"
import { OpenAIEmbeddings } from "@langchain/openai"
import { env } from "../env.ts"

/** Dimensão fixada no schema (`alpha.document_chunk.embedding`). */
export const EMBEDDING_DIMENSIONS = 1024

let cached: Embeddings | null = null

/**
 * Modelo de embedding em uso, como gravado em `document_chunk.embedding_model`.
 *
 * O provedor entra no identificador porque nomes de modelo colidem entre
 * provedores e a origem muda o espaço vetorial.
 */
export function embeddingModelId(): string {
	return `${env.ALPHA_EMBEDDING_PROVIDER}:${env.ALPHA_EMBEDDING_MODEL}`
}

export function getEmbeddings(): Embeddings {
	if (cached) return cached

	if (env.ALPHA_EMBEDDING_PROVIDER === "bedrock") {
		// Titan Text Embeddings V2 aceita 1024/512/256; 1024 é o que o schema fixa.
		// Autenticação pela cadeia padrão da AWS — task role em produção, profile
		// local em desenvolvimento, sem API key.
		cached = new BedrockEmbeddings({
			model: env.ALPHA_EMBEDDING_MODEL,
			region: env.ALPHA_AI_REGION,
		})
		return cached
	}

	cached = new OpenAIEmbeddings({
		model: env.ALPHA_EMBEDDING_MODEL,
		configuration: { baseURL: env.NVIDIA_BASE_URL, apiKey: env.NVIDIA_API_KEY },
		dimensions: EMBEDDING_DIMENSIONS,
	})
	return cached
}

/**
 * Erro de embedding com o contexto necessário para agir.
 *
 * O SDK da AWS devolve stack longo e mensagem genérica (`UnrecognizedClientException`
 * quando não há credencial). Sem provedor, modelo e região na mensagem, quem
 * opera não sabe se falta credencial, se o modelo não existe na região ou se é
 * falta de permissão no Bedrock.
 */
export function embeddingError(cause: unknown): Error {
	const detalhe = cause instanceof Error ? cause.message : String(cause)
	const dica =
		env.ALPHA_EMBEDDING_PROVIDER === "bedrock"
			? "verifique credencial da AWS (task role em produção, profile local), se o modelo existe na região e se a policy concede bedrock:InvokeModel"
			: "verifique NVIDIA_API_KEY e o acesso da conta ao endpoint de embeddings"

	return new Error(`embedding falhou [${embeddingModelId()} @ ${env.ALPHA_AI_REGION}]: ${detalhe} — ${dica}`)
}
