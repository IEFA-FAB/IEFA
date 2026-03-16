"use client"

import { Check, Copy } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export default function CopyButton({ content }: { content: string }) {
	const [copied, setCopied] = useState(false)

	const handleCopy = () => {
		navigator.clipboard.writeText(content)
		setCopied(true)
		setTimeout(() => setCopied(false), 2000)
	}

	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button variant="ghost" size="sm" onClick={handleCopy}>
						{copied ? (
							<>
								<Check className="size-4 text-green-500" />
								<span className="ml-1 text-xs text-green-500">Copiado!</span>
							</>
						) : (
							<Copy className="size-4" />
						)}
					</Button>
				}
			></TooltipTrigger>
			<TooltipContent>Copiar conteúdo</TooltipContent>
		</Tooltip>
	)
}
