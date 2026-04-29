// Step 3: Authors Management

import type { AuthorFormData } from "@/lib/journal/validation"
import { AuthorManager } from "../AuthorManager"
import { useSubmissionForm } from "./SubmissionForm"

export function Step3Authors() {
	const { formData, updateFormData, fieldErrors } = useSubmissionForm()

	const handleAddAuthor = () => {
		const authors = formData.authors || []
		const newAuthor: AuthorFormData = {
			full_name: "",
			email: "",
			affiliation: "",
			orcid: "",
			is_corresponding: authors.length === 0, // First author is corresponding by default
		}
		updateFormData({ authors: [...authors, newAuthor] })
	}

	// Collect any author-related error (top-level or per-field)
	const authorError =
		fieldErrors.authors ||
		Object.entries(fieldErrors)
			.filter(([k]) => k.startsWith("authors."))
			.map(([, msg]) => msg)[0]

	return (
		<div className="space-y-3">
			{authorError && <p className="text-xs text-destructive">{authorError}</p>}
			<AuthorManager authors={formData.authors || []} onChange={(authors) => updateFormData({ authors })} onAddAuthor={handleAddAuthor} />
		</div>
	)
}
