import { toast } from "sonner"
import { useProductsHierarchy } from "@/hooks/data/useProductsHierarchy"
import type { ProductItem } from "@/types/domain/products"

/**
 * Hook de negócio para exportar dados de produtos em CSV
 * Orquestra múltiplos dados e gerencia lógica de export
 *
 * Segue padrão: hooks/business/ contém lógica de negócio complexa
 */
export function useExportProductsCSV() {
	const { flatTree } = useProductsHierarchy("")

	const exportCSV = () => {
		if (!flatTree || flatTree.nodes.length === 0) {
			toast.error("Nenhum dado para exportar")
			return
		}

		// Helper para escapar aspas duplas em CSV
		const escapeCSV = (value: string | null | undefined): string => {
			if (!value) return ""
			// Escapar aspas duplas duplicando-as
			return value.replace(/"/g, '""')
		}

		// Helper para obter caminho da pasta pai
		const getFolderPath = (node: { parentId: string | null }): string => {
			if (!node.parentId) return ""
			const parent = flatTree.byId[node.parentId]
			if (!parent) return ""
			return parent.label
		}

		// Header CSV
		const header = "Tipo,Pasta,Nome,Unidade Medida,Fator Correção,Código Barras\n"

		// Processar cada nó da árvore
		const rows = flatTree.nodes
			.map((node) => {
				let type = ""
				let folder = ""
				let name = ""
				let unit = ""
				let factor = ""
				let barcode = ""

				if (node.type === "folder") {
					type = "Pasta"
					name = node.label
					// Se a pasta tem pai, mostrar caminho
					if (node.parentId) {
						folder = getFolderPath(node)
					}
				} else if (node.type === "product") {
					type = "Produto"
					name = node.label
					folder = getFolderPath(node)
				} else if (node.type === "product_item") {
					type = "Item de Compra"
					name = node.label
					folder = getFolderPath(node)

					const itemData = node.data as ProductItem
					unit = itemData.measure_unit || ""
					factor = itemData.correction_factor?.toString() || ""
					barcode = itemData.barcode || ""
				}

				// Construir linha CSV com valores escapados
				return `"${escapeCSV(type)}","${escapeCSV(folder)}","${escapeCSV(name)}","${escapeCSV(unit)}","${escapeCSV(factor)}","${escapeCSV(barcode)}"`
			})
			.join("\n")

		// Adicionar BOM UTF-8 para compatibilidade com Excel
		const csv = `\uFEFF${header}${rows}`

		// Criar blob e fazer download
		const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
		const url = URL.createObjectURL(blob)
		const link = document.createElement("a")
		link.href = url
		link.download = `insumos_${new Date().toISOString().split("T")[0]}.csv`
		link.click()
		URL.revokeObjectURL(url)

		toast.success("CSV exportado com sucesso!")
	}

	return { exportCSV }
}
