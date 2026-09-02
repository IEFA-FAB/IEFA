import { useMutation } from "@tanstack/react-query"
import { Sparks, WarningTriangle } from "iconoir-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { AiProposal } from "@/lib/comaer/schema"
import type { DocumentInput } from "@/lib/comaer/types"
import { draftWithAiFn } from "@/server/documents-ai.fn"

/**
 * Redação assistida.
 *
 * O que volta do modelo é PROPOSTA: cai nos campos do formulário, onde o usuário edita
 * antes de qualquer coisa sair daqui. Nada é despachado direto.
 *
 * A recusa por sigilo é espelhada aqui só para explicar o botão desabilitado — quem
 * decide é a server function, porque o botão é do cliente e o endpoint é público.
 */
export function AiPanel({ input, onApply }: { input: DocumentInput; onApply: (proposal: AiProposal) => void }) {
	const [draft, setRascunho] = useState("")
	const [mode, setModo] = useState<"redigir" | "revisar">("redigir")

	const classified = input.classification !== "ostensivo"

	const generate = useMutation({
		mutationFn: () => draftWithAiFn({ data: { draft, kind: input.kind, scope: input.scope, classification: input.classification, mode } }),
		onSuccess: onApply,
	})

	return (
		<section className="border border-border p-4 flex flex-col gap-4">
			<div className="flex items-baseline justify-between gap-3">
				<h3 className="text-sm font-semibold tracking-tight uppercase">Redação assistida</h3>
				<span className="text-[11px] font-mono text-muted-foreground">NSCA 5-3, art. 38 e 39</span>
			</div>

			{classified ? (
				<div className="flex items-start gap-2 text-sm">
					<WarningTriangle className="size-4 shrink-0 mt-0.5 text-destructive" />
					<p className="text-muted-foreground">
						Documento com grau de sigilo <strong>{input.classification}</strong> não é enviado a provider de IA. Redija o texto manualmente.
					</p>
				</div>
			) : (
				<>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="ai-mode">O que fazer</Label>
						<Select value={mode} onValueChange={(value) => setModo(value as "redigir" | "revisar")}>
							<SelectTrigger id="ai-mode" className="w-full">
								<SelectValue>{mode === "redigir" ? "Redigir a partir de anotações" : "Revisar um texto já escrito"}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="redigir">Redigir a partir de anotações</SelectItem>
								<SelectItem value="revisar">Revisar um texto já escrito</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="ai-draft">{mode === "redigir" ? "Anotações, fatos e números" : "Texto a revisar"}</Label>
						<Textarea
							id="ai-draft"
							rows={6}
							value={draft}
							onChange={(e) => setRascunho(e.target.value)}
							placeholder={
								mode === "redigir"
									? "Ex.: pedir ao COMGEP prorrogação do prazo do levantamento de contratações; prazo atual vence em 30 set; motivo: 12 das 31 OM ainda não responderam"
									: "Cole aqui o texto que já escreveu."
							}
						/>
						<p className="text-xs text-muted-foreground">
							O modelo escreve assunto, parágrafos e referências. Numeração, NUP, OM, data e signatário continuam sendo seus — ele não os inventa.
						</p>
					</div>

					<Button type="button" size="sm" className="self-start" onClick={() => generate.mutate()} disabled={generate.isPending || draft.trim().length < 10}>
						<Sparks className="size-4" />
						{generate.isPending ? "Redigindo…" : mode === "redigir" ? "Redigir" : "Revisar"}
					</Button>

					{generate.error && (
						<p className="text-xs text-destructive">{generate.error instanceof Error ? generate.error.message : "Falha na redação assistida."}</p>
					)}
					{generate.isSuccess && <p className="text-xs text-muted-foreground">Proposta aplicada ao formulário — confira e ajuste antes de copiar.</p>}
				</>
			)}
		</section>
	)
}
