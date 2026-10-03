const numerals: ReadonlyArray<readonly [number, string]> = [
  [1000, "M"],
  [500, "D"],
  [100, "C"],
  [50, "L"],
  [10, "X"],
  [5, "V"],
  [1, "I"],
];

export function toRoman(value: number): string {
  if (!Number.isInteger(value) || value < 1 || value > 3999) {
    throw new RangeError("value must be an integer from 1 to 3999");
  }
  let rest = value;
  let out = "";
  for (const [amount, symbol] of numerals) {
    while (rest >= amount) {
      out += symbol;
      rest -= amount;
    }
  }
  return out;
}
