/**
 * Stub do `#/server/legal.fn` para o harness — mesmo motivo do stub de
 * `auth.fn`: o módulo real declara server functions do TanStack Start.
 *
 * Sem documento pendente o aviso de ciência não aparece, que é o estado certo
 * para inspecionar o layout da casca.
 */
export async function listPendingLegalDocumentsFn(): Promise<never[]> {
	return []
}

export async function acknowledgeLegalDocumentsFn(): Promise<void> {}

export async function fetchLegalDocumentFn(): Promise<null> {
	return null
}
