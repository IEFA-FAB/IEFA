// Step 3: Authors Management

import type { AuthorFormData } from "@/lib/journal/validation";
import { AuthorManager } from "../AuthorManager";
import { useSubmissionForm } from "./SubmissionForm";

export function Step3Authors() {
	const { formData, updateFormData } = useSubmissionForm();

	const handleAddAuthor = () => {
		const authors = formData.authors || [];
		const newAuthor: AuthorFormData = {
			full_name: "",
			email: "",
			affiliation: "",
			orcid: "",
			is_corresponding: authors.length === 0, // First author is corresponding by default
		};
		updateFormData({ authors: [...authors, newAuthor] });
	};

	return (
		<div>
			<AuthorManager
				authors={formData.authors || []}
				onChange={(authors) => updateFormData({ authors })}
				onAddAuthor={handleAddAuthor}
			/>
		</div>
	);
}
