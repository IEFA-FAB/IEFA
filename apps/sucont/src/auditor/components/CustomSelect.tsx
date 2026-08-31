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
}

export const CustomSelect: React.FC<CustomSelectProps> = ({ value, onChange, options, placeholder = "Selecione...", className = "" }) => {
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
          bg-muted/50 border-border text-foreground hover:bg-muted
          focus:ring-2 focus-visible:ring-ring/50
          ${isOpen ? "ring-2 ring-ring/50 border-blue-500" : ""}
        `}
			>
				<span className="truncate mr-2">{selectedOption ? selectedOption.label : placeholder}</span>
				<ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""} text-muted-foreground`} />
			</button>

			{isOpen && (
				<div
					className={`absolute z-50 w-full mt-1 border rounded-lg shadow-xl max-h-80 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100
          bg-card border-border`}
				>
					<div className={`p-2 border-b border-border`}>
						<input
							type="text"
							className={`w-full px-2 py-1 text-xs border rounded outline-none focus:ring-1 focus-visible:ring-ring
                bg-card border-border text-foreground`}
							placeholder="Pesquisar..."
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							// biome-ignore lint/a11y/noAutofocus: needed for UX
							autoFocus
						/>
					</div>
					<div className="overflow-y-auto py-1 custom-scrollbar">
						{filteredOptions.length === 0 ? (
							<div className="px-3 py-4 text-center text-xs text-muted-foreground italic">Nenhum resultado</div>
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
                    ${option.value === value ? "bg-accent text-accent-foreground font-semibold" : "text-foreground hover:bg-muted"}
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
