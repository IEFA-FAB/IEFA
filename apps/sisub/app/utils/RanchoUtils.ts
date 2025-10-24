export interface DayMeals {
    cafe: boolean;
    almoco: boolean;
    janta: boolean;
    ceia: boolean;
  }
  
  export const createEmptyDayMeals = (): DayMeals => ({
    cafe: false,
    almoco: false,
    janta: false,
    ceia: false,
  });
  
  export const formatDate = (dateString: string): string => {
    const date = new Date(dateString + "T00:00:00");
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };
  
  export const getDayOfWeek = (dateString: string): string => {
    const date = new Date(dateString + "T00:00:00");
    return date.toLocaleDateString("pt-BR", { weekday: "long" });
  };
  
  export const isDateNear = (dateString: string, threshold: number = 2): boolean => {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + threshold);
    return new Date(dateString + "T00:00:00") <= targetDate;
  };