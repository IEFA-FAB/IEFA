/**
 * @module recovery-rate-limit
 * Limite de tentativas do código de recuperação — **no servidor**, por (usuário, origem).
 *
 * ## Por que não reaproveitar `@iefa/auth-kit/rate-limiter`
 *
 * Aquele guarda o estado em `sessionStorage`, e o próprio cabeçalho dele diz o que é:
 * "freio de UX, não controle de segurança". Quem está adivinhando um código de recuperação
 * não usa a tela — usa `curl`, onde `sessionStorage` não existe. Um limite que o atacante
 * apaga com F5 não limita nada.
 *
 * ## Por que o par (usuário, origem), e não só o usuário (design.md D17)
 *
 * Limite só por `user_id` entrega ao atacante uma negação de serviço barata: bastam cinco
 * palpites contra o e-mail da vítima para trancar a recuperação DELA. O balde principal é
 * por origem; o balde por usuário existe acima dele, com teto bem mais alto, para conter
 * força bruta distribuída sem que uma única origem consiga esgotá-lo.
 *
 * Com os tetos abaixo, uma origem hostil queima 5 das 20 tentativas globais: a vítima,
 * chegando de outro IP, ainda tem 15. Seriam necessárias quatro origens distintas para
 * fechar a janela — e nesse ponto o reset administrativo, que este limite **não** alcança,
 * continua sendo o caminho de socorro.
 *
 * ## Onde o estado mora
 *
 * Em memória, por processo — mesma limitação consciente de `@iefa/ai-provider`
 * (`rate-limit.ts`): com N tasks no ECS o teto efetivo é N × o configurado, e um deploy
 * zera os contadores. Aceito aqui porque (a) o balde protege um segredo de 60 bits, onde o
 * ganho do atacante com 2× tentativas é irrelevante, e (b) a alternativa — uma tabela — é
 * migration nova num repo que já está com drift de carimbo, para um contador que se apaga
 * sozinho em 15 minutos. Se a frota crescer ou o teto endurecer, o lugar de mudar é aqui
 * dentro: a superfície pública (`assess`/`recordFailure`/`recordSuccess`) não muda.
 *
 * Este arquivo é PURO de propósito — sem `env.server`, sem banco, sem request. É o que
 * deixa `recovery-rate-limit.test.ts` provar o comportamento com um relógio injetado.
 *
 * @domain app
 */

/** Tentativas malsucedidas que uma MESMA origem pode fazer contra um usuário na janela. */
export const MAX_FAILURES_PER_ORIGIN = 5

/**
 * Tentativas malsucedidas somadas de TODAS as origens, para o mesmo usuário, na janela.
 *
 * Mais alto que o teto por origem de propósito: é o que faz o esgotamento provocado por um
 * terceiro não virar tranca na conta da vítima.
 */
export const MAX_FAILURES_PER_USER = 20

/** Tamanho da janela dos dois baldes. */
export const RECOVERY_WINDOW_MS = 15 * 60 * 1000

/** Origem indisponível (sem `x-forwarded-for`) cai num balde só, e é o certo: não dá para distinguir. */
export const UNKNOWN_ORIGIN = "unknown"

export type RecoveryAttemptKey = {
	userId: string
	/** IP do cliente, ou `UNKNOWN_ORIGIN`. */
	origin: string
}

export type RecoveryAttemptVerdict =
	| { allowed: true }
	| {
			allowed: false
			/** Qual balde estourou — a mensagem ao usuário muda com ele. */
			scope: "origin" | "user"
			retryAfterSeconds: number
	  }

type Bucket = { startedAt: number; failures: number }

/**
 * Contadores de janela fixa. Exportado como classe para o teste conseguir um estado limpo:
 * o singleton do processo (`RECOVERY_ATTEMPT_LIMITER`, abaixo) guardaria as contagens de um
 * caso no seguinte, e o teste passaria a depender da ordem dos arquivos.
 */
export class RecoveryAttemptLimiter {
	private readonly buckets = new Map<string, Bucket>()

	private bucket(key: string, now: number): Bucket {
		const existing = this.buckets.get(key)
		if (existing && now - existing.startedAt < RECOVERY_WINDOW_MS) return existing
		const fresh = { startedAt: now, failures: 0 }
		this.buckets.set(key, fresh)
		return fresh
	}

	private retryAfter(bucket: Bucket, now: number): number {
		return Math.max(1, Math.ceil((bucket.startedAt + RECOVERY_WINDOW_MS - now) / 1000))
	}

	private originKey({ userId, origin }: RecoveryAttemptKey): string {
		return `${userId}|${origin || UNKNOWN_ORIGIN}`
	}

	/**
	 * Diz se esta tentativa pode ser feita. **Não consome nada**: quem conta é
	 * `recordFailure`, porque um código CERTO não pode gastar o orçamento de quem errou.
	 */
	assess(key: RecoveryAttemptKey, now = Date.now()): RecoveryAttemptVerdict {
		const byOrigin = this.bucket(this.originKey(key), now)
		if (byOrigin.failures >= MAX_FAILURES_PER_ORIGIN) {
			return { allowed: false, scope: "origin", retryAfterSeconds: this.retryAfter(byOrigin, now) }
		}

		const byUser = this.bucket(key.userId, now)
		if (byUser.failures >= MAX_FAILURES_PER_USER) {
			return { allowed: false, scope: "user", retryAfterSeconds: this.retryAfter(byUser, now) }
		}

		return { allowed: true }
	}

	/** Registra um palpite errado nos dois baldes. */
	recordFailure(key: RecoveryAttemptKey, now = Date.now()): void {
		this.bucket(this.originKey(key), now).failures += 1
		this.bucket(key.userId, now).failures += 1
	}

	/**
	 * Zera os baldes do titular depois de um consumo bem-sucedido.
	 *
	 * Sem isto, quem errou quatro vezes e acertou na quinta continuaria a uma tentativa do
	 * bloqueio — e a próxima recuperação legítima, minutos depois, seria recusada por
	 * erros que já tinham sido resolvidos.
	 */
	recordSuccess(key: RecoveryAttemptKey): void {
		this.buckets.delete(this.originKey(key))
		this.buckets.delete(key.userId)
	}
}

/**
 * Balde do processo, compartilhado por todas as requisições desta instância.
 *
 * Vive aqui, e não no arquivo da server function, porque um módulo `.fn.ts` é recarregado
 * pelo Vite a cada edição em desenvolvimento — e um contador que se apaga a cada salvamento
 * não é um contador. Em produção o módulo é carregado uma vez.
 */
export const RECOVERY_ATTEMPT_LIMITER = new RecoveryAttemptLimiter()

/** Mensagem ao usuário. Não diz quantas tentativas faltam — isso é dado para quem adivinha. */
export function attemptBlockedMessage(verdict: Extract<RecoveryAttemptVerdict, { allowed: false }>): string {
	const minutes = Math.max(1, Math.ceil(verdict.retryAfterSeconds / 60))
	const base = `Muitas tentativas. Aguarde ${minutes} ${minutes === 1 ? "minuto" : "minutos"} e tente novamente`
	// Quando o teto estourado é o do USUÁRIO, o caminho de socorro é outro — e ele precisa
	// ser dito, porque é justamente o caso em que a pessoa não tem mais o que tentar sozinha.
	return verdict.scope === "user" ? `${base}. Se o acesso for urgente, procure um administrador para o restabelecimento do segundo fator.` : `${base}.`
}
