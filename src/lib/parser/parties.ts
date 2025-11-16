import type { Party, Root, Cheerio, Element } from "./types";
import { PartyType } from "./types";
import { getTextValue } from "./helpers";
import { parseAddress } from "./address";

/**
 * Maps header text to normalized party types.
 * Add new mappings here as new header text variations are encountered.
 */
const PARTY_TYPE_MAPPING: Array<{
  headerText: string;
  partyType: PartyType;
}> = [
  { headerText: "Landlord / Plaintiff", partyType: PartyType.LANDLORD },
  { headerText: "Tenant / Defendant", partyType: PartyType.TENANT },
  { headerText: "Landlord's Agent", partyType: PartyType.AGENT },
];

/**
 * Determines party type from header text using exact matches from PARTY_TYPE_MAPPING.
 * @internal
 */
function determinePartyType(headerText: string): PartyType | null {
  const mapping = PARTY_TYPE_MAPPING.find((m) => m.headerText === headerText);
  return mapping ? mapping.partyType : null;
}

/**
 * Parses a single party from a section element.
 * @internal
 */
function parseParty($: Root, section: Cheerio, partyType: string): Party | null {
  // Find the first "Name:" row in the section (only from the first table that has it)
  const nameRow = section
    .find("table")
    .first()
    .find("tr")
    .filter((_index: number, el: Element) => {
      return $(el).find(".FirstColumnPrompt").text().trim() === "Name:";
    });

  if (nameRow.length === 0) {
    return null;
  }

  const name = getTextValue(nameRow.find(".Value"));

  // Find the table containing the address (usually the next table after the name)
  let addressTable = nameRow.closest("table").next("table");
  if (addressTable.length === 0) {
    addressTable = nameRow.closest("table");
  }

  const address = parseAddress($, addressTable);

  const party: Party = {
    partyType,
    name,
    address,
  };

  return party;
}

/**
 * Parses all parties from the body window.
 * @internal
 */
function parseParties($: Root, bodyWindow: Cheerio): Party[] {
  const parties: Party[] = [];

  bodyWindow.find("h6").each((_index: number, h6El: Element) => {
    const h6Text = $(h6El).text().trim();
    const h6Table = $(h6El).closest("table");

    // Get all tables after this H6 table until the next H6, HR, or section boundary
    let currentElement = h6Table.next();
    const sectionTables: Cheerio[] = [];

    while (currentElement.length > 0) {
      const tagName = currentElement.get(0)?.tagName?.toLowerCase();

      // Stop at next H6, HR, or AltBodyWindow1 (scheduling section)
      if (tagName === "h6") {
        break;
      }
      if (tagName === "hr" || currentElement.hasClass("AltBodyWindow1")) {
        break;
      }
      if (tagName === "table") {
        sectionTables.push(currentElement);
      }
      currentElement = currentElement.next();
    }

    // Only process if we found tables for this section
    if (sectionTables.length === 0) {
      return;
    }

    // Create a wrapper to contain all section tables
    const sectionWrapper = $("<div>").append(sectionTables);

    const partyType = determinePartyType(h6Text);
    if (partyType) {
      const party = parseParty($, sectionWrapper, partyType);
      if (party) {
        parties.push(party);
      }
    }
  });

  return parties;
}

export { parseParties };
