// Step 4: File Upload

import { FileUploader } from "../FileUploader"
import { useSubmissionForm } from "./SubmissionForm"

export function Step4FileUpload() {
	const { formData, updateFormData } = useSubmissionForm()

	return (
		<div className="space-y-6">
			<FileUploader
				label="Manuscrito (PDF)"
				description="Arquivo PDF do artigo completo"
				required
				accept={{ "application/pdf": [".pdf"] }}
				maxSize={10 * 1024 * 1024}
				value={formData.pdf_file}
				onChange={(file) => updateFormData({ pdf_file: file as File })}
			/>

			<FileUploader
				label="Arquivo Fonte (Opcional)"
				description="Arquivo .typ ou .zip com o código-fonte Typst"
				accept={{
					"application/zip": [".zip"],
					"text/plain": [".typ"],
				}}
				maxSize={10 * 1024 * 1024}
				value={formData.source_file}
				onChange={(file) => updateFormData({ source_file: (file as File) || undefined })}
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
				value={formData.supplementary_files}
				onChange={(files) => updateFormData({ supplementary_files: (files as File[]) || [] })}
			/>

			<div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-900">
				<p className="text-sm text-blue-900 dark:text-blue-100">
					<strong>Dica:</strong> Certifique-se de que o PDF está anonimizado se a revista usa
					revisão duplo-cega.
				</p>
			</div>
		</div>
	)
}
