import type { Address, Root, Cheerio } from "./types";
import { getTextValue, findRowByPrompt } from "./helpers";

/**
 * Extracts the value for a specific address line number.
 * @internal
 */
function getAddressLineValue(
  $: Root,
  table: Cheerio,
  lineNumber: number
): string | undefined {
  const lineRow = findRowByPrompt($, table, `Address Line ${lineNumber}:`);
  if (lineRow.length > 0) {
    return getTextValue(lineRow.find(".Value"));
  }
  return undefined;
}

/**
 * Parses address information from a table element.
 * Handles both standard address format and multi-line address format.
 * @internal
 */
function parseAddress($: Root, table: Cheerio): Address {
  const address: Address = {};

  // Check for street address
  const streetRow = findRowByPrompt($, table, "Address:");
  if (streetRow.length > 0) {
    address.street = getTextValue(streetRow.find(".Value").first());
  }

  // Check for unit (next row after Address if it has no FirstColumnPrompt text)
  const unitRow = streetRow.next("tr");
  if (unitRow.length > 0) {
    const unitPrompt = $(unitRow.get(0))
      .find(".FirstColumnPrompt")
      .text()
      .trim();
    if (unitPrompt === "") {
      address.unit = getTextValue(unitRow.find(".Value"));
    }
  }

  // Check for Address Line 1, 2, 3 (for attorneys)
  address.line1 = getAddressLineValue($, table, 1);
  address.line2 = getAddressLineValue($, table, 2);
  address.line3 = getAddressLineValue($, table, 3);

  // City, State, Zip Code (usually on same row)
  const cityRow = findRowByPrompt($, table, "City:");
  if (cityRow.length > 0) {
    const cityCell = cityRow.find("td").last();
    address.city = cityCell.find(".Value").first().text().trim();

    const cityText = cityCell.text();
    const stateMatch = cityText.match(/State:\s*([A-Z]{2})/);
    if (stateMatch) {
      address.state = stateMatch[1];
    }

    const zipMatch = cityText.match(/Zip Code:\s*(\d{5})/);
    if (zipMatch) {
      address.zipCode = zipMatch[1];
    }
  }

  return address;
}

export { parseAddress };
