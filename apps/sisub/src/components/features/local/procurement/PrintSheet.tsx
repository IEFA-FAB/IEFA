import { Link } from "@tanstack/react-router"
import { ArrowLeft, Printer } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"

/**
 * Folha imprimível dos documentos do anexo. Mesma técnica da Ficha Técnica
 * (`RecipeTechnicalSheetPrint`): a cópia de impressão vai num portal direto no `<body>`, porque a
 * da tela vive dentro do app-shell (`overflow-hidden`), que recorta tudo além da primeira dobra.
 * `window.print()` oferece "Salvar como PDF"; nenhuma dependência de geração de PDF.
 */
export function PrintSheet({ back, toolbar, children }: { back: { unitId: string; ataId: string }; toolbar?: ReactNode; children: ReactNode }) {
	// A cópia de impressão só existe no cliente — createPortal exige `document`.
	const [mounted, setMounted] = useState(false)
	useEffect(() => setMounted(true), [])

	return (
		<div>
			<style>{PRINT_CSS}</style>
			<div data-proc-no-print className="mb-4 flex flex-wrap items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					nativeButton={false}
					render={
						<Link to="/unit/$unitId/procurement/$ataId" params={back}>
							<ArrowLeft data-icon="inline-start" aria-hidden="true" />
							Voltar ao anexo
						</Link>
					}
				/>
				<div className="ml-auto flex flex-wrap items-center gap-2">
					{toolbar}
					<Button size="sm" onClick={() => window.print()}>
						<Printer data-icon="inline-start" aria-hidden="true" />
						Imprimir / Salvar PDF
					</Button>
				</div>
			</div>
			<div data-proc-doc>{children}</div>
			{mounted &&
				createPortal(
					<div data-proc-portal data-proc-doc>
						{children}
					</div>,
					document.body
				)}
		</div>
	)
}

const PRINT_CSS = `
[data-proc-doc] { font-family: "Times New Roman", Times, serif; color: #000; background: #fff; border: 1px solid #d4d4d4; padding: 24px; max-width: 1100px; font-size: 12px; line-height: 1.45; }
[data-proc-doc] h1 { font-size: 16px; font-weight: 700; text-align: center; text-transform: uppercase; margin: 0 0 4px; }
[data-proc-doc] h2 { font-size: 13px; font-weight: 700; text-transform: uppercase; margin: 18px 0 6px; border-bottom: 1px solid #000; padding-bottom: 2px; }
[data-proc-doc] h3 { font-size: 12px; font-weight: 700; margin: 12px 0 4px; }
[data-proc-doc] p { margin: 0 0 6px; text-align: justify; }
[data-proc-doc] [data-proc="meta"] { text-align: center; margin-bottom: 12px; }
[data-proc-doc] table { width: 100%; border-collapse: collapse; margin: 4px 0 10px; font-size: 11px; }
[data-proc-doc] th, [data-proc-doc] td { border: 1px solid #000; padding: 2px 4px; vertical-align: top; }
[data-proc-doc] th { background: #eee; text-align: left; }
[data-proc-doc] td[data-num], [data-proc-doc] th[data-num] { text-align: right; white-space: nowrap; }
[data-proc-doc] [data-proc="block"] { break-inside: avoid; page-break-inside: avoid; }
[data-proc-doc] [data-proc="alert"] { border: 1px solid #000; padding: 6px 8px; margin: 8px 0; }
[data-proc-doc] [data-proc="mono"] { font-family: "Courier New", monospace; word-break: break-all; }
[data-proc-doc] [data-proc="signatures"] { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 36px; text-align: center; }
[data-proc-doc] [data-proc="signatures"] div { border-top: 1px solid #000; padding-top: 4px; }
[data-proc-portal] { display: none; }
@media print {
	@page { size: A4 landscape; margin: 12mm; }
	body { background: #fff !important; }
	body > *:not([data-proc-portal]) { display: none !important; }
	[data-proc-portal] { display: block !important; border: none; padding: 0; max-width: none; }
	[data-proc-no-print] { display: none !important; }
	[data-proc-doc] h2, [data-proc-doc] h3 { break-after: avoid; page-break-after: avoid; }
	[data-proc-doc] tr { break-inside: avoid; page-break-inside: avoid; }
}
`
