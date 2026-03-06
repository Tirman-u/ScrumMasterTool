import { describe, expect, it } from "vitest";
import { parseCsv, parseDate, parseNumber } from "../src/io/csv.js";

describe("parseCsv", () => {
  it("handles quoted commas and escaped quotes", () => {
    const csv = [
      'Key,Summary,Comment',
      'ABC-1,"Item, with comma","He said ""done"""',
    ].join("\n");

    const parsed = parseCsv(csv);

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].Summary).toBe("Item, with comma");
    expect(parsed.rows[0].Comment).toBe('He said "done"');
  });

  it("handles newlines inside quoted fields", () => {
    const csv = [
      "Key,Description",
      'ABC-2,"Line1',
      'Line2"',
    ].join("\n");

    const parsed = parseCsv(csv);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].Description).toBe("Line1\nLine2");
  });

  it("merges duplicate header columns", () => {
    const csv = [
      "Issue key,Sprint,Sprint,Sprint",
      "ABC-1,Sprint A,Sprint B,",
    ].join("\n");

    const parsed = parseCsv(csv);
    expect(parsed.rows[0].Sprint).toBe("Sprint A,Sprint B");
  });
});

describe("parseNumber", () => {
  it("parses both dot and comma decimals", () => {
    expect(parseNumber("3.5")).toBe(3.5);
    expect(parseNumber("3,5")).toBe(3.5);
    expect(parseNumber("")).toBeNull();
  });
});

describe("parseDate", () => {
  it("parses dot and slash date formats with stable day/month", () => {
    const dot = parseDate("12.02.2026 09:35");
    expect(dot)?.toBeInstanceOf(Date);
    expect(dot?.getFullYear()).toBe(2026);
    expect(dot?.getMonth()).toBe(1);
    expect(dot?.getDate()).toBe(12);

    const slash = parseDate("26/02/2026 12:30");
    expect(slash)?.toBeInstanceOf(Date);
    expect(slash?.getFullYear()).toBe(2026);
    expect(slash?.getMonth()).toBe(1);
    expect(slash?.getDate()).toBe(26);
  });
});
