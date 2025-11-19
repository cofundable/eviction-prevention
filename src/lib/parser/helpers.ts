import type { Root, Cheerio, Element } from "./types";

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

export { getTextValue, findRowByPrompt, getValueFromRow };
