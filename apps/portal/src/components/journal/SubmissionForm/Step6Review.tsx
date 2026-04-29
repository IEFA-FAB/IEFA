// Step 6: Review and Submit

import { Globe, Group, Page } from "iconoir-react"
import { useSubmissionForm } from "./SubmissionForm"

const ARTICLE_TYPE_LABELS: Record<string, string> = {
	research: "Artigo de Pesquisa",
	review: "Artigo de Revisão",
	short_communication: "Comunicação Breve",
	editorial: "Editorial",
}

export function Step6Review() {
	const { formData } = useSubmissionForm()

	return (
		<div className="space-y-6">
			<p className="text-muted-foreground">
				Revise todas as informações antes de submeter seu artigo. Após a submissão, você não poderá editar estes dados até receber um pedido de revisão.
			</p>

			{/* Article Type */}
			<div className="p-4 border rounded-lg">
				<h3 className="font-medium mb-3 flex items-center gap-2">
					<Page className="size-5" />
					Tipo de Artigo e Área
				</h3>
				<dl className="space-y-2 text-sm">
					<div>
						<dt className="text-muted-foreground">Tipo:</dt>
						<dd className="font-medium">{formData.article_type ? (ARTICLE_TYPE_LABELS[formData.article_type] ?? formData.article_type) : "—"}</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">Área de Conhecimento:</dt>
						<dd className="font-medium">{formData.subject_area}</dd>
					</div>
				</dl>
			</div>

			{/* Metadata */}
			<div className="p-4 border rounded-lg">
				<h3 className="font-medium mb-3 flex items-center gap-2">
					<Globe className="size-5" />
					Metadados
				</h3>
				<div className="space-y-4 text-sm">
					<div>
						<dt className="text-muted-foreground font-medium">Título (PT/EN):</dt>
						<dd className="mt-1">{formData.title_pt}</dd>
						<dd className="mt-1 text-muted-foreground italic">{formData.title_en}</dd>
					</div>
					<div>
						<dt className="text-muted-foreground font-medium">Palavras-chave (PT):</dt>
						<dd className="mt-1">{(formData.keywords_pt || []).join(", ")}</dd>
					</div>
					<div>
						<dt className="text-muted-foreground font-medium">Keywords (EN):</dt>
						<dd className="mt-1">{(formData.keywords_en || []).join(", ")}</dd>
					</div>
				</div>
			</div>

			{/* Authors */}
			<div className="p-4 border rounded-lg">
				<h3 className="font-medium mb-3 flex items-center gap-2">
					<Group className="size-5" />
					Autores ({(formData.authors || []).length})
				</h3>
				<div className="space-y-2 text-sm">
					{(formData.authors || []).map((author, index) => (
						<div key={index} className="flex items-start gap-2 p-2 bg-muted rounded">
							<span className="font-medium">{index + 1}.</span>
							<div className="flex-1">
								<div className="font-medium">
									{author.full_name}
									{author.is_corresponding && <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">Correspondente</span>}
								</div>
								{author.affiliation && <div className="text-muted-foreground">{author.affiliation}</div>}
								{author.orcid && <div className="text-xs text-muted-foreground">ORCID: {author.orcid}</div>}
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Files */}
			<div className="p-4 border rounded-lg">
				<h3 className="font-medium mb-3">Arquivos</h3>
				<div className="space-y-2 text-sm">
					{formData.pdf_path ? (
						<div>✓ Manuscrito PDF: {formData.pdf_path.split("/").pop()}</div>
					) : (
						<div className="text-destructive">✗ Manuscrito PDF não enviado</div>
					)}
					{formData.source_path && <div>✓ Arquivo Fonte: {formData.source_path.split("/").pop()}</div>}
					{(formData.supplementary_paths?.length ?? 0) > 0 && <div>✓ {formData.supplementary_paths!.length} arquivo(s) suplementar(es)</div>}
				</div>
			</div>

			{/* Declarations */}
			<div className="p-4 border rounded-lg">
				<h3 className="font-medium mb-3">Declarações</h3>
				<div className="space-y-3 text-sm">
					<div>
						<dt className="text-muted-foreground font-medium">Conflito de Interesse:</dt>
						<dd className="mt-1 text-xs">
							{formData.conflict_of_interest?.substring(0, 150)}
							{(formData.conflict_of_interest?.length || 0) > 150 ? "..." : ""}
						</dd>
					</div>
					{formData.has_ethics_approval && <div>✓ Aprovação de comitê de ética: {formData.ethics_approval}</div>}
				</div>
			</div>

			<div className="p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg border border-yellow-200 dark:border-yellow-900">
				<p className="text-sm text-yellow-900 dark:text-yellow-100">
					<strong>Atenção:</strong> Ao clicar em "Submeter Artigo", você confirma que todos os dados estão corretos e que o manuscrito está pronto para revisão
					por pares.
				</p>
			</div>
		</div>
	)
}
