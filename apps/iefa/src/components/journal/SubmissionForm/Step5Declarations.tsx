// Step 5: Declarations (COI, Funding, Ethics)

import { Input, Label, Textarea } from "@iefa/ui";
import { useSubmissionForm } from "./SubmissionForm";

export function Step5Declarations() {
	const { formData, updateFormData } = useSubmissionForm();

	return (
		<div className="space-y-6">
			<div className="space-y-2">
				<Label htmlFor="conflict_of_interest">
					Declaração de Conflito de Interesse{" "}
					<span className="text-destructive">*</span>
				</Label>
				<Textarea
					id="conflict_of_interest"
					value={formData.conflict_of_interest || ""}
					onChange={(e) =>
						updateFormData({ conflict_of_interest: e.target.value })
					}
					placeholder="Descreva qualquer conflito de interesse ou declare que não há conflitos"
					rows={4}
				/>
				<p className="text-sm text-muted-foreground">
					Exemplo: "Os autores declaram não haver conflitos de interesse" ou
					descreva qualquer relação financeira ou pessoal relevante
				</p>
			</div>

			<div className="space-y-2">
				<Label htmlFor="funding_info">Informações de Financiamento</Label>
				<Textarea
					id="funding_info"
					value={formData.funding_info || ""}
					onChange={(e) => updateFormData({ funding_info: e.target.value })}
					placeholder="Informe agências de fomento, números de processos, etc."
					rows={3}
				/>
			</div>

			<div className="space-y-2">
				<Label htmlFor="data_availability">
					Declaração de Disponibilidade de Dados
				</Label>
				<Textarea
					id="data_availability"
					value={formData.data_availability || ""}
					onChange={(e) =>
						updateFormData({ data_availability: e.target.value })
					}
					placeholder="Informe como os dados podem ser acessados (repositório, sob demanda, etc.)"
					rows={3}
				/>
			</div>

			<div className="space-y-3">
				<div className="flex items-center space-x-2">
					<input
						id="has_ethics_approval"
						type="checkbox"
						checked={formData.has_ethics_approval || false}
						onChange={(e) =>
							updateFormData({ has_ethics_approval: e.target.checked })
						}
						className="size-4 rounded border-gray-300"
					/>
					<Label htmlFor="has_ethics_approval" className="cursor-pointer">
						Este estudo envolve seres humanos ou animais e possui aprovação de
						comitê de ética
					</Label>
				</div>

				{formData.has_ethics_approval && (
					<div className="space-y-2 ml-6">
						<Label htmlFor="ethics_approval">
							Número/Referência da Aprovação Ética
						</Label>
						<Input
							id="ethics_approval"
							value={formData.ethics_approval || ""}
							onChange={(e) =>
								updateFormData({ ethics_approval: e.target.value })
							}
							placeholder="Ex: CAAE 12345678.9.0000.0000"
						/>
					</div>
				)}
			</div>
		</div>
	);
}
