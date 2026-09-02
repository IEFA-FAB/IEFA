import { createFileRoute, redirect } from "@tanstack/react-router"
import { Printer, RefreshDouble } from "iconoir-react"
import { useEffect, useMemo, useState } from "react"
import { authQueryOptions } from "@/auth/service"
import { FolhaA4 } from "@/components/comaer/FolhaA4"
import { FormularioDocumento } from "@/components/comaer/FormularioDocumento"
import { PainelDocumentos } from "@/components/comaer/PainelDocumentos"
import { PainelExportacao } from "@/components/comaer/PainelExportacao"
import { PainelIa } from "@/components/comaer/PainelIa"
import { Button } from "@/components/ui/button"
import { buscarEspecie } from "@/lib/comaer/especies"
import { montarDocumento } from "@/lib/comaer/montar"
import { carregarRascunho, limparRascunho, rascunhoInicial, salvarRascunho } from "@/lib/comaer/rascunho"
import type { RedacaoIa } from "@/lib/comaer/schema"
import type { DocumentoInput } from "@/lib/comaer/tipos"

export const Route = createFileRoute("/_public/_en/facilities/comunicacoes-oficiais")({
	staticData: {
		nav: {
			title: "Comunicações Oficiais",
			section: "Facilidades",
			subtitle: "Redigir ofício, despacho, parecer e demais espécies conforme a NSCA 5-3",
			keywords: ["oficio", "despacho", "parecer", "requerimento", "nsca", "sigadaer", "redacao oficial"],
			order: 21,
		},
	},
	/**
	 * Exige sessão: a ferramenta grava documento no schema `documents` e chama modelo, e as
	 * duas coisas têm dono. O guard real está nas server functions — este `beforeLoad` só
	 * evita mostrar uma tela que não funcionaria.
	 */
	beforeLoad: async ({ context }) => {
		const auth = await context.queryClient.query({ ...authQueryOptions(), staleTime: "static" })
		if (!auth.isAuthenticated) throw redirect({ to: "/auth" })
		return { auth }
	},
	component: ComunicacoesOficiais,
	head: () => {
		const baseUrl = import.meta.env.VITE_PUBLIC_URL ?? ""
		const title = "Comunicações Oficiais — Portal IEFA"
		const description =
			"Redação de comunicações oficiais do COMAER conforme a NSCA 5-3/2026: ofício, despacho, parecer, requerimento, ata e demais espécies, com saída pronta para colar no SIGADAER."
		return {
			meta: [
				{ title },
				{ name: "description", content: description },
				{ property: "og:title", content: title },
				{ property: "og:description", content: description },
				{ property: "og:url", content: `${baseUrl}/facilities/comunicacoes-oficiais` },
			],
		}
	},
})

/**
 * Redator de comunicações oficiais (NSCA 5-3/2026, Anexo I).
 *
 * A saída principal é a área de transferência, não o papel: o despacho acontece no
 * SIGADAER. A impressão existe, mas é o caminho secundário.
 *
 * Tudo mora no navegador — não há server function nem gravação. O conteúdo pode ser
 * classificado (art. 7º § 2º) e não há razão para ele sair da máquina de quem redige antes
 * de o próprio SIGADAER recebê-lo.
 */
function ComunicacoesOficiais() {
	const [input, setInput] = useState<DocumentoInput>(rascunhoInicial)
	const [documentoId, setDocumentoId] = useState<string | null>(null)
	const [restaurado, setRestaurado] = useState(false)

	// O rascunho só é lido no cliente: ler no SSR entregaria HTML diferente do que o
	// navegador montaria e a hidratação descartaria a árvore.
	useEffect(() => {
		const salvo = carregarRascunho()
		if (salvo) setInput(salvo)
		setRestaurado(true)
	}, [])

	useEffect(() => {
		if (restaurado) salvarRascunho(input)
	}, [input, restaurado])

	const especie = buscarEspecie(input.especie) ?? buscarEspecie("oficio-comaer")
	const doc = useMemo(() => (especie ? montarDocumento({ ...input, especie: especie.id }) : null), [input, especie])

	const alterar = (patch: Partial<DocumentoInput>) => setInput((atual) => ({ ...atual, ...patch }))

	/**
	 * A proposta do modelo entra só nos campos de texto, e apenas onde ele de fato
	 * escreveu: referências e anexos ausentes na resposta não apagam o que o usuário já
	 * tinha digitado.
	 */
	const aplicarRedacao = (redacao: RedacaoIa) =>
		setInput((atual) => ({
			...atual,
			assunto: redacao.assunto ?? atual.assunto,
			paragrafos: redacao.paragrafos,
			referencias: redacao.referencias ?? atual.referencias,
			anexos: redacao.anexos ?? atual.anexos,
		}))

	const comecarNovo = () => {
		limparRascunho()
		setInput(rascunhoInicial())
		setDocumentoId(null)
	}

	if (!especie || !doc) return null

	return (
		<div className="w-full py-10">
			<style>{`
				@media print {
					@page { size: A4; margin: 2cm 2cm 2cm 3cm; }
					body * { visibility: hidden; }
					[data-folha], [data-folha] * { visibility: visible; }
					[data-folha] { position: absolute; left: 0; top: 0; width: 100%; }
				}
			`}</style>

			<header data-imprimir-oculto className="flex flex-wrap items-end justify-between gap-4 mb-8">
				<div>
					<h1 className="text-3xl md:text-4xl font-bold tracking-tight text-balance">Comunicações Oficiais</h1>
					<p className="text-muted-foreground mt-2 text-pretty max-w-2xl">
						Redação conforme a{" "}
						<a href="/docs/NSCA 5-3.pdf" className="underline underline-offset-4" target="_blank" rel="noreferrer">
							NSCA 5-3/2026
						</a>{" "}
						(Portaria GABAER/GC3 nº 1.574, de 4 de fevereiro de 2026), que revogou a NSCA 10-2/2019. A saída é pronta para colar no SIGADAER, campo a campo.
					</p>
				</div>
				<div className="flex gap-2">
					<Button type="button" variant="outline" size="sm" onClick={comecarNovo}>
						<RefreshDouble className="size-4" /> Novo
					</Button>
					<Button type="button" size="sm" onClick={() => window.print()}>
						<Printer className="size-4" /> Imprimir
					</Button>
				</div>
			</header>

			<div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_auto] gap-8 items-start">
				<div data-imprimir-oculto className="flex flex-col gap-8 min-w-0">
					<PainelDocumentos
						input={input}
						documentoId={documentoId}
						onAbrir={(documento, id) => {
							setInput(documento)
							setDocumentoId(id)
						}}
						onNovo={comecarNovo}
						onSalvo={setDocumentoId}
					/>
					<PainelIa input={input} onAplicar={aplicarRedacao} />
					<FormularioDocumento input={input} especie={especie} onChange={alterar} />
					<PainelExportacao doc={doc} />
				</div>

				{/* A folha acompanha a rolagem do formulário: conferir o efeito de um campo
				    exige vê-lo, e no desktop há largura de sobra para os dois. */}
				<div className="overflow-x-auto xl:sticky xl:top-20">
					<FolhaA4 doc={doc} />
				</div>
			</div>
		</div>
	)
}
