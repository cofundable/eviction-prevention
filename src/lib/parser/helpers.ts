import type { Root, Cheerio, Element, Address } from "./types";

/**
 * Extracts and trims text content from a cheerio element.
 * @internal
 */
function getTextValue(element: Cheerio): string {
  return element.text().trim();
}

/**
 * Finds table rows that contain a specific prompt text in the FirstColumnPrompt element.
 * @internal
 */
function findRowByPrompt(
  $: Root,
  container: Cheerio,
  promptText: string
): Cheerio {
  return container.find("tr").filter((_index: number, el: Element) => {
    return $(el).find(".FirstColumnPrompt").text().trim() === promptText;
  });
}

/**
 * Extracts the value from a row that matches the given prompt text.
 * Returns an empty string if no matching row is found.
 * @internal
 */
function getValueFromRow(
  $: Root,
  container: Cheerio,
  promptText: string
): string {
  const row = findRowByPrompt($, container, promptText);
  if (row.length > 0) {
    return getTextValue(row.find(".Value"));
  }
  return "";
}

/**
 * Street name and common abbreviation mappings for normalization.
 * @internal
 */
const STREET_ABBREVIATIONS: Record<string, string> = {
  STREET: "ST",
  AVENUE: "AVE",
  ROAD: "RD",
  DRIVE: "DR",
  LANE: "LN",
  BOULEVARD: "BLVD",
  CIRCLE: "CIR",
  COURT: "CT",
  PLACE: "PL",
  PARKWAY: "PKWY",
  SQUARE: "SQ",
  TERRACE: "TER",
  TRAIL: "TRL",
  WAY: "WAY",
};

/**
 * Business entity abbreviation mappings for normalization.
 * @internal
 */
const ENTITY_ABBREVIATIONS: Record<string, string> = {
  INCORPORATED: "INC",
  CORPORATION: "CORP",
  LIMITED: "LTD",
  LIMITEDLIABILITYCOMPANY: "LLC",
  "LIMITED LIABILITY COMPANY": "LLC",
  PARTNERSHIP: "LP",
  PROFESSIONALCORPORATION: "PC",
  "PROFESSIONAL CORPORATION": "PC",
};

/**
 * Removes unnecessary punctuation while preserving dashes.
 * Dashes are kept as they may indicate apartment numbers (e.g., "305-C").
 * @internal
 */
function removeUnnecessaryPunctuation(text: string): string {
  // Replace multiple spaces with single space
  let normalized = text.replace(/\s+/g, " ");

  // Remove punctuation except dashes and spaces
  // Keep: letters, numbers, dashes, spaces
  normalized = normalized.replace(/[^\w\s-]/g, "");

  // Clean up multiple dashes
  normalized = normalized.replace(/-+/g, "-");

  // Remove dashes at start/end
  normalized = normalized.replace(/^-+|-+$/g, "");

  // Collapse multiple spaces again after removing punctuation
  normalized = normalized.replace(/\s+/g, " ");

  return normalized.trim();
}

/**
 * Normalizes street abbreviations (e.g., "Street" -> "ST").
 * @internal
 */
function normalizeStreetAbbreviations(text: string): string {
  let normalized = text;

  // Apply street abbreviations (case-insensitive)
  for (const [full, abbrev] of Object.entries(STREET_ABBREVIATIONS)) {
    const regex = new RegExp(`\\b${full}\\b`, "gi");
    normalized = normalized.replace(regex, abbrev);
  }

  return normalized;
}

/**
 * Normalizes business entity abbreviations (e.g., "Incorporated" -> "INC").
 * Handles both single-word and multi-word patterns.
 * @internal
 */
function normalizeEntityAbbreviations(text: string): string {
  let normalized = text;

  // Sort by length (longest first) to handle multi-word patterns before single words
  const entries = Object.entries(ENTITY_ABBREVIATIONS).sort(
    (a, b) => b[0].length - a[0].length
  );

  // Apply entity abbreviations (case-insensitive)
  for (const [full, abbrev] of entries) {
    // For multi-word patterns, use word boundaries on the edges only
    // For single-word patterns, use word boundaries on both sides
    if (full.includes(" ")) {
      // Multi-word: match whole phrase with word boundaries on edges
      const escaped = full.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\b${escaped}\\b`, "gi");
      normalized = normalized.replace(regex, abbrev);
    } else {
      // Single-word: use word boundaries on both sides
      const regex = new RegExp(`\\b${full}\\b`, "gi");
      normalized = normalized.replace(regex, abbrev);
    }
  }

  return normalized;
}

/**
 * Splits a name by common separators (T/A, TA, C/O, etc.).
 * @internal
 */
function splitNameParts(name: string): string[] {
  // Common separators: T/A, TA, C/O, CO, DBA, etc.
  const separators = [
    /\s+T\/A\s+/i,
    /\s+TA\s+/i,
    /\s+C\/O\s+/i,
    /\s+CO\s+/i,
    /\s+DBA\s+/i,
    /\s+&\s+/i, // Also split on & for business names
  ];

  let parts = [name];

  for (const separator of separators) {
    const newParts: string[] = [];
    for (const part of parts) {
      newParts.push(...part.split(separator));
    }
    parts = newParts.map((p) => p.trim()).filter((p) => p.length > 0);
  }

  return parts;
}

/**
 * Normalizes a name string by:
 * - Converting to uppercase
 * - Splitting by common separators (T/A, TA, C/O, etc.)
 * - Removing unnecessary punctuation from each part (keeping dashes)
 * - Standardizing entity abbreviations in each part
 * @internal
 */
function normalizeName(name: string): {
  normalized: string;
  parts: string[];
} {
  if (!name || name.trim().length === 0) {
    return { normalized: "", parts: [] };
  }

  // Step 1: Convert to uppercase
  const upperName = name.toUpperCase().trim();

  // Step 2: Split by separators (do this before removing punctuation so separators are preserved)
  const rawParts = splitNameParts(upperName);

  // Step 3: Normalize each part
  const normalizedParts = rawParts
    .map((part) => {
      // Remove unnecessary punctuation (keep dashes)
      let normalized = removeUnnecessaryPunctuation(part);
      // Normalize entity abbreviations
      normalized = normalizeEntityAbbreviations(normalized);
      return normalized;
    })
    .filter((p) => p.length > 0);

  // Join parts with space for the full normalized name
  const fullNormalized = normalizedParts.join(" ");

  return {
    normalized: fullNormalized,
    parts: normalizedParts,
  };
}

/**
 * Normalizes an address string by:
 * - Converting to uppercase
 * - Removing unnecessary punctuation (keeping dashes)
 * - Standardizing street abbreviations
 * @internal
 */
function normalizeAddressString(address: string): string {
  if (!address || address.trim().length === 0) {
    return "";
  }

  // Step 1: Convert to uppercase
  let normalized = address.toUpperCase().trim();

  // Step 2: Remove unnecessary punctuation (keep dashes)
  normalized = removeUnnecessaryPunctuation(normalized);

  // Step 3: Normalize street abbreviations
  normalized = normalizeStreetAbbreviations(normalized);

  return normalized;
}

/**
 * Known city name misspellings and variants mapped to their correct forms.
 * @internal
 */
const CITY_CORRECTIONS: Record<string, string> = {
  BATIMORE: "BALTIMORE",
  BALTIMROE: "BALTIMORE",
  BALTIMOREQ: "BALTIMORE",
  BALTIMIORE: "BALTIMORE",
  BALLTIMORE: "BALTIMORE",
  BALITMORE: "BALTIMORE",
  BALITIMORE: "BALTIMORE",
  "BALTIMORE CITY": "BALTIMORE",
  BALTMORE: "BALTIMORE",
  BALT: "BALTIMORE",
  BAL: "BALTIMORE",
};

/**
 * Applies known city corrections to a normalized (uppercased) city string.
 * @internal
 */
function correctCityName(city: string): string {
  return CITY_CORRECTIONS[city] ?? city;
}

/**
 * Normalizes an entire Address object into a normalized Address object.
 * Each field is normalized individually while preserving the structure.
 * @internal
 */
function normalizeAddressObject(address: Address): Address {
  const normalized: Address = {};

  // Normalize street address
  if (address.street) {
    normalized.street = normalizeAddressString(address.street);
  }

  // Normalize unit if present
  if (address.unit) {
    normalized.unit = normalizeAddressString(address.unit);
  }

  // Normalize line1, line2, line3 (for attorneys)
  if (address.line1) {
    normalized.line1 = normalizeAddressString(address.line1);
  }
  if (address.line2) {
    normalized.line2 = normalizeAddressString(address.line2);
  }
  if (address.line3) {
    normalized.line3 = normalizeAddressString(address.line3);
  }

  // Normalize city, then apply corrections
  if (address.city) {
    normalized.city = correctCityName(normalizeAddressString(address.city));
  }

  // Normalize state (ensure uppercase)
  if (address.state) {
    normalized.state = address.state.toUpperCase();
  }

  // Zip code doesn't need normalization (already numeric)
  if (address.zipCode) {
    normalized.zipCode = address.zipCode;
  }

  return normalized;
}

export {
  getTextValue,
  findRowByPrompt,
  getValueFromRow,
  normalizeName,
  normalizeAddressString,
  normalizeAddressObject,
};
