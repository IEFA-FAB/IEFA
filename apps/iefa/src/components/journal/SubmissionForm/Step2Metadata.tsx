// Step 2: Bilingual Metadata (Titles, Abstracts, Keywords)

import { Button, Input, Label, Textarea } from "@iefa/ui";
import { X } from "lucide-react";
import { useState } from "react";
import { useSubmissionForm } from "./SubmissionForm";

export function Step2Metadata() {
	const { formData, updateFormData } = useSubmissionForm();
	const [keywordInputPT, setKeywordInputPT] = useState("");
	const [keywordInputEN, setKeywordInputEN] = useState("");

	const addKeyword = (lang: "pt" | "en") => {
		const input = lang === "pt" ? keywordInputPT : keywordInputEN;
		if (!input.trim()) return;

		const key = lang === "pt" ? "keywords_pt" : "keywords_en";
		const current = formData[key] || [];
		if (current.length >= 6) return;

		updateFormData({ [key]: [...current, input.trim()] });
		lang === "pt" ? setKeywordInputPT("") : setKeywordInputEN("");
	};

	const removeKeyword = (lang: "pt" | "en", index: number) => {
		const key = lang === "pt" ? "keywords_pt" : "keywords_en";
		const current = formData[key] || [];
		updateFormData({ [key]: current.filter((_, i) => i !== index) });
	};

	return (
		<div className="space-y-6">
			{/* Portuguese Section */}
			<div className="p-4 border rounded-lg space-y-4">
				<h3 className="font-medium">Português</h3>

				<div className="space-y-2">
					<Label htmlFor="title_pt">
						Título <span className="text-destructive">*</span>
					</Label>
					<Input
						id="title_pt"
						value={formData.title_pt || ""}
						onChange={(e) => updateFormData({ title_pt: e.target.value })}
						placeholder="Título do artigo em português"
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="abstract_pt">
						Resumo <span className="text-destructive">*</span>
					</Label>
					<Textarea
						id="abstract_pt"
						value={formData.abstract_pt || ""}
						onChange={(e) => updateFormData({ abstract_pt: e.target.value })}
						placeholder="Resumo do artigo em português (máx. 500 palavras)"
						rows={6}
					/>
					<p className="text-xs text-muted-foreground">
						{(formData.abstract_pt || "").split(/\s+/).filter(Boolean).length} /
						500 palavras
					</p>
				</div>

				<div className="space-y-2">
					<Label htmlFor="keywords_pt">
						Palavras-chave <span className="text-destructive">*</span>
					</Label>
					<div className="flex gap-2">
						<Input
							id="keywords_pt"
							value={keywordInputPT}
							onChange={(e) => setKeywordInputPT(e.target.value)}
							onKeyPress={(e) =>
								e.key === "Enter" && (e.preventDefault(), addKeyword("pt"))
							}
							placeholder="Digite e pressione Enter"
						/>
						<Button type="button" onClick={() => addKeyword("pt")}>
							Adicionar
						</Button>
					</div>
					<div className="flex flex-wrap gap-2 mt-2">
						{(formData.keywords_pt || []).map((kw, i) => (
							<span
								key={i}
								className="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm"
							>
								{kw}
								<button
									type="button"
									onClick={() => removeKeyword("pt", i)}
									className="hover:text-destructive"
								>
									<X className="size-3" />
								</button>
							</span>
						))}
					</div>
					<p className="text-xs text-muted-foreground">
						{(formData.keywords_pt || []).length} / 6 palavras-chave (mínimo 3)
					</p>
				</div>
			</div>

			{/* English Section */}
			<div className="p-4 border rounded-lg space-y-4">
				<h3 className="font-medium">English</h3>

				<div className="space-y-2">
					<Label htmlFor="title_en">
						Title <span className="text-destructive">*</span>
					</Label>
					<Input
						id="title_en"
						value={formData.title_en || ""}
						onChange={(e) => updateFormData({ title_en: e.target.value })}
						placeholder="Article title in English"
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="abstract_en">
						Abstract <span className="text-destructive">*</span>
					</Label>
					<Textarea
						id="abstract_en"
						value={formData.abstract_en || ""}
						onChange={(e) => updateFormData({ abstract_en: e.target.value })}
						placeholder="Article abstract in English (max 500 words)"
						rows={6}
					/>
					<p className="text-xs text-muted-foreground">
						{(formData.abstract_en || "").split(/\s+/).filter(Boolean).length} /
						500 words
					</p>
				</div>

				<div className="space-y-2">
					<Label htmlFor="keywords_en">
						Keywords <span className="text-destructive">*</span>
					</Label>
					<div className="flex gap-2">
						<Input
							id="keywords_en"
							value={keywordInputEN}
							onChange={(e) => setKeywordInputEN(e.target.value)}
							onKeyPress={(e) =>
								e.key === "Enter" && (e.preventDefault(), addKeyword("en"))
							}
							placeholder="Type and press Enter"
						/>
						<Button type="button" onClick={() => addKeyword("en")}>
							Add
						</Button>
					</div>
					<div className="flex flex-wrap gap-2 mt-2">
						{(formData.keywords_en || []).map((kw, i) => (
							<span
								key={i}
								className="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm"
							>
								{kw}
								<button
									type="button"
									onClick={() => removeKeyword("en", i)}
									className="hover:text-destructive"
								>
									<X className="size-3" />
								</button>
							</span>
						))}
					</div>
					<p className="text-xs text-muted-foreground">
						{(formData.keywords_en || []).length} / 6 keywords (minimum 3)
					</p>
				</div>
			</div>
		</div>
	);
}
