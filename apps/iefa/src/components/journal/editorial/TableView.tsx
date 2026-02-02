import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@iefa/ui"
import { Link } from "@tanstack/react-router"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { useState } from "react"
import type { EditorialDashboardArticle } from "@/lib/journal/types"

interface TableViewProps {
	articles: EditorialDashboardArticle[]
}

type SortField = "submission_number" | "title_pt" | "status" | "submitted_at"
type SortDirection = "asc" | "desc"

export function TableView({ articles }: TableViewProps) {
	const [sortField, setSortField] = useState<SortField>("submitted_at")
	const [sortDirection, setSortDirection] = useState<SortDirection>("desc")

	const handleSort = (field: SortField) => {
		if (sortField === field) {
			setSortDirection(sortDirection === "asc" ? "desc" : "asc")
		} else {
			setSortField(field)
			setSortDirection("asc")
		}
	}

	const sortedArticles = [...articles].sort((a, b) => {
		let aValue: string | number | Date = a[sortField] ?? ""
		let bValue: string | number | Date = b[sortField] ?? ""

		if (sortField === "submitted_at") {
			aValue = new Date(aValue).getTime()
			bValue = new Date(bValue).getTime()
		}

		if (aValue < bValue) return sortDirection === "asc" ? -1 : 1
		if (aValue > bValue) return sortDirection === "asc" ? 1 : -1
		return 0
	})

	const SortIcon = ({ field }: { field: SortField }) => {
		if (sortField !== field) {
			return <ArrowUpDown className="size-4 ml-1" aria-hidden="true" />
		}
		return sortDirection === "asc" ? (
			<ArrowUp className="size-4 ml-1" aria-hidden="true" />
		) : (
			<ArrowDown className="size-4 ml-1" aria-hidden="true" />
		)
	}

	const getStatusLabel = (status: string) => {
		const labels: Record<string, string> = {
			submitted: "Submetido",
			under_review: "Em Revisão",
			revision_requested: "Revisão Solicitada",
			accepted: "Aceito",
			published: "Publicado",
			rejected: "Rejeitado",
		}
		return labels[status] || status
	}

	return (
		<div className="rounded-lg border bg-card">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>
							<button
								type="button"
								onClick={() => handleSort("submission_number")}
								className="flex items-center font-semibold hover:text-foreground"
							>
								ID
								<SortIcon field="submission_number" />
							</button>
						</TableHead>
						<TableHead>
							<button
								type="button"
								onClick={() => handleSort("title_pt")}
								className="flex items-center font-semibold hover:text-foreground"
							>
								Título
								<SortIcon field="title_pt" />
							</button>
						</TableHead>
						<TableHead>Autores</TableHead>
						<TableHead>
							<button
								type="button"
								onClick={() => handleSort("status")}
								className="flex items-center font-semibold hover:text-foreground"
							>
								Status
								<SortIcon field="status" />
							</button>
						</TableHead>
						<TableHead>
							<button
								type="button"
								onClick={() => handleSort("submitted_at")}
								className="flex items-center font-semibold hover:text-foreground"
							>
								Submetido
								<SortIcon field="submitted_at" />
							</button>
						</TableHead>
						<TableHead className="text-right">Dias Pendentes</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{sortedArticles.map((article) => {
						const daysSinceSubmission = article.submitted_at
							? Math.floor(
									(Date.now() - new Date(article.submitted_at).getTime()) / (1000 * 60 * 60 * 24)
								)
							: 0

						return (
							<TableRow key={article.id} className="hover:bg-muted/50">
								<TableCell className="font-mono text-sm">{article.submission_number}</TableCell>
								<TableCell>
									<Link
										to="/journal/editorial/articles/$articleId"
										params={{ articleId: article.id }}
										className="hover:underline font-medium line-clamp-2"
									>
										{article.title_pt}
									</Link>
								</TableCell>
								<TableCell className="text-sm text-muted-foreground">
									{article.submitter_name}
								</TableCell>
								<TableCell>
									<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted">
										{getStatusLabel(article.status)}
									</span>
								</TableCell>
								<TableCell className="text-sm text-muted-foreground">
									{article.submitted_at
										? formatDistanceToNow(new Date(article.submitted_at), {
												addSuffix: true,
												locale: ptBR,
											})
										: "-"}
								</TableCell>
								<TableCell className="text-right text-sm font-mono">
									{daysSinceSubmission > 0 ? (
										<span
											className={
												daysSinceSubmission > 14
													? "text-red-600 dark:text-red-400 font-semibold"
													: daysSinceSubmission > 7
														? "text-yellow-600 dark:text-yellow-400"
														: "text-green-600 dark:text-green-400"
											}
										>
											{daysSinceSubmission}d
										</span>
									) : (
										"-"
									)}
								</TableCell>
							</TableRow>
						)
					})}
				</TableBody>
			</Table>

			{sortedArticles.length === 0 && (
				<div className="flex items-center justify-center py-12 text-muted-foreground">
					Nenhum artigo encontrado
				</div>
			)}
		</div>
	)
}
