import { parseArgs } from "util";
import { postgres_pool } from "../loaders/postgresLoader.js";
import { documentIndexRequeueTagged, documentIndexRun } from "../services/documents/documentIndexMethods.js";
import { knowledgeBaseSyncAndWait } from "./knowledgeBaseSync.js";

const { values } = parseArgs({
  options: {
    "no-sync": { type: "boolean", default: false },
  },
});

try {
  const requeued = await documentIndexRequeueTagged();
  console.log(`Re-indexing ${requeued.length} tagged documents page by page...`);

  const outcomes: Record<string, number> = {};
  for (const document of requeued) {
    const outcome = await documentIndexRun(document.id, document.reviewedAt);
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
  }
  console.log("Done:", outcomes);

  if (!values["no-sync"] && (outcomes.indexed ?? 0) > 0) {
    await knowledgeBaseSyncAndWait();
  }
} catch (error) {
  console.error(`Failed: ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  await postgres_pool.end();
}
