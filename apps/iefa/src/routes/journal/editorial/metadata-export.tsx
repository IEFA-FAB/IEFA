import { Button } from "@iefa/ui";
import { createFileRoute } from "@tanstack/react-router";
import { Download, FileText, Globe, Send } from "lucide-react";

export const Route = createFileRoute("/journal/editorial/metadata-export")({
	component: MetadataExport,
});

function MetadataExport() {
	// Placeholder - will use publishedArticlesQueryOptions
	const publishedArticles: any[] = [];

	const handleExportCrossref = () => {
		// TODO: Generate and download Crossref XML
		alert("Exportando metadados para Crossref...");
	};

	const handleExportJATS = () => {
		// TODO: Generate and download JATS XML
		alert("Exportando metadados em formato JATS...");
	};

	const handleExportDublinCore = () => {
		// TODO: Generate and download Dublin Core XML
		alert("Exportando metadados em formato Dublin Core...");
	};

	return (
		<div className="space-y-6">
			{/* Header */}
			<div>
				<h1 className="text-3xl font-bold tracking-tight">
					Exportar Metadados
				</h1>
				<p className="text-muted-foreground">
					Exporte metadados dos artigos publicados em diferentes formatos padrão
				</p>
			</div>

			{/* Export Options */}
			<div className="grid md:grid-cols-3 gap-6">
				{/* Crossref */}
				<div className="p-6 border rounded-lg bg-card space-y-4">
					<div className="size-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
						<Globe className="size-6 text-blue-600 dark:text-blue-400" />
					</div>
					<div>
						<h3 className="font-semibold text-lg mb-2">Crossref XML</h3>
						<p className="text-sm text-muted-foreground mb-4">
							Formato para registro de DOIs no sistema Crossref. Inclui todos os
							metadados necessários para indexação.
						</p>
					</div>
					<Button className="w-full" onClick={handleExportCrossref}>
						<Download className="size-4 mr-2" />
						Exportar Crossref
					</Button>
				</div>

				{/* JATS XML */}
				<div className="p-6 border rounded-lg bg-card space-y-4">
					<div className="size-12 rounded-lg bg-green-500/10 flex items-center justify-center">
						<FileText className="size-6 text-green-600 dark:text-green-400" />
					</div>
					<div>
						<h3 className="font-semibold text-lg mb-2">JATS XML</h3>
						<p className="text-sm text-muted-foreground mb-4">
							Journal Article Tag Suite - padrão para arquivamento e intercâmbio
							de artigos científicos.
						</p>
					</div>
					<Button className="w-full" onClick={handleExportJATS}>
						<Download className="size-4 mr-2" />
						Exportar JATS
					</Button>
				</div>

				{/* Dublin Core */}
				<div className="p-6 border rounded-lg bg-card space-y-4">
					<div className="size-12 rounded-lg bg-purple-500/10 flex items-center justify-center">
						<Send className="size-6 text-purple-600 dark:text-purple-400" />
					</div>
					<div>
						<h3 className="font-semibold text-lg mb-2">Dublin Core</h3>
						<p className="text-sm text-muted-foreground mb-4">
							Padrão de metadados para repositórios e sistemas de busca. Formato
							simples e amplamente adotado.
						</p>
					</div>
					<Button className="w-full" onClick={handleExportDublinCore}>
						<Download className="size-4 mr-2" />
						Exportar Dublin Core
					</Button>
				</div>
			</div>

			{/* Published Articles List */}
			<div className="space-y-4">
				<h2 className="text-xl font-semibold">Artigos Publicados</h2>
				<div className="border rounded-lg">
					<div className="p-4 border-b bg-muted">
						<div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 text-sm font-medium">
							<span>Título</span>
							<span>Volume/Edição</span>
							<span>DOI</span>
							<span>Publicado em</span>
							<span>Ações</span>
						</div>
					</div>

					{publishedArticles.length > 0 ? (
						<div className="divide-y">
							{publishedArticles.map((article) => (
								<div
									key={article.id}
									className="p-4 grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 text-sm items-center"
								>
									<span className="font-medium line-clamp-1">
										{article.title_pt}
									</span>
									<span className="text-muted-foreground">
										Vol. {article.volume}, Nº {article.issue}
									</span>
									<span className="font-mono text-xs">{article.doi}</span>
									<span className="text-muted-foreground">
										{new Date(article.published_at).toLocaleDateString("pt-BR")}
									</span>
									<Button size="sm" variant="outline">
										<Download className="size-4" />
									</Button>
								</div>
							))}
						</div>
					) : (
						<div className="p-12 text-center">
							<FileText className="size-12 mx-auto text-muted-foreground mb-3" />
							<p className="text-muted-foreground">
								Nenhum artigo publicado disponível para exportação
							</p>
						</div>
					)}
				</div>
			</div>

			{/* Information */}
			<div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-900">
				<h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
					ℹ️ Sobre a Exportação de Metadados
				</h3>
				<ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
					<li>
						Metadados são atualizados automaticamente após cada publicação
					</li>
					<li>Crossref XML deve ser enviado manualmente ao sistema Crossref</li>
					<li>JATS XML pode ser usado para depósito em repositórios</li>
					<li>Dublin Core facilita a descoberta por motores de busca</li>
				</ul>
			</div>
		</div>
	);
}
