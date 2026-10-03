import { expect, test } from "bun:test";
import { toRoman } from "../src/roman";

test("additive values", () => {
  expect(toRoman(3)).toBe("III");
  expect(toRoman(2023)).toBe("MMXXIII");
});

test("subtractive values", () => {
  expect(toRoman(4)).toBe("IV");
  expect(toRoman(9)).toBe("IX");
  expect(toRoman(1994)).toBe("MCMXCIV");
});

test("range", () => {
  expect(() => toRoman(0)).toThrow(RangeError);
});
