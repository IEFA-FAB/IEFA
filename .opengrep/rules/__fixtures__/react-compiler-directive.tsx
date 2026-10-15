// ok: react-directive-not-first
"use client"
// Prólogo com mais de uma diretiva: o compiler lê as duas (`program.directives`).
// ok: react-directive-not-first
"use no memo"

// Casos de teste de `.opengrep/rules/react-compiler-directive.yaml`. Não é código do app: fica fora de
// `apps`/`packages` (o `scan:rules` não o lê) e o Biome ignora `__fixtures__`.
//
// Rodar: opengrep test --config .opengrep/rules/react-compiler-directive.yaml .opengrep/rules/__fixtures__/react-compiler-directive.tsx

import { forwardRef, memo, useCallback, useEffect, useRef } from "react"
// Diretiva de módulo depois dos imports já não está no prólogo.
// ruleid: react-directive-not-first
"use no memo"

declare function useVirtualizer(options: object): { scrollToIndex(i: number): void }
declare function save(): Promise<void>
declare function useForm(options: { onSubmit: (args: { value: string }) => Promise<void> }): void

/* ------------------------------ prólogo válido ------------------------------ */

export function TreeManager() {
	// Fora do compiler: useVirtualizer devolve objeto mutável de identidade estável.
	// ok: react-directive-not-first
	"use no memo"
	const virtualizer = useVirtualizer({})
	return <div onScroll={() => virtualizer.scrollToIndex(0)} />
}

export function StrictComponent() {
	"use strict"
	// ok: react-directive-not-first
	"use no memo"
	return null
}

export const ArrowComponent = (): null => {
	// ok: react-directive-not-first
	"use no memo"
	return null
}

export function useScanner(): number {
	// ok: react-directive-in-non-component
	"use no memo"
	return useRef(0).current
}

export const useArrowHook = () => {
	// ok: react-directive-in-non-component
	"use no memo"
	return 1
}

export const Memoized = memo(function MemoizedInner() {
	// ok: react-directive-in-non-component
	"use no memo"
	return null
})

export const Forwarded = forwardRef<HTMLDivElement, object>((props, ref) => {
	// ok: react-directive-in-non-component
	"use no memo"
	return <div ref={ref} {...props} />
})

/* --------------------------- depois de outra instrução --------------------------- */

// `IngredientsTreeManager` antes do #630: o Biome formata a diretiva fora do prólogo com `;(…)`.
export function LateDirective({ catalog }: { catalog: string }) {
	const persistKey = `${catalog}:tree`
	// ruleid: react-directive-not-first
	;("use no memo")
	const ref = useRef(persistKey)
	return <div>{ref.current}</div>
}

export function LateWithoutParens() {
	const a = 1
	// ruleid: react-directive-not-first
	"use no memo"
	return <div>{a}</div>
}

/* ----------------------- primeira instrução de função aninhada ----------------------- */

export function ArranchamentoPage({ items }: { items: string[] }) {
	// `const handler = async (…): Promise<void> => { "use no memo" … }`
	// ruleid: react-directive-in-non-component
	const applyToAll = async (template: string, options: { mode: "fill-missing" | "override" }): Promise<void> => {
		"use no memo"
		if (!template || !options) return
		await save()
	}

	// ruleid: react-directive-in-non-component
	const onScanSuccess = useCallback((result: { data: string }) => {
		"use no memo"
		if (!result.data) return
		// IIFE dentro do callback.
		// ruleid: react-directive-in-non-component
		;(async () => {
			"use no memo"
			await save()
		})()
	}, [])

	useEffect(() => {
		// ruleid: react-directive-in-non-component
		const startScanner = async () => {
			"use no memo"
			await save()
		}
		void startScanner()
	}, [])

	useForm({
		// ruleid: react-directive-in-non-component
		onSubmit: async ({ value }) => {
			"use no memo"
			if (value) await save()
		},
	})

	// ruleid: react-directive-in-non-component
	function inner() {
		"use no memo"
		return items.length
	}

	return (
		<div>
			<button
				type="button"
				// ruleid: react-directive-in-non-component
				onClick={async () => {
					"use no memo"
					await save()
				}}
			>
				{inner()}
			</button>
			<span onClick={onScanSuccess.bind(null, { data: "" })}>{applyToAll.length}</span>
		</div>
	)
}

// Função aninhada SEM diretiva dentro de componente com o opt-out certo: nada a acusar.
export function ScannerTab() {
	// ok: react-directive-in-non-component
	"use no memo"
	// ok: react-directive-in-non-component
	const handle = async () => {
		await save()
	}
	return <button type="button" onClick={handle} />
}
