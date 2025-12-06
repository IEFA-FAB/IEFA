// components/DefaultMessHallSelector.tsx

import {
	Button,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	Label,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@iefa/ui";
import { AlertTriangle, CheckCircle, Loader2, Settings } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useMessHalls } from "@/hooks/useMessHalls";

interface DefaultMessHallSelectorProps {
	defaultMessHallCode: string;
	setDefaultMessHallCode: (code: string) => void;
	onApply: () => Promise<void>; // pai persiste default + aplica aos cards + refetch
	onCancel: () => void;
	isApplying: boolean;
}

export const DefaultMessHallSelector = memo<DefaultMessHallSelectorProps>(
	({
		defaultMessHallCode,
		setDefaultMessHallCode,
		onApply,
		onCancel,
		isApplying,
	}) => {
		const { messHalls } = useMessHalls();
		const [saving, setSaving] = useState(false);

		const { selectedMessHallLabel, hasMessHalls } = useMemo(() => {
			const selected = messHalls.find((mh) => mh.code === defaultMessHallCode);
			return {
				selectedMessHallLabel: selected?.name || defaultMessHallCode,
				hasMessHalls: (messHalls?.length ?? 0) > 0,
			};
		}, [defaultMessHallCode, messHalls]);

		const handleMessHallChange = useCallback(
			(value: string) => {
				setDefaultMessHallCode(value); // apenas atualiza estado local (code)
			},
			[setDefaultMessHallCode],
		);

		const handleApply = useCallback(async () => {
			if (isApplying || saving) return;

			if (!defaultMessHallCode) {
				toast.error("Seleção inválida", {
					description: "Escolha um rancho para continuar.",
				});
				return;
			}

			setSaving(true);
			try {
				await onApply(); // pai faz: persistDefault + applyToCards + refetch
				toast.success("Preferência salva", {
					description: "Rancho padrão atualizado com sucesso.",
				});
			} catch (err) {
				console.error("Erro ao aplicar rancho padrão:", err);
				toast.error("Erro", {
					description: "Falha ao salvar sua preferência.",
				});
			} finally {
				setSaving(false);
			}
		}, [isApplying, saving, defaultMessHallCode, onApply]);

		const handleCancel = useCallback(() => {
			if (isApplying || saving) return;
			onCancel();
		}, [isApplying, saving, onCancel]);

		const selectItems = useMemo(() => {
			if (!messHalls || messHalls.length === 0) {
				return (
					<div className="px-2 py-4 text-sm text-muted-foreground">
						Nenhum rancho encontrado.
					</div>
				);
			}
			return messHalls.map((mh) => (
				<SelectItem
					key={mh.code}
					value={mh.code}
					className="
            cursor-pointer
            data-highlighted:bg-accent data-highlighted:text-accent-foreground
            focus:bg-accent/20
          "
				>
					{mh.name ?? mh.code}
				</SelectItem>
			));
		}, [messHalls]);

		return (
			<Card className="group relative w-full h-fit bg-card text-card-foreground border border-border shadow-sm transition-all duration-300 hover:shadow-md hover:border-accent max-w-xl">
				<CardHeader className="pb-4">
					<div className="flex items-start justify-between gap-3">
						<CardTitle className="text-foreground">
							<span className="flex items-center gap-2">
								<span className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-background text-foreground ring-1 ring-border">
									<Settings className="h-4.5 w-4.5" />
								</span>
								<span className="font-semibold">Configurar Rancho Padrão</span>
							</span>
						</CardTitle>
					</div>

					<CardDescription className="mt-3">
						<div className="flex gap-2 rounded-md border p-2.5 bg-accent/10 text-accent-foreground border-accent/30">
							<AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
							<span className="text-sm">
								Defina um rancho padrão para os cards que ainda não possuem
								rancho definido no banco de dados. Esta ação afetará apenas os
								cards sem rancho configurado.
							</span>
						</div>
					</CardDescription>
				</CardHeader>

				<CardContent className="space-y-6">
					<div className="space-y-3">
						<Label className="text-sm font-medium text-foreground">
							Selecione o rancho padrão:
						</Label>

						<Select
							value={defaultMessHallCode}
							onValueChange={handleMessHallChange}
							disabled={isApplying || saving || !hasMessHalls}
						>
							<SelectTrigger className="w-full cursor-pointer bg-background border border-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background hover:border-accent">
								<SelectValue
									placeholder={
										hasMessHalls
											? "Selecione um rancho..."
											: "Sem ranchos disponíveis"
									}
								/>
							</SelectTrigger>
							<SelectContent className="max-h-60">{selectItems}</SelectContent>
						</Select>

						{defaultMessHallCode && (
							<div className="flex items-center gap-2 text-xs rounded-md border p-2 bg-muted text-muted-foreground border-border">
								<CheckCircle className="h-3.5 w-3.5" />
								<span>
									Rancho selecionado:{" "}
									<strong className="text-foreground">
										{selectedMessHallLabel}
									</strong>
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
									<Loader2 className="h-4 w-4 animate-spin mr-2" />
									Aplicando...
								</>
							) : (
								<>
									<CheckCircle className="h-4 w-4 mr-2" />
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
		);
	},
);

DefaultMessHallSelector.displayName = "DefaultMessHallSelector";
