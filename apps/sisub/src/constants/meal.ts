import { Coffee, Moon, Sun, Utensils } from "lucide-react"

export const MEAL_TYPES = [
	{
		value: "cafe",
		label: "Café",
		icon: Coffee,
		color: "bg-orange-100 text-orange-800",
		time: "06:30",
	},
	{
		value: "almoco",
		label: "Almoço",
		icon: Utensils,
		color: "bg-green-100 text-green-800",
		time: "11:30",
	},
	{
		value: "janta",
		label: "Jantar",
		icon: Moon,
		color: "bg-blue-100 text-blue-800",
		time: "17:30",
	},
	{
		value: "ceia",
		label: "Ceia",
		icon: Sun,
		color: "bg-purple-100 text-purple-800",
		time: "21:00",
	},
] as const

/** Dias a partir de hoje que o comensal não edita mais: a cozinha precisa de antecedência. */
export const NEAR_DATE_THRESHOLD = 2
