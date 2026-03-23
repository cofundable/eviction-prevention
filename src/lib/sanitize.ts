import { createHash } from "crypto";

/**
 * Hash a name to a 16-char hex string for anonymization.
 * Deterministic: same input always produces same output.
 */
export function hashName(name: string): string {
  return createHash("sha256").update(name).digest("hex").slice(0, 16);
}

/**
 * Strip house number from a normalized street address, returning
 * "<street name> <zip>" suitable for public display.
 *
 * Input: street = "123 E 25TH ST", zip = "21218"
 * Output: "E 25th St 21218"
 */
export function truncateAddress(
  street: string | null,
  zip: string | null
): string {
  if (!street) return zip ?? "";
  // Remove leading house number (digits, optional fractional/unit)
  const withoutNumber = street.replace(/^\d+[-\d/]*\s+/, "").trim();
  // Title-case
  const titled = withoutNumber
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return zip ? `${titled} ${zip}` : titled;
}

/**
 * Replace defendant names in a parsed case JSON object with their hashes.
 * Mutates a deep clone — does not modify the input.
 */
export function redactDetailsJson(
  json: Record<string, unknown>,
  tenantName: string
): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(json)) as typeof json;
  const hash = hashName(tenantName);

  // Redact in parties array
  if (Array.isArray(clone.parties)) {
    for (const party of clone.parties) {
      if (
        party.type === "defendant" ||
        party.type === "tenant" ||
        party.name === tenantName
      ) {
        party.name = `[REDACTED:${hash}]`;
      }
    }
  }

  // Redact anywhere the raw tenant name appears as a string value
  function redactObject(obj: Record<string, unknown>): void {
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (typeof val === "string" && val === tenantName) {
        obj[key] = `[REDACTED:${hash}]`;
      } else if (val && typeof val === "object" && !Array.isArray(val)) {
        redactObject(val as Record<string, unknown>);
      } else if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === "object") {
            redactObject(item as Record<string, unknown>);
          }
        }
      }
    }
  }

  redactObject(clone);
  return clone;
}
