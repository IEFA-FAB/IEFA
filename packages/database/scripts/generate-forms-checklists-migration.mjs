import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, "..", "..", "..")
const sourcePath = join(repoRoot, "apps", "forms", "checklists.json")
const outputPath = join(repoRoot, "packages", "database", "supabase", "migrations", "20260507121500_forms_seed_checklists.sql")

const raw = readFileSync(sourcePath, "utf8")
const checklists = JSON.parse(raw)

const AREA_TITLES = {
	ADMINISTRATIVA: "Checklist 5S - Área Administrativa",
	AREAS_COMUNS: "Checklist 5S - Áreas Comuns",
}

const AREA_DESCRIPTIONS = {
	ADMINISTRATIVA: "Questionário importado de apps/forms/checklists.json para avaliação 1S, 2S e 3S da área administrativa.",
	AREAS_COMUNS: "Questionário importado de apps/forms/checklists.json para avaliação 1S, 2S e 3S de áreas comuns.",
}

function sqlString(value) {
	return `'${String(value).replaceAll("'", "''")}'`
}

function slugify(value) {
	return value
		.normalize("NFD")
		.replaceAll(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replaceAll(/[^a-z0-9]+/g, "-")
		.replaceAll(/^-+|-+$/g, "")
}

function buildQuestionnaire(areaKey, areaValue) {
	const questionnaireTitle = AREA_TITLES[areaKey] ?? `Checklist 5S - ${areaValue.area}`
	const questionnaireDescription = AREA_DESCRIPTIONS[areaKey] ?? `Questionário importado de apps/forms/checklists.json para ${areaValue.area}.`
	const questionnaireKey = `${areaKey.toLowerCase()}`

	const sections = areaValue.sections
		.flatMap((senseBlock) =>
			senseBlock.subsections.flatMap((subsection) =>
				subsection.categories.map((category) => ({
					key: `${questionnaireKey}-${senseBlock.code}-${subsection.code}-${category.code}`,
					title: `${senseBlock.sense} • ${category.code} • ${category.title}`,
					description: `${senseBlock.title} — ${subsection.title}`,
					questions: category.questions.map((question, questionIndex) => ({
						key: `${questionnaireKey}-${category.code}-${question.number}`,
						text: question.text,
						description: `${question.sense} • ${category.code} • ${category.title}`,
						sortOrder: questionIndex,
					})),
				}))
			)
		)
		.map((section, sectionIndex) => ({
			...section,
			sortOrder: sectionIndex,
		}))

	return {
		key: questionnaireKey,
		title: questionnaireTitle,
		description: questionnaireDescription,
		sections,
	}
}

function buildMigration(data) {
	const questionnaires = Object.entries(data).map(([areaKey, areaValue]) => buildQuestionnaire(areaKey, areaValue))
	const questionnaireCount = questionnaires.length
	const sectionCount = questionnaires.reduce((sum, questionnaire) => sum + questionnaire.sections.length, 0)
	const questionCount = questionnaires.reduce(
		(sum, questionnaire) => sum + questionnaire.sections.reduce((sectionSum, section) => sectionSum + section.questions.length, 0),
		0,
	)

	const lines = [
		"-- Seed dos checklists 5S do app forms.",
		`-- Gerado por packages/database/scripts/${slugify("generate forms checklists migration")}.mjs a partir de apps/forms/checklists.json.`,
		`-- Total: ${questionnaireCount} questionarios, ${sectionCount} secoes e ${questionCount} perguntas.`,
		"",
		"alter table forms.questionnaire alter column created_by drop not null;",
		"",
		"do $$",
		"declare",
		"  questionnaire_id uuid;",
		"  section_id uuid;",
		"begin",
	]

	for (const questionnaire of questionnaires) {
		lines.push("")
		lines.push(`  if not exists (select 1 from forms.questionnaire where title = ${sqlString(questionnaire.title)}) then`)
		lines.push("    insert into forms.questionnaire (title, description, created_by, status)")
		lines.push(`    values (${sqlString(questionnaire.title)}, ${sqlString(questionnaire.description)}, null, 'sent')`)
		lines.push("    returning id into questionnaire_id;")

		for (const section of questionnaire.sections) {
			lines.push("    insert into forms.section (questionnaire_id, title, description, sort_order)")
			lines.push(
				`    values (questionnaire_id, ${sqlString(section.title)}, ${sqlString(section.description)}, ${section.sortOrder})`
			)
			lines.push("    returning id into section_id;")

			for (const question of section.questions) {
				lines.push("    insert into forms.question (section_id, text, description, type, options, required, sort_order)")
				lines.push(
					`    values (section_id, ${sqlString(question.text)}, ${sqlString(question.description)}, 'conformity', '{"weight":1,"weightLabel":"Desejável"}'::jsonb, true, ${question.sortOrder});`,
				)
			}
		}

		lines.push("  end if;")
	}

	lines.push("end $$;")
	lines.push("")

	return `${lines.join("\n")}\n`
}

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, buildMigration(checklists))

console.log(`Wrote ${outputPath}`)
