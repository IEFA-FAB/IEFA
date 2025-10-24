
import { Coffee, Utensils, Moon, Sun } from "lucide-react";

export const FALLBACK_RANCHOS = [
  {
    value: "GAP-RJ - HCA",
    label: "GAP-RJ - HCA"
  },
  {
    value: "GAP-RJ - GAP SEDE",
    label: "GAP-RJ - GAP SEDE"
  },
  {
    value: "GAP-RJ - GARAGEM",
    label: "GAP-RJ - GARAGEM"
  },
  {
    value: "GAP-RJ - PAME",
    label: "GAP-RJ - PAME"
  },
  {
    value: "GAP-GL - GAP (BAGL)",
    label: "GAP-GL - GAP (BAGL)"
  },
  {
    value: "GAP-GL - CGABEG",
    label: "GAP-GL - CGABEG"
  },
  {
    value: "GAP-GL - HFAG",
    label: "GAP-GL - HFAG"
  },
  {
    value: "GAP-GL - CEMAL",
    label: "GAP-GL - CEMAL"
  },
  {
    value: "GAP-GL - PAMB",
    label: "GAP-GL - PAMB"
  },
  {
    value: "DIRAD - DIRAD",
    label: "DIRAD - DIRAD"
  },
  {
    value: "GAP-AF - BAAF (GAP-AF)",
    label: "GAP-AF - BAAF (GAP-AF)"
  },
  {
    value: "GAP-AF - CPA-AF",
    label: "GAP-AF - CPA-AF"
  },
  {
    value: "GAP-AF - HAAF",
    label: "GAP-AF - HAAF"
  },
  {
    value: "GAP-AF - UNIFA",
    label: "GAP-AF - UNIFA"
  },
  {
    value: "BASC - BASC",
    label: "BASC - BASC"
  },
  {
    value: "GAP-SP - BASP",
    label: "GAP-SP - BASP"
  },
  {
    value: "GAP-SP - PAMA-SP",
    label: "GAP-SP - PAMA-SP"
  },
  {
    value: "GAP-SP - GAP-SP",
    label: "GAP-SP - GAP-SP"
  },
  {
    value: "GAP-SP - HFASP",
    label: "GAP-SP - HFASP"
  },
  {
    value: "GAP-SP - BAST",
    label: "GAP-SP - BAST"
  },
  {
    value: "GAP-SP - COMGAP",
    label: "GAP-SP - COMGAP"
  },
  {
    value: "AFA - FAYS",
    label: "AFA - FAYS"
  },
  {
    value: "AFA - AFA",
    label: "AFA - AFA"
  },
  {
    value: "GAP-SJ - IEAV",
    label: "GAP-SJ - IEAV"
  },
  {
    value: "GAP-SJ - GAP-SJ",
    label: "GAP-SJ - GAP-SJ"
  },
  {
    value: "EPCAR - EPCAR",
    label: "EPCAR - EPCAR"
  },
  {
    value: "GAP-LS - CIAAR",
    label: "GAP-LS - CIAAR"
  },
  {
    value: "GAP-LS - PAMA-LS",
    label: "GAP-LS - PAMA-LS"
  },
  {
    value: "GAP-LS - ESQUADRAO DE SAUDE DE LS",
    label: "GAP-LS - ESQUADRAO DE SAUDE DE LS"
  },
  {
    value: "BASM - BASM",
    label: "BASM - BASM"
  },
  {
    value: "GAP-CO - BACO",
    label: "GAP-CO - BACO"
  },
  {
    value: "GAP-CO - GAP-CO",
    label: "GAP-CO - GAP-CO"
  },
  {
    value: "GAP-CO - HACO",
    label: "GAP-CO - HACO"
  },
  {
    value: "BAFL - BAFL",
    label: "BAFL - BAFL"
  },
  {
    value: "CINDACTA 2 - CINDACTA II",
    label: "CINDACTA 2 - CINDACTA II"
  },
  {
    value: "GAP-BE - BABE",
    label: "GAP-BE - BABE"
  },
  {
    value: "GAP-BE - COMARA",
    label: "GAP-BE - COMARA"
  },
  {
    value: "GAP-BE - HABE",
    label: "GAP-BE - HABE"
  },
  {
    value: "GAP-MN - DACO-MN",
    label: "GAP-MN - DACO-MN"
  },
  {
    value: "GAP-MN - GAP-MN",
    label: "GAP-MN - GAP-MN"
  },
  {
    value: "GAP-MN - CINDACTA IV",
    label: "GAP-MN - CINDACTA IV (em fase de ativação)"
  },
  {
    value: "GAP-MN - HAMN",
    label: "GAP-MN - HAMN"
  },
  {
    value: "BABV - BABV",
    label: "BABV - BABV"
  },
  {
    value: "BAPV - BAPV",
    label: "BAPV - BAPV"
  },
  {
    value: "CLA - CLA-AK",
    label: "CLA - CLA-AK"
  },
  {
    value: "BAFZ - BAFZ",
    label: "BAFZ - BAFZ"
  },
  {
    value: "BANT - BANT",
    label: "BANT - BANT"
  },
  {
    value: "BANT - CLBI",
    label: "BANT - CLBI"
  },
  {
    value: "GAP-RF - BARF",
    label: "GAP-RF - BARF"
  },
  {
    value: "GAP-RF - HARF",
    label: "GAP-RF - HARF"
  },
  {
    value: "GAP-RF - GAP-RF",
    label: "GAP-RF - GAP-RF"
  },
  {
    value: "BASV - BASV",
    label: "BASV - BASV"
  },
  {
    value: "BASV - CEMCOHA",
    label: "BASV - CEMCOHA"
  },
  {
    value: "GAP-DF - BABR-SUL",
    label: "GAP-DF - BABR-SUL"
  },
  {
    value: "GAP-DF - CACHIMBO-CPBV",
    label: "GAP-DF - CACHIMBO-CPBV"
  },
  {
    value: "GAP-DF - HFAB",
    label: "GAP-DF - HFAB"
  },
  {
    value: "GAP-DF - GAP DF – NORTE",
    label: "GAP-DF - GAP DF – NORTE"
  },
  {
    value: "GAP-BR - GAP BR",
    label: "GAP-BR - GAP BR"
  },
  {
    value: "GABAER - GABAER",
    label: "GABAER - GABAER"
  },
  {
    value: "BAAN - BAAN",
    label: "BAAN - BAAN"
  },
  {
    value: "BACG - BACG",
    label: "BACG - BACG"
  },
  {
    value: "EEAR - GSAU-GW",
    label: "EEAR - GSAU-GW"
  },
  {
    value: "EEAR - Rancho",
    label: "EEAR - Rancho"
  },
  {
    value: "EEAR - PAGW",
    label: "EEAR - PAGW"
  },
  {
    value: "EEAR - SCI",
    label: "EEAR - SCI"
  },
  {
    value: "EEAR - STRS",
    label: "EEAR - STRS"
  },
  {
    value: "GAP-BE - I COMAR",
    label: "GAP-BE - I COMAR"
  },
  {
    value: "EEAR - SGER",
    label: "EEAR - SGER"
  }

] as const;

export const FALLBACK_UNIDADES: readonly { value: string; label: string }[] = Array.from(
  new Set(
    FALLBACK_RANCHOS.map((r) => r.value.split(" - ")[0].trim())
  )
).map((u) => ({ value: u, label: u }))

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
] as const;

export const DEFAULT_UNIT = "DIRAD - DIRAD";
export const DAYS_TO_SHOW = 30;
export const NEAR_DATE_THRESHOLD = 2;
