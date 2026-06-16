// Geradores de metadados para intercâmbio (Crossref / JATS / Dublin Core).
// Operam sobre artigos publicados (PublishedArticle) + JournalSettings.
// Produzem XML bem-formado; para depósito real no Crossref ainda é necessário
// preencher credenciais/depositor em JournalSettings (crossref_*).

import type { JournalSettings, PublishedArticle } from "./types"

type RawAuthor = {
	full_name?: string
	given_name?: string
	surname?: string
	affiliation?: string
	orcid?: string
	author_order?: number
	is_corresponding?: boolean
}

function esc(value: unknown): string {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;")
}

function parseAuthors(authors: unknown): RawAuthor[] {
	if (!Array.isArray(authors)) return []
	return (authors as RawAuthor[]).slice().sort((a, b) => (a.author_order ?? 0) - (b.author_order ?? 0))
}

// Divide "Nome Sobrenome" em given/surname quando não há campos estruturados.
function splitName(author: RawAuthor): { given: string; surname: string } {
	if (author.surname || author.given_name) return { given: author.given_name ?? "", surname: author.surname ?? "" }
	const parts = (author.full_name ?? "").trim().split(/\s+/)
	if (parts.length <= 1) return { given: "", surname: parts[0] ?? "" }
	return { given: parts.slice(0, -1).join(" "), surname: parts[parts.length - 1] }
}

function year(dateIso: string): string {
	return new Date(dateIso).getFullYear().toString()
}

// ─── Dublin Core ────────────────────────────────────────────────────────────
export function dublinCoreXml(articles: PublishedArticle[]): string {
	const records = articles
		.map((a) => {
			const creators = parseAuthors(a.authors)
				.map((au) => `    <dc:creator>${esc(au.full_name ?? `${au.given_name ?? ""} ${au.surname ?? ""}`.trim())}</dc:creator>`)
				.join("\n")
			const subjects = [a.subject_area, ...(a.keywords_pt ?? [])]
				.filter(Boolean)
				.map((s) => `    <dc:subject>${esc(s)}</dc:subject>`)
				.join("\n")
			return [
				"  <record>",
				`    <dc:title>${esc(a.title_pt)}</dc:title>`,
				creators,
				subjects,
				`    <dc:description>${esc(a.abstract_pt)}</dc:description>`,
				`    <dc:type>${esc(a.article_type)}</dc:type>`,
				`    <dc:date>${esc(a.published_at)}</dc:date>`,
				`    <dc:language>pt</dc:language>`,
				a.doi ? `    <dc:identifier>https://doi.org/${esc(a.doi)}</dc:identifier>` : "",
				"  </record>",
			]
				.filter(Boolean)
				.join("\n")
		})
		.join("\n")
	return `<?xml version="1.0" encoding="UTF-8"?>\n<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n${records}\n</metadata>\n`
}

// ─── JATS (Journal Article Tag Suite) ───────────────────────────────────────
export function jatsXml(articles: PublishedArticle[], settings: JournalSettings): string {
	const items = articles
		.map((a) => {
			const contribs = parseAuthors(a.authors)
				.map((au) => {
					const { given, surname } = splitName(au)
					return `        <contrib contrib-type="author">\n          <name><surname>${esc(surname)}</surname><given-names>${esc(given)}</given-names></name>${au.affiliation ? `\n          <aff>${esc(au.affiliation)}</aff>` : ""}\n        </contrib>`
				})
				.join("\n")
			return [
				`  <article article-type="${esc(a.article_type)}" xml:lang="pt">`,
				"    <front>",
				"      <journal-meta>",
				`        <journal-title-group><journal-title>${esc(settings.journal_name_pt)}</journal-title></journal-title-group>`,
				settings.issn_online ? `        <issn pub-type="epub">${esc(settings.issn_online)}</issn>` : "",
				`        <publisher><publisher-name>${esc(settings.publisher)}</publisher-name></publisher>`,
				"      </journal-meta>",
				"      <article-meta>",
				a.doi ? `        <article-id pub-id-type="doi">${esc(a.doi)}</article-id>` : "",
				`        <title-group><article-title>${esc(a.title_pt)}</article-title></title-group>`,
				`        <contrib-group>\n${contribs}\n        </contrib-group>`,
				`        <abstract><p>${esc(a.abstract_pt)}</p></abstract>`,
				`        <pub-date publication-format="electronic"><year>${esc(year(a.published_at))}</year></pub-date>`,
				a.volume != null ? `        <volume>${esc(a.volume)}</volume>` : "",
				a.issue != null ? `        <issue>${esc(a.issue)}</issue>` : "",
				"      </article-meta>",
				"    </front>",
				"  </article>",
			]
				.filter(Boolean)
				.join("\n")
		})
		.join("\n")
	return `<?xml version="1.0" encoding="UTF-8"?>\n<article-set>\n${items}\n</article-set>\n`
}

// ─── Crossref deposit ───────────────────────────────────────────────────────
export function crossrefXml(articles: PublishedArticle[], settings: JournalSettings): string {
	const stamp = Date.now()
	const articleNodes = articles
		.map((a) => {
			const contribs = parseAuthors(a.authors)
				.map((au, idx) => {
					const { given, surname } = splitName(au)
					return `        <person_name sequence="${idx === 0 ? "first" : "additional"}" contributor_role="author">\n          <given_name>${esc(given)}</given_name>\n          <surname>${esc(surname)}</surname>${au.orcid ? `\n          <ORCID>https://orcid.org/${esc(au.orcid)}</ORCID>` : ""}\n        </person_name>`
				})
				.join("\n")
			return [
				'      <journal_article publication_type="full_text">',
				`        <titles><title>${esc(a.title_pt)}</title></titles>`,
				contribs ? `        <contributors>\n${contribs}\n        </contributors>` : "",
				`        <publication_date media_type="online"><year>${esc(year(a.published_at))}</year></publication_date>`,
				a.doi ? `        <doi_data><doi>${esc(a.doi)}</doi><resource>https://doi.org/${esc(a.doi)}</resource></doi_data>` : "",
				"      </journal_article>",
			]
				.filter(Boolean)
				.join("\n")
		})
		.join("\n")
	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<doi_batch version="4.4.2" xmlns="http://www.crossref.org/schema/4.4.2">',
		"  <head>",
		`    <doi_batch_id>${esc(settings.id)}-${stamp}</doi_batch_id>`,
		`    <timestamp>${stamp}</timestamp>`,
		`    <depositor><depositor_name>${esc(settings.from_name)}</depositor_name><email_address>${esc(settings.from_email)}</email_address></depositor>`,
		`    <registrant>${esc(settings.publisher)}</registrant>`,
		"  </head>",
		"  <body>",
		"    <journal>",
		`      <journal_metadata><full_title>${esc(settings.journal_name_pt)}</full_title>${settings.issn_online ? `<issn media_type="electronic">${esc(settings.issn_online)}</issn>` : ""}</journal_metadata>`,
		articleNodes,
		"    </journal>",
		"  </body>",
		"</doi_batch>",
		"",
	].join("\n")
}

// Dispara download de uma string XML no browser.
export function downloadXml(filename: string, xml: string): void {
	const blob = new Blob([xml], { type: "application/xml;charset=utf-8" })
	const url = URL.createObjectURL(blob)
	const link = document.createElement("a")
	link.href = url
	link.download = filename
	document.body.appendChild(link)
	link.click()
	document.body.removeChild(link)
	URL.revokeObjectURL(url)
}
