
export type MealKey = "cafe" | "almoco" | "janta" | "ceia";

export interface ScannerState {
  isReady: boolean;
  isScanning: boolean;
  hasPermission: boolean;
  error?: string;
}

export interface PresenceRecord {
  id: string; // uuid do registro de presença
  user_id: string; // uuid do militar (nome da coluna do banco mantido)
  date: string; // yyyy-mm-dd
  meal: MealKey;
  unidade: string; // OM
  created_at: string;
}

export const MEAL_LABEL: Record<MealKey, string> = {
  cafe: "Café",
  almoco: "Almoço",
  janta: "Jantar",
  ceia: "Ceia",
};

export type DialogState = {
  open: boolean;
  uuid: string | null;
  systemForecast: boolean | null;
  willEnter: "sim" | "nao";
};

export const generateRestrictedDates = (): string[] => {
  const today = new Date();
  const dates: string[] = [];
  for (const offset of [-1, 0, 1]) {
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
};