import download from "downloadjs"
import { toPng } from "html-to-image"
import * as XLSX from "xlsx"

// Export an array of objects to Excel
export const exportToExcel = (data: any[], filename: string) => {
	const ws = XLSX.utils.json_to_sheet(data)
	const wb = XLSX.utils.book_new()
	XLSX.utils.book_append_sheet(wb, ws, "Dados")
	XLSX.writeFile(wb, `${filename}.xlsx`)
}

// Export a specific HTML element to PNG
export const exportElementToImage = async (elementId: string, filename: string) => {
	const element = document.getElementById(elementId)
	if (!element) {
		return
	}

	try {
		const dataUrl = await toPng(element, {
			backgroundColor: "#ffffff",
			style: {
				transform: "scale(1)",
			},
			filter: (node) => {
				// filter out buttons from the exported image
				if (node.tagName === "BUTTON") return false
				return true
			},
		})
		download(dataUrl, `${filename}.png`)
	} catch (_err) {}
}
