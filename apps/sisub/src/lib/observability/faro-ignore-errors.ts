/**
 * Ruído universal do browser — nunca são erros reais da aplicação.
 *
 * ATENÇÃO ao escrever padrão novo: o Faro NÃO testa a mensagem sozinha. O
 * `isErrorIgnored` do faro-core (2.7.1) casa o padrão contra
 * `message + " " + name + " " + stack`, ou seja, depois da mensagem vem sempre
 * " Error Error: <mensagem>\n    at ...". Âncora `$` nunca casa nessa string, e o
 * padrão vira letra morta sem erro nenhum — foi assim que o
 * "ResizeObserver loop completed with undelivered notifications" chegou ao Grafana
 * com `/^…$/` configurado. `^` é seguro (a mensagem é o começo da string); `$` não.
 */
export const FARO_IGNORE_ERRORS: RegExp[] = [
	/^ResizeObserver loop (?:limit exceeded|completed with undelivered notifications)/,
	/^Script error\./,
	/chrome-extension:\/\//,
	/moz-extension:\/\//,
]
