import { readdir, readFile, writeFile } from "fs/promises";
import { join, extname, basename } from "path";
import { parseCaseData } from "../src/lib/parser/index.js";
import { mkdirSync } from "fs";

const HTML_DIR = join(process.cwd(), "data", "html");
const JSON_DIR = join(process.cwd(), "data", "json");
mkdirSync(JSON_DIR, { recursive: true });
mkdirSync(HTML_DIR, { recursive: true });

async function parseHtmlFile(htmlFile: string): Promise<{
  success: boolean;
  htmlFile: string;
  jsonFile?: string;
  error?: unknown;
}> {
  try {
    const htmlPath = join(HTML_DIR, htmlFile);
    const htmlContent = await readFile(htmlPath, "utf-8");

    // Parse the HTML
    const caseData = parseCaseData(htmlContent);

    // Generate JSON filename
    const jsonFileName = basename(htmlFile, ".html") + ".json";
    const jsonPath = join(JSON_DIR, jsonFileName);

    // Write JSON file
    await writeFile(jsonPath, JSON.stringify(caseData, null, 2), "utf-8");

    return { success: true, htmlFile, jsonFile: jsonFileName };
  } catch (error) {
    return { success: false, htmlFile, error };
  }
}

async function parseAllHtmlFiles() {
  try {
    // Read all files from the HTML directory
    const files = await readdir(HTML_DIR);
    const htmlFiles = files.filter((file) => extname(file) === ".html");

    console.log(`Found ${htmlFiles.length} HTML files to parse`);

    // Process all files in parallel
    const results = await Promise.all(
      htmlFiles.map((htmlFile) => parseHtmlFile(htmlFile))
    );

    // Collect and print results
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    // Print successful files
    successful.forEach((result) => {
      console.log(`✓ Parsed ${result.htmlFile} -> ${result.jsonFile}`);
    });

    // Print failed files
    failed.forEach((result) => {
      console.error(`✗ Error parsing ${result.htmlFile}:`, result.error);
    });

    console.log(
      `\nCompleted: ${successful.length} successful, ${failed.length} errors`
    );
  } catch (error) {
    console.error("Error reading HTML directory:", error);
    process.exit(1);
  }
}

parseAllHtmlFiles();
