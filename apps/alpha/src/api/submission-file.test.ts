import { describe, expect, test } from "bun:test"
import { buildSubmissionStoragePath, MAX_FILENAME_LENGTH, sanitizeSubmissionFilename } from "./submission-file.ts"

const PDF = "application/pdf"
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

describe("buildSubmissionStoragePath", () => {
	test("usuário, UUID e extensão do MIME — nada do nome enviado", () => {
		expect(buildSubmissionStoragePath("user-1", PDF, "abc")).toBe("user-1/abc.pdf")
		expect(buildSubmissionStoragePath("user-1", DOCX, "abc")).toBe("user-1/abc.docx")
		expect(buildSubmissionStoragePath("user-1", PDF)).toMatch(/^user-1\/[0-9a-f-]{36}\.pdf$/)
	})

	test("MIME fora da lista não tem caminho", () => {
		expect(buildSubmissionStoragePath("user-1", "text/html", "abc")).toBeNull()
	})
})

describe("sanitizeSubmissionFilename", () => {
	test("fica só o último segmento, sem `..` nem separador", () => {
		expect(sanitizeSubmissionFilename("/../../../outro-bucket/x.pdf", PDF)).toBe("x.pdf")
		expect(sanitizeSubmissionFilename("C:\\Users\\fulano\\ETP.docx", DOCX)).toBe("ETP.docx")
	})

	test("tira caractere de controle e corta no teto", () => {
		expect(sanitizeSubmissionFilename("tr\u0000\n\u2028.pdf", PDF)).toBe("tr.pdf")
		expect([...sanitizeSubmissionFilename(`${"a".repeat(1000)}.pdf`, PDF)]).toHaveLength(MAX_FILENAME_LENGTH)
	})

	test("nome vazio ou só ponto vira nome neutro com a extensão do MIME", () => {
		expect(sanitizeSubmissionFilename("", PDF)).toBe("documento.pdf")
		expect(sanitizeSubmissionFilename("../..", DOCX)).toBe("documento.docx")
		expect(sanitizeSubmissionFilename("dir/", PDF)).toBe("documento.pdf")
	})
})
