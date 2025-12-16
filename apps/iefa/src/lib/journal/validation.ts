// Validation schemas for article submission
// Each step has its own schema for progressive validation

import { z } from "zod";

// Step 1: Article Type & Subject
export const articleTypeSchema = z.object({
	article_type: z.enum(
		["research", "review", "short_communication", "editorial"],
		{
			required_error: "Tipo de artigo é obrigatório",
		},
	),
	subject_area: z
		.string()
		.min(1, "Área de conhecimento é obrigatória")
		.max(200, "Área de conhecimento muito longa"),
});

// Step 2: Bilingual Metadata
export const metadataSchema = z.object({
	title_pt: z
		.string()
		.min(10, "Título em português deve ter pelo menos 10 caracteres")
		.max(500, "Título em português muito longo"),
	title_en: z
		.string()
		.min(10, "Título em inglês deve ter pelo menos 10 caracteres")
		.max(500, "Título em inglês muito longo"),
	abstract_pt: z
		.string()
		.min(100, "Resumo em português deve ter pelo menos 100 caracteres")
		.max(3000, "Resumo em português muito longo (máx. 500 palavras)")
		.refine(
			(val) => val.split(/\s+/).length <= 500,
			"Resumo em português não pode ter mais de 500 palavras",
		),
	abstract_en: z
		.string()
		.min(100, "Abstract in English must have at least 100 characters")
		.max(3000, "Abstract em inglês muito longo (máx. 500 palavras)")
		.refine(
			(val) => val.split(/\s+/).length <= 500,
			"Abstract cannot have more than 500 words",
		),
	keywords_pt: z
		.array(z.string())
		.min(3, "Mínimo de 3 palavras-chave em português")
		.max(6, "Máximo de 6 palavras-chave em português"),
	keywords_en: z
		.array(z.string())
		.min(3, "Minimum 3 keywords in English")
		.max(6, "Maximum 6 keywords in English"),
});

// Step 3: Authors
export const authorSchema = z.object({
	full_name: z
		.string()
		.min(2, "Nome completo deve ter pelo menos 2 caracteres")
		.max(200, "Nome muito longo"),
	email: z.string().email("E-mail inválido").optional().or(z.literal("")),
	affiliation: z.string().max(500, "Afiliação muito longa").optional(),
	orcid: z
		.string()
		.regex(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/, "Formato ORCID inválido")
		.optional()
		.or(z.literal("")),
	is_corresponding: z.boolean().default(false),
});

export const authorsSchema = z.object({
	authors: z
		.array(authorSchema)
		.min(1, "Pelo menos um autor é obrigatório")
		.refine(
			(authors) => authors.filter((a) => a.is_corresponding).length <= 1,
			"Apenas um autor correspondente permitido",
		),
});

// Step 4: Files
export const filesSchema = z.object({
	pdf_file: z
		.instanceof(File, { message: "Arquivo PDF é obrigatório" })
		.refine(
			(file) => file.size <= 10 * 1024 * 1024,
			"PDF deve ter no máximo 10MB",
		)
		.refine(
			(file) => file.type === "application/pdf",
			"Arquivo deve ser um PDF",
		),
	source_file: z
		.instanceof(File)
		.refine(
			(file) => !file || file.size <= 10 * 1024 * 1024,
			"Arquivo fonte deve ter no máximo 10MB",
		)
		.optional(),
	supplementary_files: z
		.array(z.instanceof(File))
		.refine((files) => {
			const totalSize = files.reduce((sum, file) => sum + file.size, 0);
			return totalSize <= 50 * 1024 * 1024;
		}, "Materiais suplementares não podem ultrapassar 50MB no total")
		.optional()
		.default([]),
});

// Step 5: Declarations
export const declarationsSchema = z.object({
	conflict_of_interest: z
		.string()
		.min(10, "Declaração de conflito de interesse é obrigatória")
		.max(2000, "Declaração muito longa"),
	funding_info: z
		.string()
		.max(1000, "Informação de financiamento muito longa")
		.optional(),
	data_availability: z
		.string()
		.max(1000, "Declaração de disponibilidade de dados muito longa")
		.optional(),
	ethics_approval: z
		.string()
		.max(500, "Referência de aprovação ética muito longa")
		.optional(),
	has_ethics_approval: z.boolean().default(false),
});

// Complete submission schema (all steps combined)
export const completeSubmissionSchema = articleTypeSchema
	.merge(metadataSchema)
	.merge(authorsSchema)
	.merge(filesSchema)
	.merge(declarationsSchema);

// Type inference from schemas
export type ArticleTypeFormData = z.infer<typeof articleTypeSchema>;
export type MetadataFormData = z.infer<typeof metadataSchema>;
export type AuthorFormData = z.infer<typeof authorSchema>;
export type AuthorsFormData = z.infer<typeof authorsSchema>;
export type FilesFormData = z.infer<typeof filesSchema>;
export type DeclarationsFormData = z.infer<typeof declarationsSchema>;
export type CompleteSubmissionData = z.infer<typeof completeSubmissionSchema>;

// Helper function to validate step data
export function validateStep(
	step: number,
	data: any,
): { success: boolean; error?: string } {
	try {
		switch (step) {
			case 1:
				articleTypeSchema.parse(data);
				break;
			case 2:
				metadataSchema.parse(data);
				break;
			case 3:
				authorsSchema.parse(data);
				break;
			case 4:
				filesSchema.parse(data);
				break;
			case 5:
				declarationsSchema.parse(data);
				break;
			default:
				return { success: false, error: "Invalid step number" };
		}
		return { success: true };
	} catch (error) {
		if (error instanceof z.ZodError) {
			return { success: false, error: error.errors[0].message };
		}
		return { success: false, error: "Validation failed" };
	}
}
