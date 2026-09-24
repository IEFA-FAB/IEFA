import { type BarcodeReading, interpretBarcode } from "@iefa/sisub-domain"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { Barcode, Save } from "lucide-react"
import { useRef, useState } from "react"
import { requirePermission } from "@/auth/pbac"
import { describeReading } from "@/components/features/storage/scan/ScanInput"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/components/ui/toast"
import { fetchScannerProfileFn, saveScannerProfileFn } from "@/server/scanner.fn"

/**
 * "Testar leitor" — calibração do leitor de código de barras.
 *
 * Existe porque leitor em modo teclado é imprevisível: o intervalo entre
 * teclas varia por modelo (e despenca em sessão remota), alguns não enviam
 * terminador, e o separador GS do GS1-128 chega trocado ou não chega — quando
 * isso acontece, a validade entra dentro do campo de lote e ninguém percebe.
 * A tela mede o que o leitor DESTA estação faz e mostra o que o sistema
 * entendeu, campo por campo.
 */

export const Route = createFileRoute("/_protected/_modules/storage/$kitchenId/scanner")({
	beforeLoad: (opts) => requirePermission(opts, "storage", 1),
	loader: async ({ params }) => {
		const profile = await fetchScannerProfileFn({ data: { kitchenId: Number(params.kitchenId) } })
		return { profile }
	},
	component: ScannerCalibrationPage,
})

interface Sample {
	raw: string
	intervals: number[]
	reading: BarcodeReading
	at: string
}

function ScannerCalibrationPage() {
	const { profile } = Route.useLoaderData()
	const { kitchenId } = Route.useParams()
	const router = useRouter()

	const [form, setForm] = useState(profile)
	const [samples, setSamples] = useState<Sample[]>([])
	const [busy, setBusy] = useState(false)
	const buffer = useRef<{ intervals: number[]; last: number }>({ intervals: [], last: 0 })

	const config = { prefix: form.prefix ?? undefined, suffix: form.suffix ?? undefined, gsSubstitute: form.gsSubstitute ?? undefined }

	// O maior intervalo entre teclas é o que a calibração precisa cobrir: se o
	// limite ficar abaixo dele, a leitura é tratada como digitação.
	const measured = samples.flatMap((sample) => sample.intervals)
	const maxMeasured = measured.length > 0 ? Math.max(...measured) : null
	const suggestion = maxMeasured != null ? Math.min(500, Math.max(20, Math.ceil((maxMeasured * 1.5) / 10) * 10)) : null

	function record(raw: string) {
		const intervals = buffer.current.intervals
		const reading = interpretBarcode(raw, config)
		setSamples((previous) => [{ raw, intervals, reading, at: new Date().toLocaleTimeString("pt-BR") }, ...previous].slice(0, 8))
		buffer.current = { intervals: [], last: 0 }
	}

	async function save() {
		setBusy(true)
		try {
			await saveScannerProfileFn({ data: { kitchenId: Number(kitchenId), ...form } })
			toast.success("Perfil do leitor salvo")
			await router.invalidate()
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Erro ao salvar o perfil")
		} finally {
			setBusy(false)
		}
	}

	return (
		<div className="space-y-4">
			<PageHeader
				title="Testar leitor"
				description="Leia qualquer código abaixo. A tela mostra o que chegou, o intervalo entre as teclas e o que o sistema entendeu."
			/>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Barcode className="size-4" />
						Leitura de teste
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					<Input
						className="font-mono"
						placeholder="Leia um código aqui…"
						aria-label="Leitura de teste"
						onKeyDown={(event) => {
							const now = performance.now()
							if (event.key === "Enter" || event.key === "Tab") {
								event.preventDefault()
								const value = event.currentTarget.value
								if (value.trim() !== "") {
									record(value)
									event.currentTarget.value = ""
								}
								return
							}
							if (event.key.length === 1) {
								if (buffer.current.last > 0) buffer.current.intervals.push(Math.round(now - buffer.current.last))
								buffer.current.last = now
							}
						}}
					/>
					{maxMeasured != null && (
						<p className="text-sm text-muted-foreground">
							Maior intervalo medido entre teclas: <strong>{maxMeasured} ms</strong>
							{suggestion != null && suggestion !== form.maxKeyIntervalMs && (
								<>
									{" — "}
									<button type="button" className="underline" onClick={() => setForm((current) => ({ ...current, maxKeyIntervalMs: suggestion }))}>
										usar {suggestion} ms na calibração
									</button>
								</>
							)}
						</p>
					)}
					{samples.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma leitura ainda.</p>}
					<ul className="space-y-2">
						{samples.map((sample) => (
							<li key={`${sample.at}-${sample.raw}`} className="rounded-xl border p-3 text-sm">
								<div className="flex items-baseline justify-between gap-2">
									<code className="break-all font-mono text-xs">{visualizeControlChars(sample.raw)}</code>
									<span className="shrink-0 text-xs text-muted-foreground">{sample.at}</span>
								</div>
								<p className="mt-1">
									{sample.reading.kind === "unknown" ? (
										<span className="text-destructive">Não reconhecido — {sample.reading.reason}</span>
									) : (
										describeReading(sample.reading)
									)}
								</p>
								{sample.reading.kind === "gs1" && (
									<dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 text-xs text-muted-foreground">
										{Object.entries(sample.reading.fields.raw).map(([ai, value]) => (
											<div key={ai} className="contents">
												<dt className="font-mono">AI {ai}</dt>
												<dd className="font-mono">{value}</dd>
											</div>
										))}
									</dl>
								)}
								{sample.reading.kind === "gs1" && (sample.reading.fields.lotCode?.length ?? 0) > 12 && (
									<p className="mt-1 text-xs text-warning">
										O lote veio muito longo: provavelmente o separador GS não chegou e a validade entrou dentro dele. Configure o substituto do separador no
										leitor e abaixo.
									</p>
								)}
								{sample.intervals.length > 0 && (
									<p className="mt-1 text-xs text-muted-foreground">
										Intervalos: {sample.intervals.join(", ")} ms (máx {Math.max(...sample.intervals)} ms)
									</p>
								)}
							</li>
						))}
					</ul>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Calibração</CardTitle>
				</CardHeader>
				<CardContent className="grid gap-4 md:grid-cols-2">
					<div className="space-y-1">
						<Label htmlFor="interval">Intervalo máximo entre teclas (ms)</Label>
						<Input
							id="interval"
							type="number"
							min={10}
							max={500}
							value={form.maxKeyIntervalMs}
							onChange={(event) => setForm((c) => ({ ...c, maxKeyIntervalMs: Number(event.target.value) }))}
						/>
						<p className="text-xs text-muted-foreground">Acima disso a sequência é tratada como digitação, não leitura.</p>
					</div>
					<div className="space-y-1">
						<Label htmlFor="minLength">Comprimento mínimo</Label>
						<Input
							id="minLength"
							type="number"
							min={4}
							max={48}
							value={form.minLength}
							onChange={(event) => setForm((c) => ({ ...c, minLength: Number(event.target.value) }))}
						/>
						<p className="text-xs text-muted-foreground">EAN-8 e UPC-E têm 8 caracteres — não suba acima de 8 sem motivo.</p>
					</div>
					<div className="space-y-1">
						<Label htmlFor="terminator">Terminador enviado pelo leitor</Label>
						<Select value={form.terminator} onValueChange={(value) => setForm((c) => ({ ...c, terminator: (value ?? "enter") as typeof c.terminator }))}>
							<SelectTrigger id="terminator">
								<SelectValue>{{ enter: "Enter", tab: "Tab", none: "Nenhum (fecha por tempo)" }[form.terminator]}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="enter">Enter</SelectItem>
								<SelectItem value="tab">Tab</SelectItem>
								<SelectItem value="none">Nenhum (fecha por tempo)</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-1">
						<Label htmlFor="idle">Tempo sem teclas para fechar a leitura (ms)</Label>
						<Input
							id="idle"
							type="number"
							min={30}
							max={1000}
							value={form.idleTimeoutMs}
							onChange={(event) => setForm((c) => ({ ...c, idleTimeoutMs: Number(event.target.value) }))}
						/>
						<p className="text-xs text-muted-foreground">Vale para leitor que não envia terminador nenhum.</p>
					</div>
					<div className="space-y-1">
						<Label htmlFor="prefix">Prefixo a descartar</Label>
						<Input id="prefix" value={form.prefix ?? ""} maxLength={8} onChange={(event) => setForm((c) => ({ ...c, prefix: event.target.value || null }))} />
					</div>
					<div className="space-y-1">
						<Label htmlFor="suffix">Sufixo a descartar</Label>
						<Input id="suffix" value={form.suffix ?? ""} maxLength={8} onChange={(event) => setForm((c) => ({ ...c, suffix: event.target.value || null }))} />
					</div>
					<div className="space-y-1">
						<Label htmlFor="gs">Substituto do separador GS</Label>
						<Input
							id="gs"
							value={form.gsSubstitute ?? ""}
							maxLength={1}
							placeholder="ex.: |"
							onChange={(event) => setForm((c) => ({ ...c, gsSubstitute: event.target.value.slice(0, 1) || null }))}
						/>
						<p className="text-xs text-muted-foreground">Configure o mesmo caractere no leitor. Sem isso, lote e validade do GS1-128 chegam grudados.</p>
					</div>
					<div className="md:col-span-2">
						<Button type="button" onClick={save} disabled={busy}>
							<Save className="mr-2 size-4" />
							Salvar calibração
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	)
}

/** Mostra o separador GS e outros caracteres de controle em vez de nada. */
function visualizeControlChars(raw: string): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: é exatamente o que precisa aparecer para o operador
	return raw.replace(/[ -]/g, (char) => `[${char.charCodeAt(0)}]`)
}
