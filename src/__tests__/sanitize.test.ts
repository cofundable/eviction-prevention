import { describe, it, expect } from "vitest";
import { hashName, truncateAddress, redactDetailsJson } from "../lib/sanitize";

describe("hashName", () => {
  it("returns a 16-character hex string", () => {
    const result = hashName("John Doe");
    expect(result).toHaveLength(16);
    expect(result).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic", () => {
    expect(hashName("John Doe")).toBe(hashName("John Doe"));
  });

  it("produces different hashes for different names", () => {
    expect(hashName("Alice Smith")).not.toBe(hashName("Bob Jones"));
  });

  it("handles empty string", () => {
    const result = hashName("");
    expect(result).toHaveLength(16);
  });
});

describe("truncateAddress", () => {
  it("strips house number and appends zip", () => {
    expect(truncateAddress("123 E 25TH ST", "21218")).toBe("E 25th St 21218");
  });

  it("handles multi-digit house numbers", () => {
    expect(truncateAddress("4501 FALLS RD", "21209")).toBe("Falls Rd 21209");
  });

  it("handles hyphenated house numbers", () => {
    expect(truncateAddress("12-14 MAIN ST", "21201")).toBe("Main St 21201");
  });

  it("returns street title-cased when no zip", () => {
    expect(truncateAddress("100 PARK AVE", "")).toBe("Park Ave");
  });

  it("handles null street", () => {
    expect(truncateAddress(null, "21201")).toBe("21201");
  });

  it("handles null street and null zip", () => {
    expect(truncateAddress(null, null)).toBe("");
  });
});

describe("redactDetailsJson", () => {
  it("replaces tenant name in parties array", () => {
    const input = {
      parties: [
        { type: "plaintiff", name: "Waverly Apts" },
        { type: "tenant", name: "Jane Smith" },
      ],
    };
    const result = redactDetailsJson(input, "Jane Smith");
    const parties = result.parties as Array<{ type: string; name: string }>;
    expect(parties[1].name).toMatch(/^\[REDACTED:/);
    expect(parties[0].name).toBe("Waverly Apts");
  });

  it("does not modify the original object", () => {
    const input = { parties: [{ type: "tenant", name: "Jane Smith" }] };
    redactDetailsJson(input, "Jane Smith");
    expect(input.parties[0].name).toBe("Jane Smith");
  });

  it("replaces exact tenant name matches anywhere in the object", () => {
    const input = { title: "Jane Smith", parties: [] };
    const result = redactDetailsJson(input, "Jane Smith");
    expect(result.title).toMatch(/^\[REDACTED:/);
  });

  it("does not replace partial name matches", () => {
    const input = { title: "Jane Smith v. Landlord", parties: [] };
    const result = redactDetailsJson(input, "Jane Smith");
    // Partial match — not redacted
    expect(result.title).toBe("Jane Smith v. Landlord");
  });
});
