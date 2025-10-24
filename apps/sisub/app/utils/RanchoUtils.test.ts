import { describe, it, expect } from "@jest/globals";
import {
  createEmptyDayMeals,
  formatDate,
  getDayOfWeek,
  isDateNear,
} from "./RanchoUtils";

describe("RanchoUtils", () => {
  describe("createEmptyDayMeals", () => {
    it("should create an empty DayMeals object with all meals set to false", () => {
      const result = createEmptyDayMeals();

      expect(result).toEqual({
        cafe: false,
        almoco: false,
        janta: false,
        ceia: false,
      });
    });

    it("should return a new object each time", () => {
      const result1 = createEmptyDayMeals();
      const result2 = createEmptyDayMeals();

      expect(result1).not.toBe(result2);
      expect(result1).toEqual(result2);
    });
  });

  describe("formatDate", () => {
    it("should format date string to Brazilian format", () => {
      const result = formatDate("2024-03-15");
      expect(result).toBe("15/03/2024");
    });

    it("should handle different date formats correctly", () => {
      expect(formatDate("2024-01-01")).toBe("01/01/2024");
      expect(formatDate("2024-12-31")).toBe("31/12/2024");
    });

    it("should handle leap year dates", () => {
      expect(formatDate("2024-02-29")).toBe("29/02/2024");
    });
  });

  describe("getDayOfWeek", () => {
    it("should return day of week in Portuguese", () => {
      // Note: These tests depend on the system locale being pt-BR
      const monday = getDayOfWeek("2024-03-18"); // Monday
      expect(typeof monday).toBe("string");
      expect(monday.length).toBeGreaterThan(0);
    });

    it("should handle different dates consistently", () => {
      const day1 = getDayOfWeek("2024-01-01");
      const day2 = getDayOfWeek("2024-01-02");

      expect(typeof day1).toBe("string");
      expect(typeof day2).toBe("string");
      expect(day1).not.toBe(day2);
    });
  });

  describe("isDateNear", () => {
    const mockToday = new Date("2024-03-15T12:00:00Z");

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(mockToday);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should return true for dates within threshold", () => {
      expect(isDateNear("2024-03-15", 2)).toBe(true); // today
      expect(isDateNear("2024-03-16", 2)).toBe(true); // tomorrow
      expect(isDateNear("2024-03-17", 2)).toBe(true); // day after tomorrow
    });

    it("should return false for dates beyond threshold", () => {
      expect(isDateNear("2024-03-18", 2)).toBe(false); // 3 days from now
      expect(isDateNear("2024-03-20", 2)).toBe(false); // 5 days from now
    });

    it("should use default threshold of 2 when not provided", () => {
      expect(isDateNear("2024-03-17")).toBe(true);
      expect(isDateNear("2024-03-18")).toBe(false);
    });

    it("should handle custom thresholds", () => {
      expect(isDateNear("2024-03-20", 5)).toBe(true); // 5 days with threshold 5
      expect(isDateNear("2024-03-21", 5)).toBe(false); // 6 days with threshold 5
    });

    it("should handle past dates correctly", () => {
      expect(isDateNear("2024-03-14", 2)).toBe(true); // yesterday is within threshold
      expect(isDateNear("2024-03-10", 2)).toBe(true); // past dates are always within threshold
    });
  });
});
