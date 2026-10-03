import { readFile } from "fs/promises";
import path from "path";
import { parseArgs } from "util";
import { knowledgeBaseDocumentIngestDecision, knowledgeBaseDocumentRemove } from "../services/knowledgeBase/knowledgeBaseDocumentMethods.js";
import { knowledgeBaseSyncAndWait } from "./knowledgeBaseSync.js";

const USAGE = [
  "Usage:",
  "  npm run kb:ingest --workspace backend -- --household <id> --document <file name> <decision.json>",
  "  npm run kb:ingest --workspace backend -- --household <id> --document <file name> --remove",
].join("\n");

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    household: { type: "string" },
    document: { type: "string" },
    remove: { type: "boolean", default: false },
    "no-sync": { type: "boolean", default: false },
  },
});

const household = values.household?.trim();
const documentName = values.document?.trim();

if (!household || !documentName || (!values.remove && positionals.length !== 1)) {
  console.error(USAGE);
  process.exit(1);
}

try {
  if (values.remove) {
    const removed = await knowledgeBaseDocumentRemove(household, documentName);
    console.log(`Removed ${documentName} from ${household} (${removed.length} indexed objects) and its stored original.`);
  } else {
    // npm runs workspace scripts from backend/, so a relative path is resolved from where the command was typed.
    const filePath = path.resolve(process.env.INIT_CWD ?? process.cwd(), positionals[0]!);
    const result = await knowledgeBaseDocumentIngestDecision(household, documentName, await readFile(filePath));
    const { document } = result;
    console.log(`Ingested ${document.fileName} for ${document.clientId} as document ${document.documentId}`);
    console.log(`  docType: ${document.docType ?? "(none)"}  taxYear: ${document.taxYear ?? "(none)"}`);
    console.log(`  tags: ${document.tags.join(", ") || "(none)"}  members: ${document.familyMembers.join(", ") || "(none)"}`);
    console.log(`  sections: ${document.sections.map((section) => section.sectionId).join(", ")}  stale removed: ${result.removedKeys.length}`);
    console.log(`  original stored untouched at ${result.originalKey}`);
  }

  if (!values["no-sync"]) {
    await knowledgeBaseSyncAndWait();
  }
} catch (error) {
  console.error(`Failed: ${(error as Error).message}`);
  process.exit(1);
}
