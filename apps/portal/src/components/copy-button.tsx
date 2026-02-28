"use client"

import { Button } from "@iefa/ui"
import { Check, Copy } from "lucide-react"
import { useState } from "react"

export default function CopyButton({ content }: { content: string }) {
	const [copied, setCopied] = useState(false)

	const handleCopy = () => {
		navigator.clipboard.writeText(content)
		setCopied(true)
		setTimeout(() => setCopied(false), 2000)
	}

	return (
		<Button variant="ghost" size="sm" onClick={handleCopy} title="Copiar conteúdo">
			{copied ? (
				<>
					<Check className="size-4 text-green-500" />
					<span className="ml-1 text-xs text-green-500">Copiado!</span>
				</>
			) : (
				<Copy className="size-4" />
			)}
		</Button>
	)
}
