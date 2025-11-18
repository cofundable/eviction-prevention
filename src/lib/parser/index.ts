import * as cheerio from "cheerio";
import type { CaseData } from "./types";
import { parseDetails } from "./details";
import { parseParties } from "./parties";
import { parseTimeline } from "./timeline";

export function parseCaseData(html: string): CaseData {
  const $ = cheerio.load(html);
  const bodyWindow = $(".BodyWindow");

  const caseDetails = parseDetails($, bodyWindow);
  const parties = parseParties($, bodyWindow);
  const timeline = parseTimeline($, bodyWindow);

  return {
    caseDetails,
    parties,
    timeline,
  };
}
