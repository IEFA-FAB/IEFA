import { createCsrfMiddleware, createStart } from "@tanstack/react-start"

/**
 * `requestMiddleware: []` DESLIGAVA o CSRF padrão do TanStack Start para server functions
 * (o framework só o injeta quando não há `startInstance`). O docs é pré-renderizado e não
 * tem server fn hoje; o middleware fica para a primeira que aparecer não nascer aberta.
 */
const csrfMiddleware = createCsrfMiddleware({
	filter: (ctx) => ctx.handlerType === "serverFn",
})

export const startInstance = createStart(() => ({
	requestMiddleware: [csrfMiddleware],
}))
