import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseCaseData } from "../src/lib/parser";

describe("parseCaseData", () => {
  const mocksDir = join(__dirname, "mocks");
  const htmlDir = join(mocksDir, "html");
  const jsonDir = join(mocksDir, "json");

  function loadTestCase(testCaseName: string) {
    const html = readFileSync(join(htmlDir, `${testCaseName}.html`), "utf-8");
    const expected = JSON.parse(
      readFileSync(join(jsonDir, `${testCaseName}.json`), "utf-8")
    );
    return { html, expected };
  }

  it("should parse bol-batch-52388-ordered.html correctly", () => {
    const { html, expected } = loadTestCase("bol-batch-52388-ordered");
    const result = parseCaseData(html);
    expect(result).toEqual(expected);
  });

  it("should parse ftpr-no-batch-evicted.html correctly", () => {
    const { html, expected } = loadTestCase("ftpr-no-batch-evicted");
    const result = parseCaseData(html);
    expect(result).toEqual(expected);
  });

  it("should parse tho-batch-48291-cancelled.html correctly", () => {
    const { html, expected } = loadTestCase("tho-batch-48291-cancelled");
    const result = parseCaseData(html);
    expect(result).toEqual(expected);
  });
});
