/** biome-ignore-all lint/a11y/useKeyWithClickEvents: o clique no addon só repassa o foco ao campo, que já é alcançável por Tab */
/** biome-ignore-all lint/a11y/useSemanticElements: `role="group"` agrupa o campo e o addon sem a moldura de um `<fieldset>` */
import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Textarea } from "#/components/ui/textarea"
import { cn } from "#/lib/utils"

/**
 * Campo com ícone, texto ou ação dentro do contorno (busca com lupa, senha com "mostrar", chat com
 * "enviar"). Portado de `apps/sisub/src/components/ui/input-group.tsx`, com o raio e as alturas do
 * `Input` do sucont.
 *
 * O grupo desenha borda, fundo e foco; o campo interno não tem nenhum dos três. Só o foco do CAMPO
 * acende o grupo: o `InputGroupButton` tem anel próprio, e acender os dois daria dois anéis
 * concêntricos quando o Tab está no botão.
 */
function InputGroup({ className, size = "default", ...props }: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
	return (
		<div
			data-slot="input-group"
			data-size={size}
			role="group"
			className={cn(
				"group/input-group relative flex h-9 w-full min-w-0 items-center rounded-md border border-input bg-background shadow-xs transition-[color,box-shadow] outline-none data-[size=sm]:h-8 dark:bg-input/30",
				"has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-3 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50",
				"has-[[data-slot][aria-invalid=true]]:border-destructive has-[[data-slot][aria-invalid=true]]:ring-3 has-[[data-slot][aria-invalid=true]]:ring-destructive/20 dark:has-[[data-slot][aria-invalid=true]]:ring-destructive/40",
				// Só o campo desabilitado apaga o grupo: o "enviar" desabilitado com o campo vazio, não.
				"has-[[data-slot=input-group-control]:disabled]:opacity-50",
				// Somente leitura, como em `READ_ONLY_FIELD` (`field-states.ts`): quem desenha o contorno aqui
				// é o grupo, então a regra é a mesma escrita a partir dele.
				"has-[[data-slot=input-group-control][readonly]:not(:disabled)]:border-dashed has-[[data-slot=input-group-control][readonly]:not(:disabled)]:bg-muted dark:has-[[data-slot=input-group-control][readonly]:not(:disabled)]:bg-muted/50",
				"has-[>textarea]:h-auto",
				// O `data-[size=sm]:h-8` pesa mais que o `has-*:h-auto`; com textarea ou addon de bloco o
				// grupo cresce também no `sm`.
				"data-[size=sm]:has-[>textarea]:h-auto data-[size=sm]:has-[>[data-align=block-end]]:h-auto data-[size=sm]:has-[>[data-align=block-start]]:h-auto",
				"has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col",
				"has-[>[data-align=block-end]]:[&>input]:pt-3 has-[>[data-align=block-start]]:[&>input]:pb-3 has-[>[data-align=inline-end]]:[&>input]:pr-1.5 has-[>[data-align=inline-start]]:[&>input]:pl-1.5",
				className
			)}
			{...props}
		/>
	)
}

const inputGroupAddonVariants = cva(
	"flex h-auto cursor-text items-center justify-center gap-2 py-1.5 text-sm font-medium text-muted-foreground select-none group-has-[[data-slot=input-group-control][readonly]]/input-group:cursor-default [&>svg:not([class*='size-'])]:size-4",
	{
		variants: {
			align: {
				"inline-start": "order-first pl-3 has-[>button]:pl-1 group-data-[size=sm]/input-group:pl-2.5 group-data-[size=sm]/input-group:has-[>button]:pl-0.5",
				"inline-end": "order-last pr-3 has-[>button]:pr-1 group-data-[size=sm]/input-group:pr-2.5 group-data-[size=sm]/input-group:has-[>button]:pr-0.5",
				"block-start": "order-first w-full justify-start px-3 pt-2 [.border-b]:pb-2",
				"block-end": "order-last w-full justify-start px-3 pb-2 [.border-t]:pt-2",
			},
		},
		defaultVariants: {
			align: "inline-start",
		},
	}
)

function InputGroupAddon({ className, align = "inline-start", onClick, ...props }: React.ComponentProps<"div"> & VariantProps<typeof inputGroupAddonVariants>) {
	return (
		<div
			role="group"
			data-slot="input-group-addon"
			data-align={align}
			className={cn(inputGroupAddonVariants({ align }), className)}
			{...props}
			// O `onClick` de quem usa soma ao repasse de foco, em vez de substituí-lo.
			onClick={(e) => {
				onClick?.(e)
				if (e.defaultPrevented || (e.target as HTMLElement).closest("button")) {
					return
				}
				e.currentTarget.parentElement?.querySelector<HTMLElement>("input, textarea")?.focus()
			}}
		/>
	)
}

// Os tamanhos são os do `Button`; os dois maiores encolhem para caber no `sm` (h-8, 30px por dentro), e
// os dois menores levam o ícone a 14px, perto dos 16px do ícone do addon. O seletor repete o do `Button`
// letra por letra para o tailwind-merge trocar o `size-3` dele em vez de somar os dois.
const inputGroupButtonVariants = cva("shadow-none", {
	variants: {
		size: {
			xs: "rounded-sm [&_svg:not([class*='size-']):not([class^='w-']):not([class*='_w-']):not([class^='h-']):not([class*='_h-'])]:size-3.5",
			sm: "h-7 rounded-sm",
			"icon-xs": "rounded-sm [&_svg:not([class*='size-']):not([class^='w-']):not([class*='_w-']):not([class^='h-']):not([class*='_h-'])]:size-3.5",
			"icon-sm": "size-7 rounded-sm",
		},
	},
	defaultVariants: {
		size: "xs",
	},
})

function InputGroupButton({
	className,
	type = "button",
	variant = "ghost",
	size = "xs",
	...props
}: Omit<React.ComponentProps<typeof Button>, "size" | "type"> &
	VariantProps<typeof inputGroupButtonVariants> & {
		type?: "button" | "submit" | "reset"
	}) {
	return <Button type={type} variant={variant} size={size} className={cn(inputGroupButtonVariants({ size }), className)} {...props} />
}

function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
	return (
		<span
			className={cn("flex items-center gap-2 text-sm text-muted-foreground [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4", className)}
			{...props}
		/>
	)
}

// A altura vem do grupo (`self-stretch`), não do `size` do `Input`, para o campo nunca vazar a borda.
function InputGroupInput({ className, ...props }: Omit<React.ComponentProps<typeof Input>, "size">) {
	return (
		<Input
			data-slot="input-group-control"
			className={cn(
				"h-auto flex-1 self-stretch rounded-none border-0 bg-transparent shadow-none ring-0 focus-visible:ring-0 aria-invalid:ring-0 dark:bg-transparent",
				// A opacidade de desabilitado já vem do grupo; somada à do campo, o texto sumiria.
				// Somente leitura e o "x" nativo da busca ficam com o grupo: o fundo é dele, e o botão de limpar
				// do próprio grupo já existe onde faz sentido.
				"[&[readonly]:not(:disabled)]:bg-transparent dark:[&[readonly]:not(:disabled)]:bg-transparent [&::-webkit-search-cancel-button]:appearance-none disabled:opacity-100 group-data-[size=sm]/input-group:px-2.5",
				className
			)}
			{...props}
		/>
	)
}

function InputGroupTextarea({ className, ...props }: React.ComponentProps<"textarea">) {
	return (
		<Textarea
			data-slot="input-group-control"
			className={cn(
				"flex-1 resize-none rounded-none border-0 bg-transparent py-2 shadow-none ring-0 focus-visible:ring-0 disabled:bg-transparent aria-invalid:ring-0 dark:bg-transparent dark:disabled:bg-transparent",
				"[&[readonly]:not(:disabled)]:bg-transparent dark:[&[readonly]:not(:disabled)]:bg-transparent disabled:opacity-100",
				className
			)}
			{...props}
		/>
	)
}

export { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText, InputGroupTextarea }
