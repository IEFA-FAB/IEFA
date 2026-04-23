import type React from "react"
import type { FabDocumentData } from "../services/gemini"

interface FabDocumentProps {
	data: FabDocumentData
	onChange?: (newData: FabDocumentData) => void
}

export const FabDocument: React.FC<FabDocumentProps> = ({ data, onChange }) => {
	const handleFieldChange = (field: keyof FabDocumentData, value: any) => {
		if (onChange) {
			onChange({ ...data, [field]: value })
		}
	}

	const handleArrayChange = (field: "references" | "annexes" | "paragraphs", index: number, value: string) => {
		if (onChange) {
			const newArray = [...(data[field] || [])]
			newArray[index] = value
			onChange({ ...data, [field]: newArray })
		}
	}

	return (
		<div className="bg-white shadow-2xl mx-auto my-8 p-[2.5cm] w-[210mm] min-h-[297mm] text-black font-serif text-[12pt] leading-relaxed relative print:shadow-none print:my-0 print:p-[2cm]">
			{/* Urgency Tag */}
			{data.urgency && (
				<div className="absolute top-8 right-8 bg-red-600 text-white px-4 py-1 font-bold text-[10pt] uppercase tracking-widest shadow-sm">URGENTE</div>
			)}

			{/* Header */}
			<div className="flex flex-col items-center text-center mb-10">
				<img
					src="https://upload.wikimedia.org/wikipedia/commons/thumb/b/bf/Coat_of_arms_of_Brazil.svg/500px-Coat_of_arms_of_Brazil.svg.png"
					alt="Brasão da República"
					className="w-16 h-16 mb-4"
					referrerPolicy="no-referrer"
				/>
				<div className="font-bold text-[13pt] uppercase tracking-tight">MINISTÉRIO DA DEFESA</div>
				<div className="font-bold text-[12pt] uppercase tracking-tight">COMANDO DA AERONÁUTICA</div>
				<div className="font-bold text-[11pt] uppercase border-b border-black pb-1 px-4 w-full mt-1">
					<input
						value={data.organization}
						onChange={(e) => handleFieldChange("organization", e.target.value)}
						className="w-full bg-transparent text-center border-none focus:ring-1 focus:ring-blue-500 rounded p-0 uppercase"
					/>
					{data.subOrganization !== undefined && (
						<input
							value={data.subOrganization}
							onChange={(e) => handleFieldChange("subOrganization", e.target.value)}
							className="w-full bg-transparent text-center border-none focus:ring-1 focus:ring-blue-500 rounded p-0 uppercase text-[10pt] mt-0.5"
						/>
					)}
				</div>
			</div>

			{/* Doc ID and Date */}
			<div className="flex justify-between items-start mb-6 text-[11pt]">
				<div className="flex-1">
					<div className="font-bold flex items-center">
						Ofício nº
						<input
							value={data.documentNumber}
							onChange={(e) => handleFieldChange("documentNumber", e.target.value)}
							className="bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded p-0 w-12 ml-1 font-bold"
						/>
						/
						<input
							value={data.acronym}
							onChange={(e) => handleFieldChange("acronym", e.target.value)}
							className="bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded p-0 w-24 font-bold"
						/>
						/
						<input
							value={data.year}
							onChange={(e) => handleFieldChange("year", e.target.value)}
							className="bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded p-0 w-12 font-bold"
						/>
					</div>
					<div className="text-[10pt] flex items-center mt-1 text-slate-600">
						<span className="font-bold mr-1">Protocolo COMAER nº</span>
						<input
							value={data.protocol}
							onChange={(e) => handleFieldChange("protocol", e.target.value)}
							className="bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded p-0 flex-1 italic"
						/>
					</div>
				</div>
				<div className="text-right flex items-center justify-end font-medium">
					<input
						value={data.city}
						onChange={(e) => handleFieldChange("city", e.target.value)}
						className="bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded p-0 text-right w-24"
					/>
					,
					<input
						value={data.date}
						onChange={(e) => handleFieldChange("date", e.target.value)}
						className="bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded p-0 text-right w-48 ml-1"
					/>
					.
				</div>
			</div>

			{/* Sender and Recipient */}
			<div className="mb-10 space-y-2 text-[11pt]">
				<div className="flex items-center">
					<span className="font-bold w-12">Do</span>
					<input
						value={data.sender}
						onChange={(e) => handleFieldChange("sender", e.target.value)}
						className="bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded p-0 flex-1"
					/>
				</div>
				<div className="flex items-start">
					<span className="font-bold w-12">Ao</span>
					<textarea
						value={data.recipient}
						onChange={(e) => handleFieldChange("recipient", e.target.value)}
						className="bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded p-0 flex-1 resize-none"
						rows={2}
					/>
				</div>
			</div>

			{/* Subject */}
			<div className="mb-6 flex items-start text-[11pt]">
				<span className="font-bold mr-2 shrink-0">Assunto:</span>
				<textarea
					value={data.subject}
					onChange={(e) => handleFieldChange("subject", e.target.value)}
					className="bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded p-0 flex-1 resize-none font-bold uppercase"
					rows={2}
				/>
			</div>

			{/* References */}
			{data.references && data.references.length > 0 && (
				<div className="mb-6 flex items-start text-[10pt] text-slate-700">
					<span className="font-bold mr-2 shrink-0 text-black">Referência:</span>
					<div className="flex-1 space-y-1">
						{data.references.map((ref, idx) => (
							<div key={idx} className="flex items-start">
								<span className="mr-2">{idx + 1}.</span>
								<textarea
									value={ref}
									onChange={(e) => handleArrayChange("references", idx, e.target.value)}
									className="bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded p-0 flex-1 resize-none italic"
									rows={1}
								/>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Annexes */}
			{data.annexes && data.annexes.length > 0 && (
				<div className="mb-8 flex items-start text-[10pt] text-slate-700">
					<span className="font-bold mr-2 shrink-0 text-black">Anexo:</span>
					<div className="flex-1 space-y-1">
						{data.annexes.map((annex, idx) => (
							<div key={idx} className="flex items-start">
								<span className="mr-2">{String.fromCharCode(65 + idx)}.</span>
								<textarea
									value={annex}
									onChange={(e) => handleArrayChange("annexes", idx, e.target.value)}
									className="bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded p-0 flex-1 resize-none italic"
									rows={1}
								/>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Body */}
			<div className="space-y-6 mb-24 text-justify text-[11pt]">
				{data.paragraphs.map((p, idx) => (
					<div key={idx} className="flex items-start gap-4">
						<span className="w-6 flex-shrink-0 text-right font-bold">{idx + 1}.</span>
						<textarea
							value={p}
							onChange={(e) => handleArrayChange("paragraphs", idx, e.target.value)}
							className="bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded p-0 flex-1 resize-none text-justify leading-relaxed"
							rows={Math.max(2, Math.ceil(p.length / 85))}
						/>
					</div>
				))}
			</div>

			{/* Signer */}
			<div className="mt-auto pt-12 flex flex-col items-center text-center">
				<div className="border-t border-black w-64 mb-4"></div>
				<div className="font-bold uppercase flex flex-col items-center">
					<input
						value={data.signerName}
						onChange={(e) => handleFieldChange("signerName", e.target.value)}
						className="bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded p-0 text-center font-bold text-[12pt] w-full"
					/>
					<div className="flex items-center justify-center gap-1 mt-1">
						<input
							value={data.signerRank}
							onChange={(e) => handleFieldChange("signerRank", e.target.value)}
							className="bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded p-0 text-center font-bold w-24"
						/>
						<span className="font-bold">-</span>
						<input
							value={data.signerPosition}
							onChange={(e) => handleFieldChange("signerPosition", e.target.value)}
							className="bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded p-0 text-center text-[10pt] w-48"
						/>
					</div>
				</div>

				{/* Footer Logo */}
				<div className="mt-12 flex flex-col items-center opacity-80">
					<div className="bg-slate-900 text-white px-5 py-1.5 flex items-center gap-3 rounded-sm text-[9pt] tracking-widest uppercase font-medium">
						<span className="italic">Asas que protegem o País</span>
						<div className="w-px h-4 bg-slate-700"></div>
						<img
							src="https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Emblema_da_For%C3%A7a_A%C3%A9rea_Brasileira.svg/1200px-Emblema_da_For%C3%A7a_A%C3%A9rea_Brasileira.svg.png"
							alt="FAB Logo"
							className="h-5 invert brightness-0"
							referrerPolicy="no-referrer"
						/>
					</div>
				</div>
			</div>
		</div>
	)
}
