export {
	listPendingAcknowledgements,
	type PendingAcknowledgementOptions,
	type RecordAcknowledgementOptions,
	recordAcknowledgement,
} from "./acknowledgement.ts"
export { createLegalClient, type LegalClient, type LegalConnection } from "./client.ts"
export {
	LEGAL_CONTACT,
	LEGAL_CONTACT_EMAIL,
	LEGAL_CONTROLLER,
	LEGAL_DATA_PROTECTION_OFFICER,
	LEGAL_RESPONSE_DAYS,
} from "./contact.ts"
export {
	type FetchLegalDocumentOptions,
	type FetchLegalDocumentsOptions,
	fetchLegalDocument,
	fetchLegalDocuments,
} from "./documents.ts"
export {
	DEFAULT_LEGAL_LOCALE,
	isLegalDocType,
	LEGAL_DOC_PATHS,
	LEGAL_DOC_TITLES,
	LEGAL_DOC_TYPES,
	LEGAL_LOCALES,
	type LegalDocType,
	type LegalDocument,
	type LegalDocumentAcknowledgement,
	type LegalLocale,
} from "./types.ts"
