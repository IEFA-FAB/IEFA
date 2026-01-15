import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
	Button,
	Label,
	Input,
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectItem,
	ScrollArea,
} from "@iefa/ui";
import { AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useUpdateSubstitutions } from "@/hooks/data/useSubstitutions";
import type { MenuItem } from "@/types/domain/planning";

interface SubstitutionModalProps {
	open: boolean;
	onClose: () => void;
	menuItem: MenuItem | null;
}

// Helper type for the snapshot structure
interface RecipeSnapshot {
	id: string;
	name: string;
	description?: string;
	ingredients?: Array<{
		product_id: string;
		product_name: string; // Assuming snapshot includes denormalized name
		quantity: number;
		measure_unit: string;
	}>;
	// ... other fields
}

export function SubstitutionModal({
	open,
	onClose,
	menuItem,
}: SubstitutionModalProps) {
	const [rationale, setRationale] = useState("");
	const [selectedIngredientId, setSelectedIngredientId] = useState<
		string | null
	>(null);
	const { mutate: updateSubstitutions, isPending } = useUpdateSubstitutions();

	// Safely parse recipe snapshot
	const recipe = menuItem?.recipe as unknown as RecipeSnapshot;
	const ingredients = recipe?.ingredients || [];

	const handleSave = () => {
		if (!menuItem) return;

		// In a real implementation we would capture:
		// - original_ingredient_id
		// - new_product_id (from a search/selector)
		// - quantity conversion

		const substitutions = {
			...(menuItem.substitutions as object),
			[selectedIngredientId || "generic"]: {
				type: "manual",
				rationale,
				updated_at: new Date().toISOString(),
			},
		};

		updateSubstitutions(
			{
				menuItemId: menuItem.id,
				substitutions,
			},
			{
				onSuccess: () => {
					onClose();
					setRationale("");
					setSelectedIngredientId(null);
				},
			},
		);
	};

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Substituições</DialogTitle>
					<DialogDescription>{recipe?.name || "Receita"}</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-4">
					<div className="bg-amber-50 border border-amber-100 p-3 rounded-md text-sm text-amber-800 flex items-start gap-2">
						<AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
						<p>
							Substituições alteram a ficha técnica apenas para este dia. O
							histórico original da receita é preservado.
						</p>
					</div>

					<ScrollArea className="h-48 border rounded-md p-2">
						{ingredients.length === 0 ? (
							<div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-4">
								<p>Não foi possível ler os ingredientes do snapshot.</p>
								<p className="text-xs opacity-70 mt-1">
									(Isso pode ocorrer se o snapshot for antigo ou estiver em
									formato incompatível)
								</p>
							</div>
						) : (
							<div className="space-y-2">
								{/* List ingredients to select for substitution */}
								{ingredients.map((ing, idx) => (
									<div
										key={idx}
										className={`p-2 rounded border cursor-pointer hover:bg-accent ${selectedIngredientId === ing.product_id ? "border-primary bg-primary/5" : ""}`}
										onClick={() => setSelectedIngredientId(ing.product_id)}
									>
										<div className="flex justify-between text-sm">
											<span className="font-medium">
												{ing.product_name || "Produto Inexistente"}
											</span>
											<span className="text-muted-foreground">
												{ing.quantity} {ing.measure_unit}
											</span>
										</div>
									</div>
								))}
							</div>
						)}
					</ScrollArea>

					<div className="space-y-2">
						<Label>Produto Substituto</Label>
						<Select disabled>
							<SelectTrigger>
								<SelectValue placeholder="Selecione um produto..." />
							</SelectTrigger>
							<SelectContent>{/* Populate with fetch */}</SelectContent>
						</Select>
						<p className="text-[10px] text-muted-foreground">
							* Seleção de produtos desativada nesta versão.
						</p>
					</div>

					<div className="space-y-2">
						<Label>Justificativa</Label>
						<Input
							value={rationale}
							onChange={(e) => setRationale(e.target.value)}
							placeholder="Ex: Produto em falta"
						/>
					</div>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancelar
					</Button>
					<Button onClick={handleSave} disabled={isPending || !rationale}>
						{isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
						Salvar Substituição
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
