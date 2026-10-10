// Step 4: File Upload
// Files are uploaded immediately on selection (not at submit time).
// Paths are persisted to article_versions via saveVersionDraftFn so they
// survive page reloads — the user never loses a file they already uploaded.

import { useState } from "react"
import { Alert } from "@/components/ui/alert"
import { uploadArticleFile } from "@/lib/journal/client"
import { saveVersionDraftFn } from "@/server/journal.fn"
import { FileUploader } from "../FileUploader"
import { useSubmissionForm } from "./SubmissionForm"

export function Step4FileUpload() {
	const { formData, updateFormData, currentArticleId, userId } = useSubmissionForm()

	const [uploadingPdf, setUploadingPdf] = useState(false)
	const [uploadingSource, setUploadingSource] = useState(false)
	const [uploadingSupplementary, setUploadingSupplementary] = useState(false)
	const [uploadError, setUploadError] = useState<string | null>(null)

	// Upload a file and persist the path via server function.
	// Returns the storage path or throws.
	const uploadAndSave = async (file: File, fileType: "manuscript" | "source" | "supplementary", index?: number): Promise<string> => {
		if (!currentArticleId) throw new Error("Salve o rascunho antes de fazer o upload")
		const path = await uploadArticleFile(currentArticleId, 1, file, fileType, index)
		return path
	}

	// Persist current paths to DB after any file change
	const persistPaths = async (overrides: { pdfPath?: string; sourcePath?: string; supplementaryPaths?: string[] }) => {
		if (!currentArticleId) return
		const pdfPath = overrides.pdfPath ?? formData.pdf_path
		if (!pdfPath) return // Need at least a PDF to create the version record

		await saveVersionDraftFn({
			data: {
				articleId: currentArticleId,
				userId,
				pdfPath,
				sourcePath: overrides.sourcePath ?? formData.source_path,
				supplementaryPaths: overrides.supplementaryPaths ?? formData.supplementary_paths,
			},
		})
	}

	const handlePdfChange = async (file: File | File[] | undefined) => {
		if (!file || Array.isArray(file)) return
		setUploadingPdf(true)
		setUploadError(null)
		try {
			const path = await uploadAndSave(file, "manuscript")
			updateFormData({ pdf_path: path })
			await persistPaths({ pdfPath: path })
		} catch (err) {
			setUploadError(err instanceof Error ? err.message : "Erro ao enviar PDF")
		} finally {
			setUploadingPdf(false)
		}
	}

	const handleSourceChange = async (file: File | File[] | undefined) => {
		if (!file || Array.isArray(file)) {
			updateFormData({ source_path: undefined })
			await persistPaths({ sourcePath: undefined })
			return
		}
		setUploadingSource(true)
		setUploadError(null)
		try {
			const path = await uploadAndSave(file, "source")
			updateFormData({ source_path: path })
			await persistPaths({ sourcePath: path })
		} catch (err) {
			setUploadError(err instanceof Error ? err.message : "Erro ao enviar arquivo fonte")
		} finally {
			setUploadingSource(false)
		}
	}

	const handleSupplementaryChange = async (files: File | File[] | undefined) => {
		const fileList = Array.isArray(files) ? files : files ? [files] : []
		if (fileList.length === 0) {
			updateFormData({ supplementary_paths: [] })
			await persistPaths({ supplementaryPaths: [] })
			return
		}
		setUploadingSupplementary(true)
		setUploadError(null)
		try {
			// Upload only newly added files (those without a path yet)
			// Existing paths are preserved as-is
			if (!currentArticleId) throw new Error("Salve o rascunho antes de fazer o upload")
			const existingPaths = formData.supplementary_paths ?? []
			const newPaths: string[] = []
			for (let i = 0; i < fileList.length; i++) {
				const path = await uploadArticleFile(currentArticleId, 1, fileList[i], "supplementary", existingPaths.length + i)
				newPaths.push(path)
			}
			const allPaths = [...existingPaths, ...newPaths]
			updateFormData({ supplementary_paths: allPaths })
			await persistPaths({ supplementaryPaths: allPaths })
		} catch (err) {
			setUploadError(err instanceof Error ? err.message : "Erro ao enviar arquivos suplementares")
		} finally {
			setUploadingSupplementary(false)
		}
	}

	const handleRemovePdf = async () => {
		updateFormData({ pdf_path: undefined })
		// Don't delete from storage — just clear the local path
	}

	const handleRemoveSource = async () => {
		updateFormData({ source_path: undefined })
		await persistPaths({ sourcePath: undefined })
	}

	const handleRemoveSupplementary = async (index?: number) => {
		const current = formData.supplementary_paths ?? []
		const updated = index !== undefined ? current.filter((_, i) => i !== index) : []
		updateFormData({ supplementary_paths: updated })
		await persistPaths({ supplementaryPaths: updated })
	}

	return (
		<div className="space-y-6">
			{uploadError && (
				<div className="p-3 bg-destructive/10 border border-destructive">
					<p className="text-sm text-destructive">{uploadError}</p>
				</div>
			)}

			{!currentArticleId && (
				<Alert variant="warning" role="note">
					<p>Salve o rascunho (botão abaixo) antes de fazer o upload dos arquivos.</p>
				</Alert>
			)}

			<FileUploader
				label="Manuscrito (PDF)"
				description="Arquivo PDF do artigo completo"
				required
				accept={{ "application/pdf": [".pdf"] }}
				maxSize={10 * 1024 * 1024}
				value={undefined}
				uploadedPath={formData.pdf_path}
				isUploading={uploadingPdf}
				onChange={handlePdfChange}
				onRemoveUploaded={handleRemovePdf}
			/>

			<FileUploader
				label="Arquivo Fonte (Opcional)"
				description="Arquivo .typ ou .zip com o código-fonte Typst"
				accept={{
					"application/zip": [".zip"],
					"text/plain": [".typ"],
				}}
				maxSize={10 * 1024 * 1024}
				value={undefined}
				uploadedPath={formData.source_path}
				isUploading={uploadingSource}
				onChange={handleSourceChange}
				onRemoveUploaded={handleRemoveSource}
			/>

			<FileUploader
				label="Materiais Suplementares (Opcional)"
				description="Dados, figuras adicionais, vídeos, etc."
				multiple
				maxFiles={10}
				maxSize={50 * 1024 * 1024}
				accept={{
					"image/*": [".png", ".jpg", ".jpeg"],
					"application/pdf": [".pdf"],
					"application/zip": [".zip"],
					"text/csv": [".csv"],
				}}
				value={undefined}
				uploadedPaths={formData.supplementary_paths}
				isUploading={uploadingSupplementary}
				onChange={handleSupplementaryChange}
				onRemoveUploaded={handleRemoveSupplementary}
			/>

			<Alert variant="info" role="note">
				<p>
					<strong>Dica:</strong> Certifique-se de que o PDF está anonimizado se a revista usa revisão duplo-cega.
				</p>
			</Alert>
		</div>
	)
}
