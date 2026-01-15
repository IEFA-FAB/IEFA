import {
	Badge,
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	ScrollArea,
} from "@iefa/ui";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, Loader2 } from "lucide-react";
import { useState } from "react";
import { useApplyTemplate, useTemplates } from "@/hooks/data/usePlanning";
import { cn } from "@/lib/cn";

interface ApplyTemplateDialogProps {
	open: boolean;
	onClose: () => void;
	targetDates: string[]; // ISO strings
	kitchenId: number;
}

export function ApplyTemplateDialog({
	open,
	onClose,
	targetDates,
	kitchenId,
}: ApplyTemplateDialogProps) {
	const { data: templates, isLoading } = useTemplates(kitchenId);
	const { mutate: applyTemplate, isPending } = useApplyTemplate();
	const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
		null,
	);

	const handleApply = () => {
		if (!selectedTemplateId) return;

		applyTemplate(
			{
				templateId: selectedTemplateId,
				targetDates: targetDates.map((d) => new Date(d)),
				kitchenId,
			},
			{
				onSuccess: () => {
					onClose();
					setSelectedTemplateId(null);
				},
			},
		);
	};

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Aplicar Template</DialogTitle>
					<DialogDescription>
						Selecione um template para aplicar aos {targetDates.length} dias
						selecionados.
						<br />
						<span className="text-xs text-amber-600 font-medium">
							Atenção: Isso substituirá o planejamento existente para esses
							dias.
						</span>
					</DialogDescription>
				</DialogHeader>

				<div className="py-4 space-y-4">
					<div className="bg-muted/50 p-3 rounded-md text-sm">
						<span className="font-semibold block mb-1">Dias selecionados:</span>
						<div className="flex flex-wrap gap-1">
							{targetDates.map((d) => (
								<Badge key={d} variant="outline" className="bg-background">
									{format(new Date(d), "dd/MM", { locale: ptBR })}
								</Badge>
							))}
						</div>
					</div>

					<div className="space-y-2">
						<p className="text-sm font-medium">Templates Disponíveis</p>
						{isLoading ? (
							<div className="flex justify-center p-4">
								<Loader2 className="animate-spin text-muted-foreground" />
							</div>
						) : (
							<ScrollArea className="h-48 border rounded-md">
								<div className="p-2 space-y-2">
									{templates?.length === 0 && (
										<p className="text-center text-sm text-muted-foreground py-4">
											Nenhum template encontrado.
										</p>
									)}
									{templates?.map((tpl: any) => (
										<div
											key={tpl.id}
											onClick={() => setSelectedTemplateId(tpl.id)}
											className={cn(
												"p-3 rounded-md border cursor-pointer hover:bg-accent transition-colors flex items-center justify-between",
												selectedTemplateId === tpl.id
													? "border-primary bg-primary/5 ring-1 ring-primary"
													: "",
											)}
										>
											<div>
												<p className="font-medium text-sm">{tpl.name}</p>
												{tpl.description && (
													<p className="text-xs text-muted-foreground truncate max-w-[200px]">
														{tpl.description}
													</p>
												)}
											</div>
											{selectedTemplateId === tpl.id && (
												<Calendar className="w-4 h-4 text-primary" />
											)}
										</div>
									))}
								</div>
							</ScrollArea>
						)}
					</div>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancelar
					</Button>
					<Button
						onClick={handleApply}
						disabled={!selectedTemplateId || isPending}
					>
						{isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
						Aplicar Template
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
