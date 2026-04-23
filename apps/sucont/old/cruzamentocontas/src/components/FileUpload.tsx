import { type ClassValue, clsx } from "clsx"
import { FileSpreadsheet, UploadCloud } from "lucide-react"
import type React from "react"
import { useCallback, useState } from "react"
import { twMerge } from "tailwind-merge"

function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

interface FileUploadProps {
	onFileSelect: (file: File) => void
	isLoading: boolean
}

export function FileUpload({ onFileSelect, isLoading }: FileUploadProps) {
	const [isDragging, setIsDragging] = useState(false)

	const handleDrag = useCallback((e: React.DragEvent) => {
		e.preventDefault()
		e.stopPropagation()
		if (e.type === "dragenter" || e.type === "dragover") {
			setIsDragging(true)
		} else if (e.type === "dragleave") {
			setIsDragging(false)
		}
	}, [])

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault()
			e.stopPropagation()
			setIsDragging(false)

			if (e.dataTransfer.files?.[0]) {
				onFileSelect(e.dataTransfer.files[0])
			}
		},
		[onFileSelect]
	)

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			e.preventDefault()
			if (e.target.files?.[0]) {
				onFileSelect(e.target.files[0])
			}
		},
		[onFileSelect]
	)

	return (
		<div className="w-full max-w-2xl mx-auto">
			<div
				className={cn(
					"relative flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-xl transition-all duration-200 ease-in-out",
					isDragging ? "border-blue-500 bg-blue-50/50" : "border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-slate-400",
					isLoading && "opacity-50 cursor-not-allowed pointer-events-none"
				)}
				onDragEnter={handleDrag}
				onDragLeave={handleDrag}
				onDragOver={handleDrag}
				onDrop={handleDrop}
			>
				<div className="flex flex-col items-center justify-center pt-5 pb-6">
					{isLoading ? (
						<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4" />
					) : (
						<UploadCloud className="w-12 h-12 mb-4 text-slate-500" />
					)}
					<p className="mb-2 text-sm text-slate-700 font-medium">
						<span className="font-semibold text-blue-600">Clique para enviar</span> ou arraste e solte
					</p>
					<p className="text-xs text-slate-500">Planilhas Excel (.xlsx, .xls) ou CSV</p>
				</div>
				<input
					id="dropzone-file"
					type="file"
					className="hidden"
					accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
					onChange={handleChange}
					disabled={isLoading}
				/>
				<label htmlFor="dropzone-file" className="absolute inset-0 cursor-pointer" />
			</div>

			<div className="mt-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
				<h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
					<FileSpreadsheet className="w-4 h-4 text-blue-600" />
					Requisitos da Planilha
				</h3>
				<ul className="text-sm text-slate-600 space-y-2 list-disc list-inside">
					<li>
						A planilha deve conter as colunas: <strong>UG</strong>, <strong>Conta Contábil</strong>, <strong>Conta Corrente</strong> e{" "}
						<strong>Saldo - R$</strong>.
					</li>
					<li>
						A análise fará o confronto entre as contas <strong>897210300</strong> e <strong>897110300</strong>.
					</li>
					<li>
						Apenas a UG <strong>120052</strong> deve ter saldo na conta 897210300. Qualquer outra UG com saldo nessa conta será apontada como inconsistência.
					</li>
					<li>Linhas em branco ou sem as informações obrigatórias serão ignoradas.</li>
				</ul>
			</div>
		</div>
	)
}
