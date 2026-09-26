/**
 * Guia de preenchimento do Compras.gov.br: um HTML autônomo (sem rede, sem dependência) com
 * um bloco por campo, na ordem dos formulários, e um botão Copiar em cada um.
 *
 * É o formato que o requisitante pediu nos processos reais ("HTML é mais fácil de organizar e
 * copiar"). Abre no navegador ao lado da aba do sistema, imprime, e vai por e-mail para quem
 * vai cadastrar. O botão copia em HTML e em texto, para o editor do sistema (CKEditor) manter
 * parágrafos e tabelas.
 */

import { DEMAND_STEP_LABEL, type DemandCheck } from "./checks"
import type { DemandDocuments, FieldKind, FieldTable, FormField } from "./documents"
import { formatBRL } from "./framing"
import type { DemandPayload, Rating } from "./schema"

export function escapeHtml(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

const KIND_LABEL: Record<FieldKind, string> = {
	texto: "texto",
	texto_rico: "texto com formatação",
	numero: "número",
	data: "data",
	selecao: "seleção na lista",
	tabela: "tabela (diálogo do sistema)",
	radio: "opção",
	manter: "manter o modelo",
}

const RATING_MARK: Record<Rating, string> = { atende: "●", parcial: "◐", nao_atende: "○" }

function valueHtml(value: string): string {
	return value
		.split(/\n{2,}/)
		.filter((paragraph) => paragraph.trim())
		.map((paragraph) => `<p>${paragraph.split("\n").map(escapeHtml).join("<br>")}</p>`)
		.join("")
}

function tableHtml(table: FieldTable): string {
	const head = table.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")
	const body = table.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")
	return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

/**
 * O conteúdo de um campo em HTML: parágrafos e tabela. É o que o botão Copiar entrega ao
 * editor do sistema, no guia e na tela do contrate (uma serialização só, para as duas não
 * divergirem).
 */
export function fieldContentHtml(field: Pick<FormField, "value" | "table">): string {
	return `${valueHtml(field.value)}${field.table ? tableHtml(field.table) : ""}`
}

/** O mesmo conteúdo em texto: parágrafos e tabela separada por tabulação (cola em planilha). */
export function fieldContentText(field: Pick<FormField, "value" | "table">): string {
	const table = field.table ? [field.table.columns, ...field.table.rows].map((row) => row.join("\t")).join("\n") : ""
	return [field.value.trim(), table].filter(Boolean).join("\n\n")
}

function fieldHtml(field: FormField, anchor: string): string {
	const content = fieldContentHtml(field)
	const length = field.value.trim().length
	const over = field.maxLength !== undefined && length > field.maxLength
	const counter = field.maxLength !== undefined ? `<span class="count${over ? " over" : ""}">${length}/${field.maxLength} caracteres</span>` : ""
	const hasPending = /\[PREENCHER:/.test(field.value) || (field.table?.rows.some((row) => row.some((cell) => cell.includes("[PREENCHER:"))) ?? false)
	const copyable = field.kind !== "manter" && content !== ""

	return `<div class="field${hasPending ? " pending" : ""}">
<div class="field-head"><span class="label">${escapeHtml(field.label)}</span><span class="kind">${KIND_LABEL[field.kind]}</span>${counter}${copyable ? `<button type="button" data-copy="${anchor}">Copiar</button>` : ""}</div>
${field.note ? `<p class="note">${escapeHtml(field.note)}</p>` : ""}
${copyable ? `<div class="value" id="${anchor}">${content}</div>` : ""}
</div>`
}

function structureHtml(demand: DemandPayload): string {
	const fundamentals = demand.objectives.filter((objective) => objective.kind === "fundamental" && objective.text.trim())
	const means = demand.objectives.filter((objective) => objective.kind === "means" && objective.text.trim())
	const alternatives = demand.alternatives.filter((alternative) => alternative.name.trim())

	const objectives = fundamentals
		.map((objective) => {
			const children = means.filter((candidate) => candidate.supports.includes(objective.id))
			const { name, baseline, target } = objective.attribute
			return `<li><strong>${escapeHtml(objective.text)}</strong>${name ? `<br><span class="muted">medido por ${escapeHtml(name)}${baseline ? `: hoje ${escapeHtml(baseline)}` : ""}${target ? `, meta ${escapeHtml(target)}` : ""}</span>` : ""}${children.length ? `<ul>${children.map((child) => `<li>${escapeHtml(child.text)}</li>`).join("")}</ul>` : ""}</li>`
		})
		.join("")

	const matrix =
		alternatives.length && fundamentals.length
			? `<table><thead><tr><th>Alternativa</th>${fundamentals.map((objective) => `<th>${escapeHtml(objective.text)}</th>`).join("")}</tr></thead><tbody>${alternatives
					.map(
						(alternative) =>
							`<tr${alternative.id === demand.chosenAlternativeId ? ' class="chosen"' : ""}><td>${escapeHtml(alternative.name)}${alternative.id === demand.chosenAlternativeId ? " (escolhida)" : ""}</td>${fundamentals
								.map((objective) => {
									const rating = alternative.ratings[objective.id]
									return `<td>${rating ? `${RATING_MARK[rating]} ${rating.replace("_", " ")}` : ""}</td>`
								})
								.join("")}</tr>`
					)
					.join("")}</tbody></table>`
			: ""

	return `<section class="block">
<h2>Estruturação da demanda</h2>
<p class="muted">Problema, objetivos e alternativas, pelo Value-Focused Thinking. É a origem dos textos das peças.</p>
<h3>Problema</h3>${valueHtml(demand.context.problem || "(não descrito)")}
<h3>Objetivos fundamentais e objetivos-meio</h3>${objectives ? `<ul>${objectives}</ul>` : "<p>(nenhum)</p>"}
${matrix ? `<h3>Alternativas × objetivos</h3>${matrix}` : ""}
${demand.choiceRationale.trim() ? `<h3>Por que a escolhida</h3>${valueHtml(demand.choiceRationale)}` : ""}
</section>`
}

const SEVERITY_LABEL = { bloqueia: "Bloqueia", atencao: "Atenção", dica: "Dica" } as const

export interface GuideMeta {
	title: string
	unit: string
	generatedAt: Date
}

export function renderFillingGuide(demand: DemandPayload, documents: DemandDocuments, checks: readonly DemandCheck[], meta: GuideMeta): string {
	const { framing, prices, forms } = documents
	const relevant = checks.filter((check) => check.severity !== "dica")
	const generated = meta.generatedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })

	const formsHtml = forms
		.map(
			(form, formIndex) => `<section class="block form" id="${form.id}">
<h2>${formIndex + 1}. ${escapeHtml(form.title)}</h2>
<p><strong>Onde:</strong> ${escapeHtml(form.system)}<br><strong>Caminho:</strong> ${escapeHtml(form.path)}</p>
${form.tips.length ? `<ul class="tips">${form.tips.map((tip) => `<li>${escapeHtml(tip)}</li>`).join("")}</ul>` : ""}
${form.sections
	.map(
		(section, sectionIndex) =>
			`<div class="section"><h3>${escapeHtml(section.title)}</h3>${section.fields.map((field, fieldIndex) => fieldHtml(field, `${form.id}-${sectionIndex}-${fieldIndex}`)).join("")}</div>`
	)
	.join("")}
</section>`
		)
		.join("")

	return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(meta.title)} · Guia de preenchimento</title>
<style>
:root { color-scheme: light; --b: #d4d4d8; --m: #71717a; }
* { box-sizing: border-box; }
body { font: 15px/1.55 "IBM Plex Sans", system-ui, sans-serif; color: #09090b; background: #fbfaf7; margin: 0; letter-spacing: -0.01em; }
main { max-width: 64rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
h1 { font-size: 1.9rem; letter-spacing: -0.04em; margin: 0 0 .25rem; }
h2 { font-size: 1.35rem; letter-spacing: -0.02em; margin: 0 0 .75rem; }
h3 { font-size: 1rem; margin: 1.25rem 0 .5rem; }
.muted, .note { color: var(--m); }
.block { background: #fff; border: 1px solid var(--b); padding: 1.25rem; margin-top: 1.25rem; }
.summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: 1px; background: var(--b); border: 1px solid var(--b); margin-top: 1rem; }
.summary div { background: #fff; padding: .75rem; }
.summary dt { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--m); }
.summary dd { margin: .25rem 0 0; font-weight: 600; }
nav a { margin-right: 1rem; color: inherit; }
.tips { border: 1px solid var(--b); padding: .75rem 1rem .75rem 2rem; background: #fafafa; }
.field { border: 1px solid var(--b); margin: .75rem 0; }
.field.pending { border-color: #09090b; }
.field-head { display: flex; flex-wrap: wrap; gap: .5rem; align-items: baseline; padding: .5rem .75rem; border-bottom: 1px solid var(--b); background: #fafafa; }
.label { font-weight: 600; }
.kind, .count { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--m); }
.count.over { color: #b91c1c; font-weight: 600; }
.field-head button { margin-left: auto; font: inherit; font-size: 13px; border: 1px solid #09090b; background: #09090b; color: #fff; padding: .2rem .75rem; cursor: pointer; }
.field-head button.done { background: #fff; color: #09090b; }
.note { margin: .5rem .75rem 0; font-size: 13px; }
.value { padding: .5rem .75rem; }
.value p { margin: 0 0 .6rem; }
table { border-collapse: collapse; width: 100%; margin: .5rem 0; font-size: 13px; }
th, td { border: 1px solid var(--b); padding: .35rem .5rem; text-align: left; vertical-align: top; }
th { background: #f4f4f5; }
tr.chosen td { font-weight: 600; }
.checks li { margin: .25rem 0; }
.sev { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; border: 1px solid #09090b; padding: 0 .35rem; margin-right: .35rem; }
@media print { .field-head button { display: none; } body { background: #fff; } .block { break-inside: avoid-page; } }
</style>
</head>
<body>
<main>
<p class="muted">Guia de preenchimento do Compras.gov.br · ${escapeHtml(meta.unit)} · gerado em ${escapeHtml(generated)}</p>
<h1>${escapeHtml(meta.title)}</h1>
<dl class="summary">
<div><dt>Enquadramento</dt><dd>${escapeHtml(framing.label)}</dd></div>
<div><dt>Valor estimado</dt><dd>${prices.total === null ? "pendente" : escapeHtml(formatBRL(prices.total))}</dd></div>
<div><dt>Itens</dt><dd>${demand.items.length}</dd></div>
<div><dt>Riscos</dt><dd>${demand.risks.filter((risk) => risk.risk.trim()).length}</dd></div>
</dl>
<nav class="block"><strong>Ordem de cadastro:</strong> ${forms.map((form, index) => `<a href="#${form.id}">${index + 1}. ${escapeHtml(form.title)}</a>`).join(" ")}</nav>

<section class="block">
<h2>Antes de entrar no sistema</h2>
<ul>
<li>Entre por <em>comprasnet.gov.br/seguro/loginPortal.asp</em>, perfil <strong>Governo</strong>, conta gov.br. Abra cada módulo pelo Acesso Rápido da Área de Trabalho: digitar o endereço de outro módulo derruba a sessão.</li>
<li>A sessão cai após cerca de 20 minutos parada. Cole campo a campo e confira ao sair e voltar.</li>
<li>Tenha em mãos o CPF, o e-mail e o cargo de cada responsável: DFD, ETP e Mapa de Riscos os pedem.</li>
<li>Criar DFD, ETP, Mapa de Riscos ou TR gera número oficial na UASG. Crie só quando for registrar.</li>
<li>Campos marcados com borda escura têm <strong>[PREENCHER]</strong>: dado que ainda não existe na demanda.</li>
</ul>
</section>

${
	relevant.length
		? `<section class="block"><h2>Pendências da demanda</h2><ul class="checks">${relevant
				.map(
					(check) =>
						`<li><span class="sev">${SEVERITY_LABEL[check.severity]}</span>${escapeHtml(DEMAND_STEP_LABEL[check.step])}: ${escapeHtml(check.message)}${check.basis ? ` <span class="muted">(${escapeHtml(check.basis)})</span>` : ""}</li>`
				)
				.join("")}</ul></section>`
		: ""
}

${structureHtml(demand)}

${formsHtml}
</main>
<script>
document.addEventListener("click", async (event) => {
	const button = event.target.closest("button[data-copy]");
	if (!button) return;
	const node = document.getElementById(button.dataset.copy);
	if (!node) return;
	const html = node.innerHTML;
	const text = node.innerText;
	try {
		if (window.ClipboardItem) {
			await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
		} else {
			await navigator.clipboard.writeText(text);
		}
		button.textContent = "Copiado";
		button.classList.add("done");
		setTimeout(() => { button.textContent = "Copiar"; button.classList.remove("done"); }, 1500);
	} catch {
		const range = document.createRange();
		range.selectNodeContents(node);
		const selection = window.getSelection();
		selection.removeAllRanges();
		selection.addRange(range);
		button.textContent = "Ctrl+C";
	}
});
</script>
</body>
</html>`
}
