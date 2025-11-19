import { readdir, readFile, writeFile } from "fs/promises";
import { join, extname, basename } from "path";
import { parseCaseData } from "../src/lib/parser/index.js";

const HTML_DIR = join(process.cwd(), "data", "html");
const JSON_DIR = join(process.cwd(), "data", "json");

async function parseAllHtmlFiles() {
  try {
    // Read all files from the HTML directory
    const files = await readdir(HTML_DIR);
    const htmlFiles = files.filter((file) => extname(file) === ".html");

    console.log(`Found ${htmlFiles.length} HTML files to parse`);

    let successCount = 0;
    let errorCount = 0;

    // Process each HTML file
    for (const htmlFile of htmlFiles) {
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

        successCount++;
        console.log(`✓ Parsed ${htmlFile} -> ${jsonFileName}`);
      } catch (error) {
        errorCount++;
        console.error(`✗ Error parsing ${htmlFile}:`, error);
      }
    }

    console.log(
      `\nCompleted: ${successCount} successful, ${errorCount} errors`
    );
  } catch (error) {
    console.error("Error reading HTML directory:", error);
    process.exit(1);
  }
}

parseAllHtmlFiles();
