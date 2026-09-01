"use client"

import { Toast as ToastPrimitive } from "@base-ui/react/toast"
import { CheckCircle, InfoCircle, Refresh, WarningTriangle, Xmark, XmarkCircle } from "iconoir-react"
import type * as React from "react"

import { cn } from "../../lib/utils"
import { Button } from "./button"

/** Ícone por chamada (`toast.success(msg, { icon })`) viaja no `data` do toast. */
type ToastData = { icon?: React.ReactNode }

const toastManager = ToastPrimitive.createToastManager<ToastData>()

/**
 * Empilhamento: as pilhas de baixo e de cima são a MESMA conta com o sinal
 * trocado, então o sentido vira uma variável (`--dir`) em vez de dois blocos de
 * classe espelhados. -1 empurra para cima (viewport embaixo), 1 para baixo.
 */
const STACK_VARS = [
	"[--gap:0.75rem] [--peek:0.75rem]",
	"[--height:var(--toast-frontmost-height,var(--toast-height))]",
	"[--scale:calc(max(0,1-(var(--toast-index)*0.1)))] [--shrink:calc(1-var(--scale))]",
	"[--dir:-1] data-[position=top]:[--dir:1]",
	"[--offset-y:calc(var(--dir)*(var(--toast-offset-y)+(var(--toast-index)*var(--gap)))+var(--toast-swipe-movement-y))]",
	"[--collapsed-y:calc(var(--toast-swipe-movement-y)+var(--dir)*((var(--toast-index)*var(--peek))+(var(--shrink)*var(--height))))]",
	"[--enter-y:calc(var(--dir)*-150%)]",
].join(" ")

const VIEWPORT_POSITION = {
	"bottom-center": "inset-x-4 bottom-4 mx-auto",
	"bottom-right": "inset-x-4 bottom-4 mx-auto sm:right-4 sm:left-auto sm:mx-0",
	"top-center": "inset-x-4 top-4 mx-auto",
	"top-right": "inset-x-4 top-4 mx-auto sm:right-4 sm:left-auto sm:mx-0",
} as const

export type ToastPosition = keyof typeof VIEWPORT_POSITION

function ToastProvider({ ...props }: ToastPrimitive.Provider.Props) {
	return <ToastPrimitive.Provider {...props} />
}

function ToastPortal({ ...props }: ToastPrimitive.Portal.Props) {
	return <ToastPrimitive.Portal data-slot="toast-portal" {...props} />
}

function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
	return (
		<ToastPrimitive.Viewport
			data-slot="toast-viewport"
			// O padrão do primitivo é "Notifications"; este é o nome do marco que o
			// F6 alcança, então tem de estar no idioma da interface.
			aria-label="Avisos"
			className={cn("pointer-events-none fixed z-50 w-auto max-w-sm outline-none sm:w-full", className)}
			{...props}
		/>
	)
}

function Toast({ className, ...props }: ToastPrimitive.Root.Props) {
	return (
		<ToastPrimitive.Root
			data-slot="toast"
			className={cn(
				"bg-popover text-popover-foreground focus-visible:border-ring focus-visible:ring-ring/50 group/toast pointer-events-auto absolute right-0 z-[calc(1000-var(--toast-index))] w-full border shadow-lg will-change-transform outline-none select-none focus-visible:ring-[3px]",
				"bottom-0 origin-bottom after:top-full data-[position=top]:top-0 data-[position=top]:bottom-auto data-[position=top]:origin-top data-[position=top]:after:top-auto data-[position=top]:after:bottom-full",
				STACK_VARS,
				"h-(--height) [transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--collapsed-y))_scale(var(--scale))] [transition:transform_500ms_cubic-bezier(0.22,1,0.36,1),opacity_500ms,height_150ms]",
				"after:absolute after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
				"data-expanded:h-(--toast-height) data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]",
				"data-limited:opacity-0 data-starting-style:[transform:translateY(var(--enter-y))]",
				"[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(var(--enter-y))]",
				"data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
				"data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]",
				"data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]",
				"data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
				// Cor por tipo — o que o `richColors` do sonner dava. Borda completa e
				// tint de fundo; nada de faixa colorida de um lado só.
				//
				// O tint é `color-mix` sobre `--popover`, não `bg-success/10`: aquilo é
				// uma cor com 10% de alfa, e como é a MESMA propriedade do `bg-popover`
				// da base, substituía o fundo em vez de somar — o toast ficava 90%
				// transparente e o conteúdo da página atravessava o texto.
				"data-[type=error]:border-destructive/40 data-[type=error]:bg-[color-mix(in_oklab,var(--destructive)_14%,var(--popover))]",
				className
			)}
			{...props}
		/>
	)
}

function ToastContent({ className, ...props }: ToastPrimitive.Content.Props) {
	return (
		<ToastPrimitive.Content
			data-slot="toast-content"
			className={cn(
				"flex h-full items-center gap-3 overflow-hidden p-4 transition-opacity duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] data-behind:opacity-0 data-expanded:opacity-100",
				className
			)}
			{...props}
		/>
	)
}

function ToastTitle({ className, ...props }: ToastPrimitive.Title.Props) {
	return <ToastPrimitive.Title data-slot="toast-title" className={cn("text-sm font-medium", className)} {...props} />
}

function ToastDescription({ className, ...props }: ToastPrimitive.Description.Props) {
	return <ToastPrimitive.Description data-slot="toast-description" className={cn("text-muted-foreground text-sm", className)} {...props} />
}

function ToastAction({ className, render = <Button variant="outline" size="sm" />, ...props }: ToastPrimitive.Action.Props) {
	return <ToastPrimitive.Action data-slot="toast-action" render={render} className={cn("shrink-0", className)} {...props} />
}

function ToastClose({ className, children, render = <Button variant="ghost" size="icon-sm" />, ...props }: ToastPrimitive.Close.Props) {
	return (
		<ToastPrimitive.Close
			data-slot="toast-close"
			aria-label="Fechar aviso"
			render={render}
			className={cn("text-muted-foreground hover:text-foreground relative shrink-0 after:absolute after:-inset-2 after:content-['']", className)}
			{...props}
		>
			{children ?? <Xmark aria-hidden="true" />}
		</ToastPrimitive.Close>
	)
}

const TYPE_ICON: Record<string, React.ReactNode> = {
	success: <CheckCircle aria-hidden="true" />,
	info: <InfoCircle aria-hidden="true" />,
	warning: <WarningTriangle aria-hidden="true" />,
	error: <XmarkCircle className="text-destructive" aria-hidden="true" />,
	loading: <Refresh className="animate-spin" aria-hidden="true" />,
}

function ToastIcon({ type, icon }: { type: string | undefined; icon?: React.ReactNode }) {
	const node = icon ?? (type ? TYPE_ICON[type] : null)
	if (!node) return null
	return (
		<span data-slot="toast-icon" className="shrink-0 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4">
			{node}
		</span>
	)
}

function ToastList({ position }: { position: ToastPosition }) {
	const { toasts } = ToastPrimitive.useToastManager<ToastData>()
	const anchor = position.startsWith("top") ? "top" : "bottom"

	return toasts.map((item) => (
		<Toast key={item.id} toast={item} data-position={anchor} swipeDirection={anchor === "top" ? ["up", "right"] : ["down", "right"]}>
			<ToastContent>
				<ToastIcon type={item.type} icon={item.data?.icon} />
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<ToastTitle />
					<ToastDescription />
				</div>
				<ToastAction />
				<ToastClose />
			</ToastContent>
		</Toast>
	))
}

function Toaster({
	children,
	position = "bottom-right",
	viewportClassName,
	toastManager: manager = toastManager,
	...props
}: ToastPrimitive.Provider.Props & { position?: ToastPosition; viewportClassName?: string }) {
	return (
		<ToastProvider toastManager={manager} {...props}>
			{children}
			<ToastPortal>
				<ToastViewport data-position={position} className={cn(VIEWPORT_POSITION[position], viewportClassName)}>
					<ToastList position={position} />
				</ToastViewport>
			</ToastPortal>
		</ToastProvider>
	)
}

/* -------------------------------------------------------------------------- */
/*  Fachada com o formato do `sonner`                                          */
/* -------------------------------------------------------------------------- */

export interface ToastOptions {
	/** Reusar o mesmo id ATUALIZA o aviso no lugar de empilhar outro. */
	id?: string
	description?: React.ReactNode
	/** ms até fechar sozinho. `Infinity` (ou 0) deixa aberto até fecharem. */
	duration?: number
	icon?: React.ReactNode
	action?: { label: React.ReactNode; onClick: () => void }
	/**
	 * Aceito por compatibilidade com o `sonner` e ignorado: aqui o botão de
	 * fechar existe em todo aviso, não é opcional.
	 */
	closeButton?: boolean
}

function toTimeout(duration: number | undefined) {
	if (duration === undefined) return undefined
	return Number.isFinite(duration) ? duration : 0
}

function emit(type: string | undefined, message: React.ReactNode, options?: ToastOptions) {
	const action = options?.action
	// O `Action` do Base UI não fecha o aviso sozinho; o do `sonner` fecha. Sem
	// isto, clicar em "Desfazer" deixaria na tela o aviso do que acabou de ser
	// desfeito. O id só existe depois do `add`, daí a captura por closure.
	let id = options?.id
	id = toastManager.add({
		id,
		type,
		title: message,
		description: options?.description,
		timeout: toTimeout(options?.duration),
		actionProps: action
			? {
					children: action.label,
					onClick: () => {
						action.onClick()
						if (id) toastManager.close(id)
					},
				}
			: undefined,
		data: options?.icon ? { icon: options.icon } : undefined,
	})
	return id
}

/**
 * Mesma superfície do `toast` do `sonner` (`success`/`error`/`warning`/`info`/
 * `loading`/`dismiss`/`promise` e a chamada direta), sobre o Toast do Base UI.
 *
 * A fachada existe porque a troca de biblioteca não vale um mutirão em ~400
 * pontos de chamada: `add({ title, type })` é a API do primitivo, `toast.error(msg)`
 * é a que o app inteiro já fala. Quem precisar do primitivo cru usa
 * `toastManager` ou `useToastManager`.
 */
const toast = Object.assign((message: React.ReactNode, options?: ToastOptions) => emit(undefined, message, options), {
	success: (message: React.ReactNode, options?: ToastOptions) => emit("success", message, options),
	error: (message: React.ReactNode, options?: ToastOptions) => emit("error", message, options),
	warning: (message: React.ReactNode, options?: ToastOptions) => emit("warning", message, options),
	info: (message: React.ReactNode, options?: ToastOptions) => emit("info", message, options),
	message: (message: React.ReactNode, options?: ToastOptions) => emit(undefined, message, options),
	/** Sem `duration`, fica aberto — quem abre um "carregando" é quem o fecha. */
	loading: (message: React.ReactNode, options?: ToastOptions) => emit("loading", message, { duration: Number.POSITIVE_INFINITY, ...options }),
	/** Sem id, dispensa todos. */
	dismiss: (id?: string) => toastManager.close(id),
	promise: toastManager.promise,
})

const useToastManager = ToastPrimitive.useToastManager

export {
	Toast,
	ToastAction,
	ToastClose,
	ToastContent,
	ToastDescription,
	Toaster,
	ToastPortal,
	ToastProvider,
	ToastTitle,
	ToastViewport,
	toast,
	toastManager,
	useToastManager,
}
