import { Check, Copy, WarningTriangle } from "iconoir-react"
import { useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { copyableFields, copyDocument, toHtml, toPlainText } from "@/lib/comaer/sigadaer"
import type { AssembledDocument } from "@/lib/comaer/types"

/**
 * Saída para o SIGADAER.
 *
 * O documento inteiro E cada campo isolado: o formulário do SIGADAER tem caixas separadas
 * (assunto, destinatário, corpo), e um único botão "copiar tudo" obrigaria a recortar o
 * texto de volta à mão — que é onde se perde a numeração de parágrafo.
 */
export function ExportPanel({ doc }: { doc: AssembledDocument }) {
	const fields = copyableFields(doc)

	return (
		<div className="flex flex-col gap-4">
			<CopyButton label="Copiar documento inteiro" text={toPlainText(doc)} html={toHtml(doc)} className="w-full justify-center" variant="default" />

			<div className="flex flex-col">
				<h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Copiar campo a campo</h3>
				<ul className="flex flex-col border border-border divide-y divide-border">
					{fields.map((field) => (
						<li key={field.id} className="flex items-center justify-between gap-3 px-3 py-2">
							<div className="min-w-0">
								<p className="text-sm font-medium">{field.label}</p>
								<p className="text-xs text-muted-foreground truncate">{field.text.split("\n")[0]}</p>
							</div>
							<CopyButton label="Copiar" text={field.text} html={field.html} variant="ghost" />
						</li>
					))}
				</ul>
			</div>

			{doc.warnings.length > 0 && (
				<Alert variant="destructive">
					<WarningTriangle />
					<AlertTitle>Conferir antes de despachar</AlertTitle>
					<AlertDescription>
						<ul className="list-disc pl-4 flex flex-col gap-1">
							{doc.warnings.map((aviso) => (
								<li key={aviso}>{aviso}</li>
							))}
						</ul>
					</AlertDescription>
				</Alert>
			)}
		</div>
	)
}

function CopyButton({
	label,
	text,
	html,
	className,
	variant,
}: {
	label: string
	text: string
	html: string
	className?: string
	variant: "default" | "ghost"
}) {
	const [state, setEstado] = useState<"pronto" | "copiado" | "erro">("pronto")

	const runCopy = async () => {
		try {
			await copyDocument({ text, html })
			setEstado("copiado")
		} catch {
			// Navegador sem permissão de área de transferência: dizer que copiou seria pior
			// que o erro — o usuário colaria o conteúdo anterior no SIGADAER sem perceber.
			setEstado("erro")
		}
		setTimeout(() => setEstado("pronto"), 2000)
	}

	return (
		<Button type="button" variant={variant} size="sm" onClick={runCopy} className={className}>
			{state === "copiado" ? <Check className="size-4" /> : <Copy className="size-4" />}
			{state === "copiado" ? "Copiado" : state === "erro" ? "Falhou — copie manualmente" : label}
		</Button>
	)
}
