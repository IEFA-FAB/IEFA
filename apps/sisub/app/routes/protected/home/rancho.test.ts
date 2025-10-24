import { describe, it, expect } from "@jest/globals";
import {
  MEAL_TYPES,
  DEFAULT_UNIT,
  DAYS_TO_SHOW,
  NEAR_DATE_THRESHOLD,
} from "../../../components/constants/rancho";
import { useRancho } from "~/components/hooks/useRancho";
const { ranchos: UNIDADES_DISPONIVEIS } = useRancho();
describe("Rancho Constants", () => {
  describe("UNIDADES_DISPONIVEIS", () => {
    it("should have the correct structure for each unit", () => {
      UNIDADES_DISPONIVEIS.forEach((unit) => {
        expect(unit).toHaveProperty("value");
        expect(unit).toHaveProperty("label");
        expect(typeof unit.value).toBe("string");
        expect(typeof unit.label).toBe("string");
        expect(unit.value.length).toBeGreaterThan(0);
        expect(unit.label.length).toBeGreaterThan(0);
      });
    });

    it("should contain expected units", () => {
      const values = UNIDADES_DISPONIVEIS.map((unit) => unit.value);
      expect(values).toContain("DIRAD - DIRAD");
      expect(values).toContain("GAP-RJ - HCA");
      expect(values).toContain("AFA - AFA");
    });

    it("should have unique values", () => {
      const values = UNIDADES_DISPONIVEIS.map((unit) => unit.value);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });

    it("should have at least 50 units", () => {
      expect(UNIDADES_DISPONIVEIS.length).toBeGreaterThanOrEqual(50);
    });
  });

  describe("MEAL_TYPES", () => {
    it("should have exactly 4 meal types", () => {
      expect(MEAL_TYPES).toHaveLength(4);
    });

    it("should contain expected meal types", () => {
      const values = MEAL_TYPES.map((meal) => meal.value);
      expect(values).toContain("cafe");
      expect(values).toContain("almoco");
      expect(values).toContain("janta");
      expect(values).toContain("ceia");
    });

    it("should have valid time formats", () => {
      const timeRegex = /^\d{2}:\d{2}$/;
      MEAL_TYPES.forEach((meal) => {
        expect(meal.time).toMatch(timeRegex);
      });
    });

    it("should have valid CSS color classes", () => {
      MEAL_TYPES.forEach((meal) => {
        // More flexible regex to handle different Tailwind color patterns
        const colorRegex = /^bg-\w+(-\w+)*-\d+(\s+text-\w+(-\w+)*-\d+)?$/;
        expect(meal.color).toMatch(colorRegex);
      });
    });
  });

  describe("Constants values", () => {
    it("should have correct DEFAULT_UNIT", () => {
      expect(DEFAULT_UNIT).toBe("DIRAD - DIRAD");
      expect(typeof DEFAULT_UNIT).toBe("string");
    });

    it("should have correct DAYS_TO_SHOW", () => {
      expect(DAYS_TO_SHOW).toBe(30);
      expect(typeof DAYS_TO_SHOW).toBe("number");
      expect(DAYS_TO_SHOW).toBeGreaterThan(0);
    });

    it("should have correct NEAR_DATE_THRESHOLD", () => {
      expect(NEAR_DATE_THRESHOLD).toBe(2);
      expect(typeof NEAR_DATE_THRESHOLD).toBe("number");
      expect(NEAR_DATE_THRESHOLD).toBeGreaterThanOrEqual(0);
    });
  });
});
