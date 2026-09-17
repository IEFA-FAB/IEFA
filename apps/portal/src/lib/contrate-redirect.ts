import { redirect } from "@tanstack/react-router"

/**
 * A Plataforma ACI, o console do Projeto α e as Facilidades do Pregoeiro saíram do
 * portal para `contrate.iefa.com.br`. Os caminhos antigos respondem 301 para o mesmo
 * caminho lá — favoritos, links da documentação e e-mails antigos continuam chegando.
 */
export const CONTRATE_URL = "https://contrate.iefa.com.br"

export function redirectToContrate(pathname: string, searchStr = ""): never {
	throw redirect({ href: `${CONTRATE_URL}${pathname}${searchStr}`, statusCode: 301 })
}
