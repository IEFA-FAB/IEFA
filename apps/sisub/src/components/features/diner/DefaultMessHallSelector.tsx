// components/DefaultMessHallSelector.tsx

import { AlertTriangle, CheckCircle, Loader2, Settings } from "lucide-react"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { toast } from "@/components/ui/toast"
import { useMessHalls } from "@/hooks/data/useMessHalls"

interface DefaultMessHallSelectorProps {
	defaultMessHallCode: string
	setDefaultMessHallCode: (code: string) => void
	onApply: () => Promise<void> // pai persiste default + aplica aos cards + refetch
	onCancel: () => void
	isApplying: boolean
}

export function DefaultMessHallSelector({ defaultMessHallCode, setDefaultMessHallCode, onApply, onCancel, isApplying }: DefaultMessHallSelectorProps) {
	"use no memo"
	const { messHalls } = useMessHalls()
	const [saving, setSaving] = useState(false)

	const selected = messHalls.find((mh) => mh.code === defaultMessHallCode)
	const selectedMessHallLabel = selected?.display_name || defaultMessHallCode
	const hasMessHalls = (messHalls?.length ?? 0) > 0
	// ~70 ranchos: a lista só é percorrível com busca.
	const messHallOptions = useMemo(() => (messHalls ?? []).map((mh) => ({ value: mh.code, label: mh.display_name ?? mh.code, keywords: mh.code })), [messHalls])

	const handleMessHallChange = (value: string | null) => {
		if (!value) return
		setDefaultMessHallCode(value) // apenas atualiza estado local (code)
	}

	const handleApply = async () => {
		"use no memo"
		if (isApplying || saving) return

		if (!defaultMessHallCode) {
			toast.error("Seleção inválida", {
				description: "Escolha um rancho para continuar.",
			})
			return
		}

		setSaving(true)
		try {
			await onApply() // pai faz: persistDefault + applyToCards + refetch
			toast.success("Preferência salva", {
				description: "Rancho padrão atualizado com sucesso.",
			})
		} catch (_err) {
			toast.error("Erro", {
				description: "Falha ao salvar sua preferência.",
			})
		} finally {
			setSaving(false)
		}
	}

	const handleCancel = () => {
		if (isApplying || saving) return
		onCancel()
	}

	return (
		<Card className="group relative w-full h-fit bg-card text-card-foreground border border-border transition-all duration-300 hover:border-accent max-w-xl">
			<CardHeader className="pb-4">
				<div className="flex items-start justify-between gap-3">
					<CardTitle className="text-foreground">
						<span className="flex items-center gap-2">
							<span className="inline-flex items-center justify-center size-8 rounded-lg bg-background text-foreground ring-1 ring-border">
								<Settings className="size-4.5" />
							</span>
							<span className="text-subheading">Configurar Rancho Padrão</span>
						</span>
					</CardTitle>
				</div>

				<CardDescription className="mt-3">
					<div className="flex gap-2 rounded-md border p-2.5 bg-accent/10 text-accent-foreground border-accent/30">
						<AlertTriangle className="size-4 mt-0.5 shrink-0" />
						<span className="text-sm">
							Defina um rancho padrão para os cards que ainda não possuem rancho definido no banco de dados. Esta ação afetará apenas os cards sem rancho
							configurado.
						</span>
					</div>
				</CardDescription>
			</CardHeader>

			<CardContent className="space-y-6">
				<div className="space-y-3">
					<Label className="text-subheading">Selecione o rancho padrão:</Label>

					<SearchableSelect
						value={defaultMessHallCode || null}
						onValueChange={handleMessHallChange}
						options={messHallOptions}
						disabled={isApplying || saving || !hasMessHalls}
						placeholder={hasMessHalls ? "Selecione um rancho..." : "Sem ranchos disponíveis"}
						searchPlaceholder="Pesquisar rancho…"
						emptyLabel="Nenhum rancho encontrado."
						className="bg-background hover:border-accent"
						aria-label="Rancho padrão"
					/>

					{defaultMessHallCode && (
						<div className="flex items-center gap-2 text-xs rounded-md border p-2 bg-muted text-muted-foreground border-border">
							<CheckCircle className="size-3.5" />
							<span>
								Rancho selecionado: <strong className="text-foreground">{selectedMessHallLabel}</strong>
							</span>
						</div>
					)}
				</div>

				<div className="border-t border-border pt-4 flex flex-row-reverse gap-4">
					<Button
						size="sm"
						onClick={handleApply}
						disabled={isApplying || saving || !defaultMessHallCode}
						className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{isApplying || saving ? (
							<>
								<Loader2 className="size-4 animate-spin mr-2" />
								Aplicando...
							</>
						) : (
							<>
								<CheckCircle className="size-4 mr-2" />
								Aplicar
							</>
						)}
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={handleCancel}
						disabled={isApplying || saving}
						className="hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
					>
						Cancelar
					</Button>
				</div>
			</CardContent>
		</Card>
	)
}
