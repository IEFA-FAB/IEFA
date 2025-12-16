// Simple, type-safe i18n system for the journal
// Uses Context + hooks for optimal DX

import { createContext, type ReactNode, useContext, useState } from "react";

// Supported languages
export type Locale = "pt" | "en";

// All translation keys (type-safe!)
export interface Translations {
	// Common
	common: {
		loading: string;
		error: string;
		save: string;
		cancel: string;
		delete: string;
		edit: string;
		back: string;
		next: string;
		submit: string;
		search: string;
		filter: string;
		clearFilters: string;
		download: string;
		upload: string;
		yes: string;
		no: string;
	};
	// Navigation
	nav: {
		home: string;
		articles: string;
		submissions: string;
		reviews: string;
		profile: string;
		dashboard: string;
	};
	// Article status
	status: {
		draft: string;
		submitted: string;
		under_review: string;
		revision_requested: string;
		revised_submitted: string;
		accepted: string;
		rejected: string;
		published: string;
	};
	// Forms
	forms: {
		required: string;
		invalidEmail: string;
		invalidUrl: string;
		minLength: (min: number) => string;
		maxLength: (max: number) => string;
	};
}

// Portuguese translations
const pt: Translations = {
	common: {
		loading: "Carregando...",
		error: "Erro",
		save: "Salvar",
		cancel: "Cancelar",
		delete: "Deletar",
		edit: "Editar",
		back: "Voltar",
		next: "Próximo",
		submit: "Enviar",
		search: "Buscar",
		filter: "Filtrar",
		clearFilters: "Limpar Filtros",
		download: "Download",
		upload: "Upload",
		yes: "Sim",
		no: "Não",
	},
	nav: {
		home: "Início",
		articles: "Artigos",
		submissions: "Submissões",
		reviews: "Revisões",
		profile: "Perfil",
		dashboard: "Dashboard",
	},
	status: {
		draft: "Rascunho",
		submitted: "Submetido",
		under_review: "Em Revisão",
		revision_requested: "Revisão Solicitada",
		revised_submitted: "Revisão Enviada",
		accepted: "Aceito",
		rejected: "Rejeitado",
		published: "Publicado",
	},
	forms: {
		required: "Campo obrigatório",
		invalidEmail: "Email inválido",
		invalidUrl: "URL inválida",
		minLength: (min) => `Mínimo de ${min} caracteres`,
		maxLength: (max) => `Máximo de ${max} caracteres`,
	},
};

// English translations
const en: Translations = {
	common: {
		loading: "Loading...",
		error: "Error",
		save: "Save",
		cancel: "Cancel",
		delete: "Delete",
		edit: "Edit",
		back: "Back",
		next: "Next",
		submit: "Submit",
		search: "Search",
		filter: "Filter",
		clearFilters: "Clear Filters",
		download: "Download",
		upload: "Upload",
		yes: "Yes",
		no: "No",
	},
	nav: {
		home: "Home",
		articles: "Articles",
		submissions: "Submissions",
		reviews: "Reviews",
		profile: "Profile",
		dashboard: "Dashboard",
	},
	status: {
		draft: "Draft",
		submitted: "Submitted",
		under_review: "Under Review",
		revision_requested: "Revision Requested",
		revised_submitted: "Revision Submitted",
		accepted: "Accepted",
		rejected: "Rejected",
		published: "Published",
	},
	forms: {
		required: "Required field",
		invalidEmail: "Invalid email",
		invalidUrl: "Invalid URL",
		minLength: (min) => `Minimum ${min} characters`,
		maxLength: (max) => `Maximum ${max} characters`,
	},
};

// All translations
const translations: Record<Locale, Translations> = { pt, en };

// Context
interface I18nContextValue {
	locale: Locale;
	t: Translations;
	setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

// Provider
export function I18nProvider({
	children,
	initialLocale = "pt",
}: {
	children: ReactNode;
	initialLocale?: Locale;
}) {
	const [locale, setLocale] = useState<Locale>(initialLocale);

	const value: I18nContextValue = {
		locale,
		t: translations[locale],
		setLocale,
	};

	return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// Hook for using translations
export function useTranslation() {
	const context = useContext(I18nContext);
	if (!context) {
		throw new Error("useTranslation must be used within I18nProvider");
	}
	return context;
}

// Convenience hook for just getting translations
export function useT() {
	return useTranslation().t;
}

// Example usage:
// const t = useT();
// <button>{t.common.save}</button>
// <p>{t.forms.minLength(5)}</p>
// <Badge>{t.status.published}</Badge>
