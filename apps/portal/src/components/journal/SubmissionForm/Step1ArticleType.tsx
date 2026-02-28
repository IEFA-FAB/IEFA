// Step 1: Article Type and Subject Area Selection

import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@iefa/ui"
import { useSubmissionForm } from "./SubmissionForm"

const ARTICLE_TYPES = [
	{ value: "research", label: "Artigo de Pesquisa" },
	{ value: "review", label: "Artigo de Revisão" },
	{ value: "short_communication", label: "Comunicação Breve" },
	{ value: "editorial", label: "Editorial" },
] as const

const SUBJECT_AREAS = [
	"Ciências Biológicas",
	"Ciências da Saúde",
	"Ciências Exatas e da Terra",
	"Ciências Humanas",
	"Ciências Sociais Aplicadas",
	"Engenharias",
	"Linguística, Letras e Artes",
]

export function Step1ArticleType() {
	const { formData, updateFormData } = useSubmissionForm()

	return (
		<div className="space-y-6">
			<div className="space-y-2">
				<Label htmlFor="article_type">
					Tipo de Artigo <span className="text-destructive">*</span>
				</Label>
				<Select
					value={formData.article_type ?? undefined}
					onValueChange={(value) => updateFormData({ article_type: value ?? undefined })}
				>
					<SelectTrigger id="article_type">
						<SelectValue placeholder="Selecione o tipo de artigo" />
					</SelectTrigger>
					<SelectContent>
						{ARTICLE_TYPES.map((type) => (
							<SelectItem key={type.value} value={type.value}>
								{type.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<p className="text-sm text-muted-foreground">
					Escolha o tipo de artigo que melhor descreve sua submissão
				</p>
			</div>

			<div className="space-y-2">
				<Label htmlFor="subject_area">
					Área de Conhecimento <span className="text-destructive">*</span>
				</Label>
				<Select
					value={formData.subject_area ?? undefined}
					onValueChange={(value) => updateFormData({ subject_area: value ?? undefined })}
				>
					<SelectTrigger id="subject_area">
						<SelectValue placeholder="Selecione a área de conhecimento" />
					</SelectTrigger>
					<SelectContent>
						{SUBJECT_AREAS.map((area) => (
							<SelectItem key={area} value={area}>
								{area}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<p className="text-sm text-muted-foreground">
					Selecione a área que melhor representa o conteúdo do artigo
				</p>
			</div>
		</div>
	)
}
