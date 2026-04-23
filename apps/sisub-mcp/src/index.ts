/**
 * Entry point do sisub-mcp server.
 *
 * Correções de segurança aplicadas:
 *   C1 — Revalida o JWT em toda requisição HTTP, mesmo em sessões existentes.
 *         Verifica que o userId do JWT atual corresponde ao da sessão criada,
 *         impedindo session hijacking.
 *   M1 — Sessões HTTP têm TTL (2h de inatividade) e limite máximo (200 sessões).
 *         Cleanup automático a cada 10 minutos.
 *   M2 — Rate limiting por IP: 100 req/min. Resposta 429 quando excedido.
 *   M5 — Headers CORS definidos explicitamente; preflight OPTIONS tratado.
 *
 * Transporte "stdio": JWT via SISUB_USER_JWT env var (Claude Desktop local)
 * Transporte "http":  JWT via Authorization: Bearer <token> em cada request
 */

import { createServer } from "node:http"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { resolveCredential } from "./auth.ts"
import { createMcpServer } from "./server.ts"

const transportMode = process.env.MCP_TRANSPORT ?? "http"

// ────────────────────────────────────────────────────────────────────────────
// Modo stdio — Claude Desktop local
// ────────────────────────────────────────────────────────────────────────────

if (transportMode === "stdio") {
	const credential = process.env.SISUB_USER_JWT

	if (!credential) {
		process.stderr.write("[sisub-mcp] ERRO: SISUB_USER_JWT é obrigatório no modo stdio.\n")
		process.exit(1)
	}

	process.stderr.write("[sisub-mcp] Iniciando transporte stdio...\n")

	const mcpServer = createMcpServer(credential)
	const transport = new StdioServerTransport()

	transport.onerror = (err) => process.stderr.write(`[sisub-mcp] Erro stdio: ${err.message}\n`)

	await mcpServer.connect(transport)

	process.stderr.write("[sisub-mcp] Pronto — aguardando mensagens em stdin.\n")
} else {
	// ──────────────────────────────────────────────────────────────────────────
	// Modo HTTP — Claude.ai / Cursor
	// ──────────────────────────────────────────────────────────────────────────

	const port = parseInt(process.env.MCP_PORT ?? "3000", 10)

	// ── M5: Headers CORS ──────────────────────────────────────────────────────
	const CORS_HEADERS: Record<string, string> = {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-session-id",
		"Access-Control-Max-Age": "86400",
	}

	// ── M1: Session store com TTL e limite máximo ─────────────────────────────

	/** Duração máxima de inatividade por sessão: 2 horas. */
	const SESSION_TTL_MS = 2 * 60 * 60 * 1_000
	/** Número máximo de sessões simultâneas antes de rejeitar novas. */
	const MAX_SESSIONS = 200

	interface SessionEntry {
		transport: StreamableHTTPServerTransport
		/** userId do usuário que criou a sessão — usado para verificar C1. */
		userId: string
		createdAt: number
		lastSeenAt: number
	}

	const sessions = new Map<string, SessionEntry>()

	// M1: Limpeza periódica de sessões expiradas e entradas de rate limit antigas
	const cleanupInterval = setInterval(
		() => {
			const now = Date.now()
			for (const [id, entry] of sessions) {
				if (now - entry.lastSeenAt > SESSION_TTL_MS) {
					sessions.delete(id)
					process.stderr.write(`[sisub-mcp] Sessão expirada por inatividade: ${id}\n`)
				}
			}
			// Limpar entradas de rate limit expiradas para não crescer indefinidamente
			for (const [ip, entry] of rateLimits) {
				if (now > entry.resetAt) rateLimits.delete(ip)
			}
		},
		10 * 60 * 1_000 // a cada 10 minutos
	)
	// Não bloquear o process exit caso o servidor seja encerrado
	cleanupInterval.unref()

	// ── M2: Rate limiter por IP ───────────────────────────────────────────────

	/** Máximo de requests por janela. */
	const RATE_LIMIT_MAX = 100
	/** Janela de rate limit em ms. */
	const RATE_LIMIT_WINDOW_MS = 60_000

	interface RateLimitEntry {
		count: number
		/** Timestamp em que a janela atual expira e o contador reseta. */
		resetAt: number
	}

	const rateLimits = new Map<string, RateLimitEntry>()

	/** Extrai o IP real do cliente, respeitando proxy reverso (X-Forwarded-For). */
	function getClientIp(req: import("node:http").IncomingMessage): string {
		const forwarded = req.headers["x-forwarded-for"]
		if (typeof forwarded === "string") return forwarded.split(",")[0].trim()
		return req.socket.remoteAddress ?? "unknown"
	}

	/**
	 * Retorna true se o IP excedeu o limite de requests na janela atual.
	 * Incrementa o contador a cada chamada — deve ser chamado apenas uma vez por request.
	 */
	function isRateLimited(ip: string): boolean {
		const now = Date.now()
		const entry = rateLimits.get(ip)

		if (!entry || now > entry.resetAt) {
			rateLimits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
			return false
		}

		entry.count += 1
		return entry.count > RATE_LIMIT_MAX
	}

	// ── Helpers HTTP ──────────────────────────────────────────────────────────

	/** Lê o body de um IncomingMessage como string. */
	function readBody(req: import("node:http").IncomingMessage): Promise<string> {
		return new Promise((resolve, reject) => {
			const chunks: Buffer[] = []
			req.on("data", (chunk: Buffer) => chunks.push(chunk))
			req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")))
			req.on("error", reject)
		})
	}

	// ── HTTP Server ───────────────────────────────────────────────────────────

	const httpServer = createServer(async (req, res) => {
		const url = new URL(req.url ?? "/", `http://localhost:${port}`)
		const clientIp = getClientIp(req)

		// M5: CORS em todas as respostas
		for (const [k, v] of Object.entries(CORS_HEADERS)) {
			res.setHeader(k, v)
		}

		// M5: Preflight OPTIONS — responder imediatamente, sem auth
		if (req.method === "OPTIONS") {
			res.writeHead(204)
			res.end()
			return
		}

		// ── Health check (sem auth, sem rate limit) ───────────────────────────
		if (url.pathname === "/health") {
			res.writeHead(200, { "Content-Type": "application/json" })
			res.end(JSON.stringify({ status: "ok", service: "sisub-mcp", sessions: sessions.size }))
			return
		}

		// ── M2: Rate limiting (aplicado antes de qualquer processamento) ──────
		if (isRateLimited(clientIp)) {
			res.writeHead(429, { "Content-Type": "application/json", "Retry-After": "60" })
			res.end(JSON.stringify({ error: "Muitas requisições. Tente novamente em 60 segundos." }))
			return
		}

		// ── Rota MCP ──────────────────────────────────────────────────────────
		if (url.pathname !== "/mcp") {
			res.writeHead(404, { "Content-Type": "application/json" })
			res.end(JSON.stringify({ error: "Not found" }))
			return
		}

		// Auth: x-api-key (chave gerada no sisub) ou Authorization: Bearer <jwt>
		// x-api-key tem precedência — se presente, dispensa o JWT.
		const apiKey = typeof req.headers["x-api-key"] === "string" ? req.headers["x-api-key"].trim() : ""
		const authHeader = req.headers.authorization ?? ""
		const bearerJwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : ""
		const credential = apiKey || bearerJwt

		if (!credential) {
			res.writeHead(401, { "Content-Type": "application/json" })
			res.end(JSON.stringify({ error: "Autenticação necessária. Use x-api-key ou Authorization: Bearer <supabase-jwt>" }))
			return
		}

		// C1: Validar credencial em TODA requisição /mcp, independente de sessão existente.
		// Garante que chaves revogadas ou JWTs expirados são rejeitados mesmo com session-id válido.
		let currentUserId: string
		try {
			const ctx = await resolveCredential(credential)
			currentUserId = ctx.userId
		} catch {
			res.writeHead(401, { "Content-Type": "application/json" })
			res.end(JSON.stringify({ error: "Credencial inválida, expirada ou revogada" }))
			return
		}

		// ── Resolver sessão ───────────────────────────────────────────────────
		const sessionId = req.headers["mcp-session-id"] as string | undefined
		let transport: StreamableHTTPServerTransport

		if (sessionId && sessions.has(sessionId)) {
			// Map.get() após .has() garante existência — guard defensivo para satisfazer o tipo
			const entry = sessions.get(sessionId)
			if (!entry) {
				res.writeHead(500, { "Content-Type": "application/json" })
				res.end(JSON.stringify({ error: "Sessão inválida" }))
				return
			}

			// C1: Verificar que o JWT atual pertence ao MESMO usuário que criou a sessão.
			// Impede session hijacking: se userId diverge, a sessão é rejeitada.
			if (entry.userId !== currentUserId) {
				res.writeHead(403, { "Content-Type": "application/json" })
				res.end(JSON.stringify({ error: "Session ID não pertence a este usuário" }))
				return
			}

			// M1: Atualizar lastSeenAt para manter a sessão viva
			entry.lastSeenAt = Date.now()
			transport = entry.transport
		} else {
			// M1: Rejeitar nova sessão se o limite global foi atingido
			if (sessions.size >= MAX_SESSIONS) {
				res.writeHead(503, { "Content-Type": "application/json" })
				res.end(JSON.stringify({ error: "Servidor com capacidade máxima de sessões. Tente novamente em alguns minutos." }))
				return
			}

			// Nova sessão: criar transport e capturar o JWT atual
			// createMcpServer(credential) captura a credencial em closure para uso nas tool calls.
			transport = new StreamableHTTPServerTransport({
				sessionIdGenerator: () => crypto.randomUUID(),
				onsessioninitialized: (sid) => {
					// Armazenar sessão com userId para validação C1 nas próximas requests
					sessions.set(sid, {
						transport,
						userId: currentUserId,
						createdAt: Date.now(),
						lastSeenAt: Date.now(),
					})
					process.stderr.write(`[sisub-mcp] Nova sessão: ${sid} (user: ${currentUserId})\n`)
				},
			})

			transport.onclose = () => {
				if (transport.sessionId) {
					sessions.delete(transport.sessionId)
					process.stderr.write(`[sisub-mcp] Sessão encerrada: ${transport.sessionId}\n`)
				}
			}

			transport.onerror = (err) => process.stderr.write(`[sisub-mcp] Erro no transport: ${err.message}\n`)

			const mcpServer = createMcpServer(credential)
			await mcpServer.connect(transport)
		}

		// Ler body para requisições POST
		let parsedBody: unknown
		if (req.method === "POST") {
			const raw = await readBody(req)
			if (raw) {
				try {
					parsedBody = JSON.parse(raw)
				} catch {
					res.writeHead(400, { "Content-Type": "application/json" })
					res.end(JSON.stringify({ error: "JSON body inválido" }))
					return
				}
			}
		}

		// Delegar ao SDK MCP
		await transport.handleRequest(req, res, parsedBody)
	})

	httpServer.listen(port, () => {
		process.stderr.write(`[sisub-mcp] HTTP server rodando em http://localhost:${port}\n`)
		process.stderr.write(`[sisub-mcp] Health: http://localhost:${port}/health\n`)
		process.stderr.write(`[sisub-mcp] MCP endpoint: http://localhost:${port}/mcp\n`)
	})

	httpServer.on("error", (err) => {
		process.stderr.write(`[sisub-mcp] Erro no servidor HTTP: ${err.message}\n`)
		process.exit(1)
	})
}
