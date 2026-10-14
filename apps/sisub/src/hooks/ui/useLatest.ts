import { type RefObject, useInsertionEffect, useRef } from "react"

/**
 * Ref com o valor do último render confirmado, para quem lê fora do render: listener montado uma
 * vez, timer, callback estável. Substitui o `ref.current = valor` escrito no corpo do componente,
 * que o React Compiler recusa (`react-hooks-js/refs`): render descartado ou repetido gravaria um
 * valor que nunca chegou à tela.
 *
 * A gravação vai no `useInsertionEffect` porque ele roda antes de todo `useLayoutEffect` e
 * `useEffect` do commit, inclusive os dos filhos: qualquer efeito ou handler já lê o valor novo.
 *
 * Não leia `.current` durante o render: ali o valor é o do render ANTERIOR. Para exibir, use o
 * próprio valor.
 */
export function useLatest<T>(value: T): RefObject<T> {
	const ref = useRef(value)
	useInsertionEffect(() => {
		ref.current = value
	})
	return ref
}
