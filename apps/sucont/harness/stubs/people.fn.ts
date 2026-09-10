/**
 * Stub do `#/server/people.fn` para o harness.
 *
 * As quatro pessoas cobrem os estados que a tela distingue e que só existem com
 * dado de banco: com SARAM e conta, com SARAM e sem conta, e sem nenhum dos dois
 * — que é o estado em que TODAS nascem do backfill, porque nome mais posto não
 * identifica ninguém e o vínculo é feito por um humano.
 */

import type { RosterMatch, SectionPerson } from "#/server/people.fn"

const PEOPLE: SectionPerson[] = [
	{
		id: "p-vanessa",
		label: "3S VANESSA",
		displayName: "3S VANESSA",
		nrOrdem: null,
		email: null,
		posto: null,
		nomeGuerra: null,
		hasAccount: false,
		active: true,
		taskCount: 2,
		ugCount: 2,
	},
	{
		id: "p-klebson",
		label: "1S KLEBSON",
		displayName: "SGT KLEBSON",
		nrOrdem: "0000000",
		email: "klebson@fab.mil.br",
		posto: "1S",
		nomeGuerra: "KLEBSON",
		hasAccount: true,
		active: true,
		taskCount: 1,
		ugCount: 2,
	},
	{
		id: "p-talita",
		label: "2S TALITA",
		displayName: "3S TALITA",
		nrOrdem: "0000001",
		email: null,
		posto: "2S",
		nomeGuerra: "TALITA",
		hasAccount: false,
		active: true,
		taskCount: 0,
		ugCount: 1,
	},
	{
		id: "p-iara",
		label: "SGT IARA",
		displayName: "SGT IARA",
		nrOrdem: null,
		email: null,
		posto: null,
		nomeGuerra: null,
		hasAccount: false,
		active: true,
		taskCount: 1,
		ugCount: 0,
	},
]

export async function listSectionPeopleFn(): Promise<SectionPerson[]> {
	return PEOPLE
}

export async function searchRosterFn(): Promise<RosterMatch[]> {
	// Homônimos de propósito: é o problema que a tela existe para resolver — no
	// efetivo real, "VANESSA" com posto "3S" casa com quatorze pessoas.
	return [
		{ nrOrdem: "0000002", posto: "3S", nomeGuerra: "VANESSA", organizacao: "DIREF" },
		{ nrOrdem: "0000003", posto: "3S", nomeGuerra: "VANESSA", organizacao: "GAP-BR" },
		{ nrOrdem: "0000004", posto: "2S", nomeGuerra: "VANESSA", organizacao: "CINDACTA I" },
	]
}

export async function createSectionPersonFn(): Promise<{ id: string }> {
	return { id: "p-nova" }
}

export async function linkPersonRosterFn(): Promise<{ ok: true }> {
	return { ok: true }
}

export async function linkPersonAccountFn(): Promise<{ ok: true }> {
	return { ok: true }
}

export async function renamePersonFn(): Promise<{ ok: true }> {
	return { ok: true }
}

export async function removeSectionPersonFn(): Promise<{ ok: true }> {
	return { ok: true }
}
