import { Check, Copy, InfoCircle, WarningTriangle } from "iconoir-react"
import { useEffect, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { copyField, type SigadaerField, sigadaerHandoff } from "@/lib/comaer/sigadaer"
import type { AssembledDocument, DocumentInput } from "@/lib/comaer/types"

/**
 * Entrega para o SIGADAER.
 *
 * O painel é o ESPELHO DO FORMULÁRIO do SIGADAER, na ordem em que a tela dele apresenta os
 * campos — não uma lista dos blocos do nosso documento. Antes havia um "copiar documento
 * inteiro" e um botão por bloco: as duas coisas colavam timbre, epígrafe, numeração,
 * preâmbulo e signatário dentro da caixa de texto do sistema, que já os imprime. O que
 * saía do outro lado era o cabeçalho do ofício repetido no meio do próprio ofício.
 *
 * O que o SIGADAER preenche sozinho continua listado, sem botão: sumir com a epígrafe
 * faria a pessoa procurar onde colá-la. Listada como conferência, ela vira o que de fato é
 * — o valor que tem de bater com o cadastro da UO.
 *
 * A conferência da norma vem ANTES dos campos. Ela já esteve embaixo, e quem copiava
 * primeiro nunca a lia.
 */
export function ExportPanel({ input, doc }: { input: DocumentInput; doc: AssembledDocument }) {
	const { fields, generated } = sigadaerHandoff(input, doc)
	const nonCompliant = doc.warnings.filter((w) => w.severity === "nonCompliant")
	const pending = doc.warnings.filter((w) => w.severity === "pending")

	return (
		<section className="border border-border p-4 flex flex-col gap-4">
			<div className="flex items-baseline justify-between gap-3">
				<h2 className="text-label text-foreground">Conferir e levar para o SIGADAER</h2>
				<span className="text-label text-muted-foreground">SIGADAER 7.14</span>
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

			<div className="flex flex-col">
				<h3 className="text-label text-muted-foreground mb-2">Campos do formulário, na ordem da tela</h3>
				<ul className="flex flex-col border border-border divide-y divide-border">
					{fields.map((field) => (
						<FieldRow key={field.id} field={field} />
					))}
				</ul>
			</div>

			{generated.length > 0 && (
				<div className="flex flex-col">
					<h3 className="text-label text-muted-foreground mb-1">O SIGADAER preenche sozinho</h3>
					<p className="text-xs text-muted-foreground mb-2">
						Sai do cadastro da UO e do protocolo. Não cole nada disso na caixa de texto — confira se o que o sistema imprimir bate com o que está aqui.
					</p>
					<ul className="flex flex-col border border-border divide-y divide-border">
						{generated.map((bloco) => (
							<li key={bloco.id} className="px-3 py-2">
								<p className="text-sm font-medium">{bloco.label}</p>
								<p className="text-xs text-muted-foreground whitespace-pre-line">{bloco.value}</p>
							</li>
						))}
					</ul>
				</div>
			)}
		</section>
	)
}

function FieldRow({ field }: { field: SigadaerField }) {
	const empty = field.value.trim() === ""
	// O `maxlength` do SIGADAER trunca sem avisar: o excedente aparece aqui, contado, antes
	// de a pessoa colar.
	const overLimit = field.maxLength !== undefined && field.value.length > field.maxLength

	return (
		<li className="flex items-center justify-between gap-3 px-3 py-2">
			<div className="min-w-0">
				<p className="text-sm font-medium">{field.label}</p>
				{empty ? (
					<p className="text-xs text-muted-foreground italic">em branco</p>
				) : field.choice ? (
					// Não há o que colar numa lista de opções: o valor é a opção a marcar.
					<p className="text-xs text-muted-foreground">
						selecione <span className="font-medium text-foreground">{field.value}</span>
					</p>
				) : (
					<p className="text-xs text-muted-foreground truncate">{field.value.split("\n")[0]}</p>
				)}
				{field.hint && !empty && <p className="text-xs text-muted-foreground">{field.hint}</p>}
				{overLimit && (
					<p className="text-xs text-destructive">
						{field.value.length} de {field.maxLength} caracteres — o SIGADAER corta o resto.
					</p>
				)}
			</div>
			{!field.choice && !empty && <CopyButton accessibleName={`Copiar ${field.label}`} text={field.value} />}
		</li>
	)
}

function CopyButton({ accessibleName, text }: { accessibleName: string; text: string }) {
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
			await copyField(text)
			setState("copied")
		} catch {
			setState("failed")
		}
	}

	return (
		<div className="shrink-0">
			<Button
				type="button"
				variant="ghost"
				size="sm"
				onClick={copy}
				// Enquanto o botão diz "Copiado", o nome acessível diz o mesmo: comando de voz
				// procura o que está escrito na tela.
				aria-label={state === "copied" ? `Copiado: ${accessibleName}` : accessibleName}
			>
				{state === "copied" ? <Check className="size-4" /> : <Copy className="size-4" />}
				{state === "copied" ? "Copiado" : "Copiar"}
			</Button>
			{/* Sem região viva, quem usa leitor de tela não sabe se copiou. */}
			<span role="status" className="sr-only">
				{state === "copied" ? `${accessibleName}: copiado` : ""}
			</span>
			{state === "failed" && (
				<p role="alert" className="text-xs text-destructive mt-1">
					Não foi possível copiar. Selecione o texto na folha e copie manualmente.
				</p>
			)}
		</div>
	)
}
