import { useMutation } from "@tanstack/react-query"
import { Sparks, WarningTriangle } from "iconoir-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { RedacaoIa } from "@/lib/comaer/schema"
import type { DocumentoInput } from "@/lib/comaer/tipos"
import { redigirComIaFn } from "@/server/documents-ai.fn"

/**
 * Redação assistida.
 *
 * O que volta do modelo é PROPOSTA: cai nos campos do formulário, onde o usuário edita
 * antes de qualquer coisa sair daqui. Nada é despachado direto.
 *
 * A recusa por sigilo é espelhada aqui só para explicar o botão desabilitado — quem
 * decide é a server function, porque o botão é do cliente e o endpoint é público.
 */
export function PainelIa({ input, onAplicar }: { input: DocumentoInput; onAplicar: (redacao: RedacaoIa) => void }) {
	const [rascunho, setRascunho] = useState("")
	const [modo, setModo] = useState<"redigir" | "revisar">("redigir")

	const classificado = input.sigilo !== "ostensivo"

	const gerar = useMutation({
		mutationFn: () => redigirComIaFn({ data: { rascunho, especie: input.especie, ambito: input.ambito, sigilo: input.sigilo, modo } }),
		onSuccess: onAplicar,
	})

	return (
		<section className="border border-border p-4 flex flex-col gap-4">
			<div className="flex items-baseline justify-between gap-3">
				<h3 className="text-sm font-semibold tracking-tight uppercase">Redação assistida</h3>
				<span className="text-[11px] font-mono text-muted-foreground">NSCA 5-3, art. 38 e 39</span>
			</div>

			{classificado ? (
				<div className="flex items-start gap-2 text-sm">
					<WarningTriangle className="size-4 shrink-0 mt-0.5 text-destructive" />
					<p className="text-muted-foreground">
						Documento com grau de sigilo <strong>{input.sigilo}</strong> não é enviado a provider de IA. Redija o texto manualmente.
					</p>
				</div>
			) : (
				<>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="ia-modo">O que fazer</Label>
						<Select value={modo} onValueChange={(valor) => setModo(valor as "redigir" | "revisar")}>
							<SelectTrigger id="ia-modo" className="w-full">
								<SelectValue>{modo === "redigir" ? "Redigir a partir de anotações" : "Revisar um texto já escrito"}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="redigir">Redigir a partir de anotações</SelectItem>
								<SelectItem value="revisar">Revisar um texto já escrito</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="ia-rascunho">{modo === "redigir" ? "Anotações, fatos e números" : "Texto a revisar"}</Label>
						<Textarea
							id="ia-rascunho"
							rows={6}
							value={rascunho}
							onChange={(e) => setRascunho(e.target.value)}
							placeholder={
								modo === "redigir"
									? "Ex.: pedir ao COMGEP prorrogação do prazo do levantamento de contratações; prazo atual vence em 30 set; motivo: 12 das 31 OM ainda não responderam"
									: "Cole aqui o texto que já escreveu."
							}
						/>
						<p className="text-xs text-muted-foreground">
							O modelo escreve assunto, parágrafos e referências. Numeração, NUP, OM, data e signatário continuam sendo seus — ele não os inventa.
						</p>
					</div>

					<Button type="button" size="sm" className="self-start" onClick={() => gerar.mutate()} disabled={gerar.isPending || rascunho.trim().length < 10}>
						<Sparks className="size-4" />
						{gerar.isPending ? "Redigindo…" : modo === "redigir" ? "Redigir" : "Revisar"}
					</Button>

					{gerar.error && <p className="text-xs text-destructive">{gerar.error instanceof Error ? gerar.error.message : "Falha na redação assistida."}</p>}
					{gerar.isSuccess && <p className="text-xs text-muted-foreground">Proposta aplicada ao formulário — confira e ajuste antes de copiar.</p>}
				</>
			)}
		</section>
	)
}
