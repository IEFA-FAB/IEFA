import { Check, CheckCheck, Copy, FileText } from "lucide-react"
import type React from "react"
import { useState } from "react"
import type { UgMessage } from "../utils/generator"

interface MessageListProps {
	messages: UgMessage[]
}

export const MessageList: React.FC<MessageListProps> = ({ messages }) => {
	const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
	const [copiedAll, setCopiedAll] = useState(false)

	const handleCopy = async (text: string, index: number) => {
		try {
			await navigator.clipboard.writeText(text)
			setCopiedIndex(index)
			setTimeout(() => setCopiedIndex(null), 2000)
		} catch (_err) {}
	}

	const handleCopyAll = async () => {
		try {
			const allText = messages.map((m) => m.message).join("\n\n--------------------------------------------------------------------------------\n\n")
			await navigator.clipboard.writeText(allText)
			setCopiedAll(true)
			setTimeout(() => setCopiedAll(false), 2000)
		} catch (_err) {}
	}

	if (messages.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center p-12 text-center bg-slate-50 border border-slate-200 rounded-2xl">
				<div className="w-16 h-16 mb-4 rounded-full bg-slate-100 flex items-center justify-center">
					<FileText className="w-8 h-8 text-slate-400" />
				</div>
				<h3 className="text-lg font-medium text-slate-900 mb-2">Nenhuma ocorrência encontrada</h3>
				<p className="text-slate-500 max-w-sm">Nenhuma ocorrência de saldo alongado foi identificada na planilha analisada.</p>
			</div>
		)
	}

	return (
		<div className="space-y-8">
			<div className="flex items-center justify-between pb-4 border-b border-slate-200">
				<div className="flex items-center gap-4">
					<h2 className="text-xl font-semibold text-slate-900">Mensagens Geradas ({messages.length})</h2>
					<span className="px-3 py-1 text-xs font-medium bg-fab-100 text-fab-700 rounded-full">Prontas para envio</span>
				</div>
				<button
					onClick={handleCopyAll}
					className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-fab-600 border border-transparent rounded-lg hover:bg-fab-700 transition-colors focus:outline-none focus:ring-2 focus:ring-fab-500 focus:ring-offset-1 shadow-sm"
				>
					{copiedAll ? (
						<>
							<CheckCheck className="w-4 h-4" />
							<span>Copiado!</span>
						</>
					) : (
						<>
							<Copy className="w-4 h-4" />
							<span>Copiar Todas</span>
						</>
					)}
				</button>
			</div>

			<div className="space-y-6">
				{messages.map((msg, index) => (
					<div key={msg.ug} className="group relative bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all hover:shadow-md">
						<div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-100">
							<div className="flex items-center gap-3">
								<div className="w-8 h-8 rounded-lg bg-fab-600 flex items-center justify-center text-white font-bold text-sm">UG</div>
								<h3 className="text-lg font-bold text-slate-800">{msg.ug}</h3>
							</div>
							<button
								onClick={() => handleCopy(msg.message, index)}
								className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-fab-600 transition-colors focus:outline-none focus:ring-2 focus:ring-fab-500 focus:ring-offset-1"
								aria-label="Copiar mensagem"
							>
								{copiedIndex === index ? (
									<>
										<Check className="w-4 h-4 text-emerald-500" />
										<span className="text-emerald-600">Copiado!</span>
									</>
								) : (
									<>
										<Copy className="w-4 h-4" />
										<span>Copiar</span>
									</>
								)}
							</button>
						</div>
						<div className="p-6 bg-white">
							<pre className="whitespace-pre-wrap font-sans text-sm text-slate-700 leading-relaxed">{msg.message}</pre>
						</div>
					</div>
				))}
			</div>
		</div>
	)
}
