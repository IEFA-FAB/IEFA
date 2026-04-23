import { Check, ChevronDown } from "lucide-react"
import { useEffect, useRef, useState } from "react"

interface Option {
	value: string
	label: string
}

interface CustomSelectProps {
	value: string
	onChange: (value: string) => void
	options: Option[]
	placeholder?: string
	className?: string
	isDarkMode?: boolean
}

export const CustomSelect: React.FC<CustomSelectProps> = ({ value, onChange, options, placeholder = "Selecione...", className = "", isDarkMode = false }) => {
	const [isOpen, setIsOpen] = useState(false)
	const [searchTerm, setSearchTerm] = useState("")
	const containerRef = useRef<HTMLDivElement>(null)

	const selectedOption = options.find((opt) => opt.value === value)

	const filteredOptions = options.filter((opt) => opt.label.toLowerCase().includes(searchTerm.toLowerCase()))

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
				setIsOpen(false)
			}
		}
		document.addEventListener("mousedown", handleClickOutside)
		return () => {
			document.removeEventListener("mousedown", handleClickOutside)
		}
	}, [])

	useEffect(() => {
		if (isOpen) setSearchTerm("")
	}, [isOpen])

	return (
		<div className={`relative ${className}`} ref={containerRef}>
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className={`w-full flex items-center justify-between px-3 py-2 text-xs sm:text-sm font-medium rounded-lg border transition-all
          ${
						isDarkMode
							? "bg-slate-800 border-slate-700 text-slate-200 hover:border-slate-500 hover:bg-slate-750"
							: "bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-400 hover:bg-slate-100"
					}
          focus:ring-2 focus:ring-blue-500/50
          ${isOpen ? "ring-2 ring-blue-500/50 border-blue-500" : ""}
        `}
			>
				<span className="truncate mr-2">{selectedOption ? selectedOption.label : placeholder}</span>
				<ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""} ${isDarkMode ? "text-slate-400" : "text-slate-500"}`} />
			</button>

			{isOpen && (
				<div
					className={`absolute z-50 w-full mt-1 border rounded-lg shadow-xl max-h-80 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100
          ${isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}
				>
					<div className={`p-2 border-b ${isDarkMode ? "border-slate-700" : "border-slate-100"}`}>
						<input
							type="text"
							className={`w-full px-2 py-1 text-xs border rounded outline-none focus:ring-1 focus:ring-blue-500
                ${isDarkMode ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-slate-200 text-slate-900"}`}
							placeholder="Pesquisar..."
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							// biome-ignore lint/a11y/noAutofocus: needed for UX
							autoFocus
						/>
					</div>
					<div className="overflow-y-auto py-1 custom-scrollbar">
						{filteredOptions.length === 0 ? (
							<div className="px-3 py-4 text-center text-xs text-slate-500 italic">Nenhum resultado</div>
						) : (
							filteredOptions.map((option) => (
								<button
									key={option.value}
									type="button"
									onClick={() => {
										onChange(option.value)
										setIsOpen(false)
									}}
									className={`w-full text-left px-3 py-2 text-xs sm:text-sm flex items-center justify-between transition-colors
                    ${
											option.value === value
												? isDarkMode
													? "bg-blue-600/20 text-blue-400 font-semibold"
													: "bg-blue-50 text-blue-600 font-semibold"
												: isDarkMode
													? "text-slate-300 hover:bg-slate-700"
													: "text-slate-700 hover:bg-slate-100"
										}
                  `}
								>
									<span className="truncate">{option.label}</span>
									{option.value === value && <Check className="w-3 h-3 ml-2" />}
								</button>
							))
						)}
					</div>
				</div>
			)}
		</div>
	)
}
