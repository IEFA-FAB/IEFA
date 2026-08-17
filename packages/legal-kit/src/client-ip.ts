const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/
// Conservador de propósito: só grupos hexadecimais, `::` e IPv4 embutido. Não
// aceita zona (`%eth0`) nem prefixo CIDR — `INET` aceitaria o CIDR e passaríamos a
// gravar uma faixa onde o esquema promete um endereço.
const IPV6 = /^(?:[0-9a-fA-F]{0,4}:){2,7}(?:[0-9a-fA-F]{0,4}|(?:\d{1,3}\.){3}\d{1,3})$/

/**
 * Endereço do cliente a partir do `X-Forwarded-For`, para a coluna `INET` do
 * registro de ciência.
 *
 * Pega o ÚLTIMO elemento, não o primeiro. O ALB **acrescenta** o IP do peer TCP ao
 * final da cadeia, então o último é o que a infraestrutura observou; o primeiro é
 * texto que o cliente pode escrever à vontade — e a evidência de ciência perde o
 * sentido se o próprio titular escolhe o IP que fica registrado. (Vale para um
 * salto de proxy, que é a topologia daqui: cliente → ALB → app.)
 *
 * Valida antes de devolver. Proxy que emite `X-Forwarded-For: unknown` (sintaxe
 * legítima, herdada do Squid) faria o Postgres levantar `22P02 invalid_text_
 * representation`, e o "Estou ciente" passaria a responder 500 para sempre naquele
 * cliente — um registro de ciência que impede o registro de ciência.
 */
export function clientIpFromForwardedFor(header: string | null | undefined): string | null {
	if (!header) return null

	const parts = header
		.split(",")
		.map((part) => part.trim())
		.filter((part) => part.length > 0)

	const candidate = parts.at(-1)
	if (!candidate) return null

	// `[2001:db8::1]:443` — forma com colchetes/porta do RFC 7239 e de alguns proxies.
	const unbracketed = candidate.startsWith("[") ? candidate.slice(1, candidate.indexOf("]") === -1 ? undefined : candidate.indexOf("]")) : candidate

	if (IPV4.test(unbracketed)) return unbracketed
	// IPv4 com porta (`203.0.113.4:51234`); IPv6 sem colchetes não é desambiguável.
	const withoutPort = unbracketed.includes(":") && IPV4.test(unbracketed.split(":")[0] ?? "") ? (unbracketed.split(":")[0] as string) : null
	if (withoutPort) return withoutPort

	if (IPV6.test(unbracketed)) return unbracketed
	return null
}
