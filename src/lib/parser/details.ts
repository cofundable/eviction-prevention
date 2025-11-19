import type { CaseDetails, Root, Cheerio } from "./types";
import { getValueFromRow } from "./helpers";

/**
 * Parses case details from the body window.
 * @internal
 */
function parseDetails($: Root, bodyWindow: Cheerio): CaseDetails {
  const details: CaseDetails = {};

  const courtSystemText = getValueFromRow($, bodyWindow, "Court System:");
  details.courtSystem = courtSystemText.replace(/\s+/g, " ").trim();

  details.location = getValueFromRow($, bodyWindow, "Location:");
  details.caseNumber = getValueFromRow($, bodyWindow, "Case Number:");
  details.title = getValueFromRow($, bodyWindow, "Title:");
  details.caseType = getValueFromRow($, bodyWindow, "Case Type:");
  details.filingDate = getValueFromRow($, bodyWindow, "Filing Date:");
  details.caseStatus = getValueFromRow($, bodyWindow, "Case Status:");

  return details;
}

export { parseDetails };
