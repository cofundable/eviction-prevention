import type { Timeline, Root, Cheerio, Element } from "./types";
import { getTextValue, findRowByPrompt } from "./helpers";

/**
 * Parses timeline events from the body window.
 * Extracts document information including file date, document name, and comments.
 * @internal
 */
function parseTimeline($: Root, bodyWindow: Cheerio): Timeline[] {
  const timeline: Timeline[] = [];

  bodyWindow.find("table").each((_index: number, tableEl: Element) => {
    const table = $(tableEl);
    const fileDateRow = findRowByPrompt($, table, "File Date:");

    if (fileDateRow.length > 0) {
      const date = getTextValue(fileDateRow.find(".Value"));

      const documentNameRow = findRowByPrompt($, table, "Document Name:");
      const eventType = getTextValue(documentNameRow.find(".Value"));

      const commentRow = findRowByPrompt($, table, "Comment:");
      const comment = getTextValue(commentRow.find(".Value"));

      if (date && eventType) {
        timeline.push({
          date,
          eventType,
          comment: comment || "",
        });
      }
    }
  });

  return timeline;
}

export { parseTimeline };
