import type { Person } from "@iefa/database/assignment-selection"

/**
 * A OM escolhida só é pública depois do anúncio.
 *
 * O controlador grava `localidade`/`estado` ao "armar" a OM (a função do banco já trava a
 * vaga nesse instante) e só depois liga `show_om`, a revelação no telão. Entre os dois
 * passos a escolha existe no banco, mas a plateia ainda não pode saber. Depois de anunciada
 * (`show_om`) ou confirmada (`hide_card`: o rosto vai para o mapa, com a OM), ela é pública.
 *
 * `callPerson` zera o `show_om` de toda a edição ao chamar o próximo militar, então o
 * `hide_card` é o que mantém a OM dos já confirmados no mapa e na contagem de vagas.
 */
export function isChoiceAnnounced(person: Pick<Person, "show_om" | "hide_card">): boolean {
	return person.show_om || person.hide_card
}

/** Versão pública da linha: sem a OM enquanto ela não foi anunciada. Não copia à toa. */
export function maskUnannouncedChoice<T extends Pick<Person, "show_om" | "hide_card" | "localidade" | "estado">>(person: T): T {
	if (isChoiceAnnounced(person)) return person
	if (person.localidade == null && person.estado == null) return person
	return { ...person, localidade: null, estado: null }
}
