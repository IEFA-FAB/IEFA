import { toPng } from "html-to-image"
import * as XLSX from "xlsx"

export const exportToExcel = (data: object[], filename: string) => {
	const ws = XLSX.utils.json_to_sheet(data)
	const wb = XLSX.utils.book_new()
	XLSX.utils.book_append_sheet(wb, ws, "Dados")
	XLSX.writeFile(wb, `${filename}.xlsx`)
}

export const exportElementToImage = async (elementId: string, filename: string) => {
	const element = document.getElementById(elementId)
	if (!element) {
		return
	}

	try {
		const dataUrl = await toPng(element, {
			backgroundColor: "#ffffff",
			style: { transform: "scale(1)" },
			filter: (node) => {
				if ((node as HTMLElement).tagName === "BUTTON") return false
				return true
			},
		})
		const link = document.createElement("a")
		link.download = `${filename}.png`
		link.href = dataUrl
		link.click()
	} catch (_err) {}
}
