import * as cheerio from "cheerio";

interface CaseDetails {
  courtSystem?: string;
  location?: string;
  caseNumber?: string;
  title?: string;
  caseType?: string;
  filingDate?: string;
  caseStatus?: string;
}

interface Address {
  street?: string;
  unit?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  line1?: string;
  line2?: string;
  line3?: string;
}

interface Party {
  partyType?: string;
  name: string;
  address: Address;
  appearanceDate?: string;
  representedParty?: string;
}

interface Timeline {
  date?: string;
  eventType?: string;
  comment?: string;
}

interface CaseData {
  caseDetails: CaseDetails;
  parties: Party[];
  timeline: Timeline[];
}

// #############################################################################
// Helper Functions
// #############################################################################

function getTextValue(element: any): string {
  return element.text().trim();
}

// #############################################################################
// Parse Address
// #############################################################################

function parseAddress($: any, table: any): Address {
  const address: Address = {};

  // Check for street address
  const streetRow = table.find("tr").filter((_, el: any) => {
    return $(el).find(".FirstColumnPrompt").text().trim() === "Address:";
  });
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
  const line1Row = table.find("tr").filter((_, el: any) => {
    return $(el).find(".FirstColumnPrompt").text().trim() === "Address Line 1:";
  });
  if (line1Row.length > 0) {
    address.line1 = getTextValue(line1Row.find(".Value"));
  }

  const line2Row = table.find("tr").filter((_, el: any) => {
    return $(el).find(".FirstColumnPrompt").text().trim() === "Address Line 2:";
  });
  if (line2Row.length > 0) {
    address.line2 = getTextValue(line2Row.find(".Value"));
  }

  const line3Row = table.find("tr").filter((_, el: any) => {
    return $(el).find(".FirstColumnPrompt").text().trim() === "Address Line 3:";
  });
  if (line3Row.length > 0) {
    address.line3 = getTextValue(line3Row.find(".Value"));
  }

  // City, State, Zip Code (usually on same row)
  const cityRow = table.find("tr").filter((_, el: any) => {
    return $(el).find(".FirstColumnPrompt").text().trim() === "City:";
  });
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

// #############################################################################
// Parse Party
// #############################################################################

function parseParty($: any, section: any, partyType: string): Party | null {
  // Find the first "Name:" row in the section (only from the first table that has it)
  const nameRow = section
    .find("table")
    .first()
    .find("tr")
    .filter((_, el: any) => {
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

  // Check for appearance date (only for attorneys)
  if (partyType === "attorney") {
    const appearanceDateRow = section.find("tr").filter((_, el: any) => {
      return (
        $(el).find(".FirstColumnPrompt").text().trim() === "Appearance Date:"
      );
    });
    if (appearanceDateRow.length > 0) {
      party.appearanceDate = getTextValue(appearanceDateRow.find(".Value"));
      party.representedParty = "landlord"; // Attorneys typically represent landlords
    }
  }

  return party;
}

// #############################################################################
// Parse Case Data
// #############################################################################

export function parseCaseData(html: string): CaseData {
  const $ = cheerio.load(html);
  const result: CaseData = {
    caseDetails: {},
    parties: [],
    timeline: [],
  };

  // Parse Case Details
  const bodyWindow = $(".BodyWindow");

  const courtSystemText = getTextValue(
    bodyWindow.find('tr:contains("Court System:")').find(".Value")
  );
  result.caseDetails.courtSystem = courtSystemText.replace(/\s+/g, " ").trim();
  result.caseDetails.location = getTextValue(
    bodyWindow.find('tr:contains("Location:")').find(".Value")
  );
  result.caseDetails.caseNumber = getTextValue(
    bodyWindow.find('tr:contains("Case Number:")').find(".Value")
  );
  result.caseDetails.title = getTextValue(
    bodyWindow.find('tr:contains("Title:")').find(".Value")
  );
  result.caseDetails.caseType = getTextValue(
    bodyWindow.find('tr:contains("Case Type:")').find(".Value")
  );
  result.caseDetails.filingDate = getTextValue(
    bodyWindow.find('tr:contains("Filing Date:")').find(".Value")
  );
  result.caseDetails.caseStatus = getTextValue(
    bodyWindow.find('tr:contains("Case Status:")').find(".Value")
  );

  // Parse Parties - find each H6 header and get the following tables
  bodyWindow.find("h6").each((_, h6El: any) => {
    const h6Text = $(h6El).text().trim();
    const h6Table = $(h6El).closest("table");

    // Get all tables after this H6 table until the next H6, HR, or section boundary
    let currentElement = h6Table.next();
    const sectionTables: any[] = [];

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

    let partyType = "";
    if (
      h6Text === "Landlord / Plaintiff" ||
      (h6Text.includes("Landlord") &&
        !h6Text.includes("Attorney") &&
        !h6Text.includes("Agent"))
    ) {
      partyType = "landlord";
    } else if (h6Text.includes("Attorney") && h6Text.includes("Landlord")) {
      partyType = "attorney";
    } else if (
      h6Text === "Tenant / Defendant" ||
      (h6Text.includes("Tenant") && !h6Text.includes("Attorney"))
    ) {
      partyType = "tenant";
    } else if (
      h6Text.includes("Landlord's Agent") ||
      (h6Text.includes("Agent") && !h6Text.includes("Attorney"))
    ) {
      partyType = "agent";
    }

    if (partyType) {
      const party = parseParty($, sectionWrapper, partyType);
      if (party) {
        result.parties.push(party);
      }
    }
  });

  // Parse Timeline (Document Information)
  bodyWindow.find("table").each((_, tableEl: any) => {
    const table = $(tableEl);
    const fileDateRow = table.find("tr").filter((_, el: any) => {
      return $(el).find(".FirstColumnPrompt").text().trim() === "File Date:";
    });

    if (fileDateRow.length > 0) {
      const date = getTextValue(fileDateRow.find(".Value"));

      const documentNameRow = table.find("tr").filter((_, el: any) => {
        return (
          $(el).find(".FirstColumnPrompt").text().trim() === "Document Name:"
        );
      });
      const eventType = getTextValue(documentNameRow.find(".Value"));

      const commentRow = table.find("tr").filter((_, el: any) => {
        return $(el).find(".FirstColumnPrompt").text().trim() === "Comment:";
      });
      const comment = getTextValue(commentRow.find(".Value"));

      if (date && eventType) {
        result.timeline.push({
          date,
          eventType,
          comment: comment || "",
        });
      }
    }
  });

  return result;
}
