import { readFile } from "fs/promises";
import path from "path";
import { parseArgs } from "util";
import { postgres_pool } from "../loaders/postgresLoader.js";
import requireEnv from "../modules/requireEnv.js";
import { clientResolve } from "../services/clients/clientMethods.js";
import { knowledgeBaseDocumentIngestDecision, knowledgeBaseDocumentRemove } from "../services/knowledgeBase/knowledgeBaseDocumentMethods.js";
import { knowledgeBaseSyncAndWait } from "./knowledgeBaseSync.js";

const USAGE = [
  "Usage (client is a client id or slug from the clients table):",
  "  npm run kb:ingest --workspace backend -- --client <id|slug> --document <file name> <decision.json>",
  "  npm run kb:ingest --workspace backend -- --client <id|slug> --document <file name> --remove",
].join("\n");

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    client: { type: "string" },
    household: { type: "string" },
    document: { type: "string" },
    remove: { type: "boolean", default: false },
    "no-sync": { type: "boolean", default: false },
  },
});

const clientArg = (values.client ?? values.household)?.trim();
const documentName = values.document?.trim();

if (!clientArg || !documentName || (!values.remove && positionals.length !== 1)) {
  console.error(USAGE);
  process.exit(1);
}

try {
  // Ingesting under an id the clients table doesn't know makes the document unreachable from /answer/ask.
  const client = await clientResolve(requireEnv("DEFAULT_USER_ID"), clientArg);

  if (values.remove) {
    const removed = await knowledgeBaseDocumentRemove(client.id, documentName);
    console.log(`Removed ${documentName} from ${client.name} (${removed.length} indexed objects) and its stored original.`);
  } else {
    // npm runs workspace scripts from backend/, so a relative path is resolved from where the command was typed.
    const filePath = path.resolve(process.env.INIT_CWD ?? process.cwd(), positionals[0]!);
    const result = await knowledgeBaseDocumentIngestDecision(client.id, documentName, await readFile(filePath));
    const { document } = result;
    console.log(`Ingested ${document.fileName} for ${client.name} (${document.clientId}) as document ${document.documentId}`);
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
  process.exitCode = 1;
} finally {
  await postgres_pool.end();
}
