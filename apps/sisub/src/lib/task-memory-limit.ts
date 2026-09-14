/**
 * Limite de memória que o `/health` usa para reprovar o processo antes do OOM do container.
 *
 * Era `900 MB` fixo — 90% da task de 1 GB. Um número escrito à mão amarra o health check ao
 * tamanho da task: subir a memória (a task morreu por OutOfMemory em 2026-09-13) sem mexer
 * aqui faria o ALB tirar a task da rotação nos mesmos 900 MB, e os GB a mais nunca seriam
 * usados. O limite real vem do endpoint de metadados da task no ECS (`Limits.Memory`, em MiB),
 * que o Fargate expõe em `ECS_CONTAINER_METADATA_URI_V4`.
 *
 * Módulo puro de propósito (sem `fetch` embutido): o `/health` injeta a leitura, o teste não
 * precisa de rede.
 */

const MIB = 1024 * 1024

/** Fração do limite em que o processo passa a responder unhealthy. */
export const MEMORY_THRESHOLD_RATIO = 0.9

/** Limite assumido fora do ECS (dev) ou quando o metadado não responde: a task antiga de 1 GB. */
export const FALLBACK_LIMIT_MIB = 1000

/**
 * Lê `Limits.Memory` (MiB) do JSON de `/task`. Devolve `null` para qualquer forma inesperada —
 * o chamador cai no fallback, nunca num limite inventado.
 */
export function parseTaskMemoryLimitMiB(taskMetadata: unknown): number | null {
	if (typeof taskMetadata !== "object" || taskMetadata === null) return null
	const limits = (taskMetadata as { Limits?: unknown }).Limits
	if (typeof limits !== "object" || limits === null) return null
	const memory = (limits as { Memory?: unknown }).Memory
	return typeof memory === "number" && Number.isFinite(memory) && memory > 0 ? memory : null
}

/** Limiar em bytes: 90% do limite da task, ou do fallback quando o limite é desconhecido. */
export function memoryThresholdBytes(limitMiB: number | null): number {
	return Math.floor((limitMiB ?? FALLBACK_LIMIT_MIB) * MIB * MEMORY_THRESHOLD_RATIO)
}
