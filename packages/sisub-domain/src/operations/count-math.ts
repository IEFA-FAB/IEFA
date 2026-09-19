/**
 * Matemática pura do inventário (Fase 6).
 *
 * Três decisões moram aqui porque nenhuma delas é óbvia e todas já custaram
 * dinheiro em sistema de estoque:
 *
 *  • **O instante da contagem manda, não o de agora.** A diferença de uma
 *    linha é `contado − saldo do ledger até o instante em que se contou`. A
 *    cozinha não para para contar: o lote conferido às 09:00 com 50 KG que
 *    perde 10 KG no almoço tem diferença ZERO, e não 10 de falta.
 *  • **Offline, o relógio do dispositivo não é confiável.** O tablet da câmara
 *    fria pode estar horas fora. O instante é o do aparelho corrigido pelo
 *    desvio medido na abertura da sessão, e depois LIMITADO à janela entre a
 *    última sincronização e o recebimento pelo servidor — fora dela, não se
 *    sabe o que aconteceu, e a linha vai para recontagem.
 *  • **Divergência grande precisa das DUAS tolerâncias.** Só percentual manda
 *    para recontagem 40% de um saquinho de fermento; só valor deixa passar 2%
 *    de um contêiner de carne. A linha só é aceita quando fica abaixo das duas.
 */

/** Um lançamento, como chega do dispositivo. */
export interface CountEntryInput {
	/** Identificador gerado no cliente — é o que impede o reenvio de contar duas vezes. */
	clientEventId: string
	lotId?: string | null
	ingredientId?: string | null
	frozenPreparationId?: string | null
	quantity: number
	/** Instante do dispositivo (ISO). Ausente = online, vale o do servidor. */
	deviceAt?: string | null
	/** Lançamento que ANULA os anteriores da mesma linha. */
	overwrite?: boolean
}

export interface ClockWindow {
	/** Desvio medido na abertura da sessão: `servidor − dispositivo`, em ms. */
	skewMs: number
	/** Última sincronização bem-sucedida (ISO). */
	lastSyncAt: string
	/** Instante em que o servidor recebeu o lote de lançamentos (ISO). */
	receivedAt: string
}

export interface ResolvedInstant {
	/** Instante que vale para a diferença (ISO). */
	countedAt: string
	/** `true` quando o relógio caiu fora da janela e a linha não é confiável. */
	outsideWindow: boolean
}

/**
 * Instante que vale para um lançamento offline.
 *
 * Corrige pelo desvio e prende à janela. Prender, e não rejeitar, porque a
 * leitura do operador na câmara é boa mesmo com o relógio ruim — o que se
 * perde é a precisão do instante, e é isso que a recontagem resolve.
 */
export function resolveCountedAt(deviceAt: string, window: ClockWindow): ResolvedInstant {
	const corrected = new Date(new Date(deviceAt).getTime() + window.skewMs)
	const floor = new Date(window.lastSyncAt)
	const ceiling = new Date(window.receivedAt)

	if (corrected < floor) return { countedAt: floor.toISOString(), outsideWindow: true }
	if (corrected > ceiling) return { countedAt: ceiling.toISOString(), outsideWindow: true }
	return { countedAt: corrected.toISOString(), outsideWindow: false }
}

/**
 * Houve movimento do item entre o instante da contagem e o recebimento?
 *
 * Quando houve, a linha vai para recontagem mesmo que o instante tenha caído
 * dentro da janela: a diferença seria apurada contra um saldo que se mexeu
 * enquanto o lançamento viajava, e não dá para saber de que lado.
 */
export function movedDuringSync(movementInstants: readonly string[], countedAt: string, receivedAt: string): boolean {
	const from = new Date(countedAt).getTime()
	const to = new Date(receivedAt).getTime()
	return movementInstants.some((instant) => {
		const at = new Date(instant).getTime()
		return at > from && at <= to
	})
}

// A quantidade da linha (soma com sobrescrita) e a referência da linha SEM
// lote moravam aqui, em TypeScript, e também no SQL da aprovação — e as duas
// cópias divergiam: a folha mostrava diferença zero onde a aprovação lançava
// perda. As duas agora são de `inventory.count_lines`, a única definição, que
// a folha e a aprovação leem.

export interface CountLineVariance {
	counted: number
	/** Saldo do ledger no instante da contagem. */
	ledger: number
	/** Custo médio, para medir a divergência em dinheiro. */
	unitCost: number
}

export interface CountTolerance {
	/** Tolerância percentual sobre o saldo de referência. */
	percent: number
	/** Piso em reais: abaixo dele a divergência não é relevante, qualquer que seja o percentual. */
	floorValue: number
}

export interface CountVarianceVerdict {
	difference: number
	differenceValue: number
	percent: number
	/** `true` quando passa das DUAS tolerâncias e a linha vai para recontagem. */
	needsRecount: boolean
}

export function evaluateCountLine(line: CountLineVariance, tolerance: CountTolerance): CountVarianceVerdict {
	const difference = line.counted - line.ledger
	const differenceValue = Math.abs(difference) * line.unitCost
	// saldo de referência zero com contagem positiva é 100% de divergência, e
	// não divisão por zero: é o achado, o item que ninguém sabia que existia
	const percent = line.ledger === 0 ? (difference === 0 ? 0 : 100) : Math.abs(difference / line.ledger) * 100
	return {
		difference,
		differenceValue,
		percent,
		needsRecount: percent > tolerance.percent && differenceValue > tolerance.floorValue,
	}
}
