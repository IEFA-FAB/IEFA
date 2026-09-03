import { Check, Copy, InfoCircle, WarningTriangle } from "iconoir-react"
import { useEffect, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { copyableFields, copyDocument, toHtml, toPlainText } from "@/lib/comaer/sigadaer"
import type { AssembledDocument } from "@/lib/comaer/types"

/**
 * Saída para o SIGADAER.
 *
 * A conferência vem ANTES do botão de copiar. Ela estava embaixo, e quem copiava primeiro
 * nunca a lia — o expediente ia para o SIGADAER com o erro que o módulo existe para
 * impedir.
 *
 * Cada campo tem botão próprio porque o formulário do SIGADAER tem caixas separadas; o
 * nome acessível distingue os onze "Copiar" que, sem ele, são onze botões idênticos na
 * lista de um leitor de tela.
 */
export function ExportPanel({ doc }: { doc: AssembledDocument }) {
	const fields = copyableFields(doc)
	const nonCompliant = doc.warnings.filter((w) => w.severity === "nonCompliant")
	const pending = doc.warnings.filter((w) => w.severity === "pending")

	return (
		<section className="border border-border p-4 flex flex-col gap-4">
			<div className="flex items-baseline justify-between gap-3">
				<h2 className="text-label text-foreground">Conferir e levar para o SIGADAER</h2>
				<span className="text-label text-muted-foreground">art. 51 § 8º</span>
			</div>

			{nonCompliant.length > 0 && (
				<Alert variant="destructive">
					<WarningTriangle />
					<AlertTitle>Conferir antes de despachar</AlertTitle>
					<AlertDescription>
						<ul className="list-disc pl-4 flex flex-col gap-1">
							{nonCompliant.map((finding) => (
								<li key={finding.text}>{finding.text}</li>
							))}
						</ul>
					</AlertDescription>
				</Alert>
			)}

			{/* `role="status"`: a lista muda a cada tecla digitada, e o `role="alert"` do primitivo
			    relia tudo, do começo, interrompendo quem está preenchendo. */}
			{pending.length > 0 && (
				<Alert role="status">
					<InfoCircle />
					<AlertTitle>Falta preencher</AlertTitle>
					<AlertDescription>
						<ul className="list-disc pl-4 flex flex-col gap-1">
							{pending.map((finding) => (
								<li key={finding.text}>{finding.text}</li>
							))}
						</ul>
					</AlertDescription>
				</Alert>
			)}

			<CopyButton
				// "Mesmo assim" é para quem passa por cima da NORMA. Falta de NUP é só falta de NUP.
				label={nonCompliant.length > 0 ? "Copiar mesmo assim" : "Copiar documento inteiro"}
				text={toPlainText(doc)}
				html={toHtml(doc)}
				className="w-full"
				variant="default"
			/>

			<div className="flex flex-col">
				<h3 className="text-label text-muted-foreground mb-2">Copiar campo a campo</h3>
				<ul className="flex flex-col border border-border divide-y divide-border">
					{fields.map((field) => (
						<li key={field.id} className="flex items-center justify-between gap-3 px-3 py-2">
							<div className="min-w-0">
								<p className="text-sm font-medium">{field.label}</p>
								<p className="text-xs text-muted-foreground truncate">{field.text.split("\n")[0]}</p>
							</div>
							<CopyButton label="Copiar" accessibleName={`Copiar ${field.label}`} text={field.text} html={field.html} variant="ghost" />
						</li>
					))}
				</ul>
			</div>
		</section>
	)
}

function CopyButton({
	label,
	accessibleName,
	text,
	html,
	className,
	variant,
}: {
	label: string
	accessibleName?: string
	text: string
	html: string
	className?: string
	variant: "default" | "ghost"
}) {
	const [state, setState] = useState<"idle" | "copied" | "failed">("idle")

	// O "copiado" some sozinho; o ERRO não. Este é o caminho para o SIGADAER, e um aviso de
	// falha que desaparece em dois segundos faz a pessoa colar o conteúdo anterior no
	// expediente sem perceber.
	useEffect(() => {
		if (state !== "copied") return
		const timer = setTimeout(() => setState("idle"), 2000)
		return () => clearTimeout(timer)
	}, [state])

	const copy = async () => {
		try {
			await copyDocument({ text, html })
			setState("copied")
		} catch {
			setState("failed")
		}
	}

	return (
		<div className={className}>
			<Button
				type="button"
				variant={variant}
				size="sm"
				onClick={copy}
				// Enquanto o botão diz "Copiado", o nome acessível diz o mesmo: comando de voz
				// procura o que está escrito na tela.
				aria-label={accessibleName ? (state === "copied" ? `Copiado: ${accessibleName}` : accessibleName) : undefined}
				className={className ? "w-full justify-center" : undefined}
			>
				{state === "copied" ? <Check className="size-4" /> : <Copy className="size-4" />}
				{state === "copied" ? "Copiado" : label}
			</Button>
			{/* Sem região viva, quem usa leitor de tela não sabe se copiou. */}
			<span role="status" className="sr-only">
				{state === "copied" ? `${accessibleName ?? label}: copiado` : ""}
			</span>
			{state === "failed" && (
				<p role="alert" className="text-xs text-destructive mt-1">
					Não foi possível copiar. Selecione o texto na folha e copie manualmente.
				</p>
			)}
		</div>
	)
}
