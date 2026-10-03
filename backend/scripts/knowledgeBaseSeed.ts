import { postgres_pool } from "../loaders/postgresLoader.js";
import requireEnv from "../modules/requireEnv.js";
import { clientResolve } from "../services/clients/clientMethods.js";
import { knowledgeBaseDocumentIngestDecision, knowledgeBaseDocumentRemove } from "../services/knowledgeBase/knowledgeBaseDocumentMethods.js";
import { knowledgeBaseSyncAndWait } from "./knowledgeBaseSync.js";

type SeedAnswer = { answer: boolean; status: "confirmed" | "tentative" };

type SeedDocument = {
  clientSlug: string;
  fileName: string;
  docType: string;
  text: string;
  answers: Record<string, SeedAnswer>;
};

// Client slugs and member names match scripts/seedDemo.ts, so run db:seed first.
const SEED_DOCUMENTS: SeedDocument[] = [
  {
    clientSlug: "johnson",
    fileName: "seed_adam_w2_2025.pdf",
    docType: "w2",
    text: "Form W-2 for Adam Johnson (seed_adam_w2_2025.pdf). Every amount on this form belongs to Adam Johnson.\nEmployer's name: Northwind Logistics Sample.\ne Employee's name: Adam Johnson.\n1 Wages, tips, other compensation: 148,250.00.\n2 Federal income tax withheld: 27,410.33.\n12a Code D (401(k) elective deferrals): $ 23,000.00.",
    answers: {
      tag_tax: { answer: true, status: "confirmed" },
      tag_earnings: { answer: true, status: "confirmed" },
      member_adam_johnson: { answer: true, status: "confirmed" },
      member_jess_johnson: { answer: false, status: "confirmed" },
    },
  },
  {
    clientSlug: "johnson",
    fileName: "seed_jess_w2_2025.pdf",
    docType: "w2",
    text: "Form W-2 for Jess Johnson (seed_jess_w2_2025.pdf). Every amount on this form belongs to Jess Johnson.\nEmployer's name: Lakeside Medical Sample.\ne Employee's name: Jess Johnson.\n1 Wages, tips, other compensation: 84,200.00.\n2 Federal income tax withheld: 12,630.00.",
    answers: {
      tag_tax: { answer: true, status: "tentative" },
      tag_earnings: { answer: true, status: "confirmed" },
      member_adam_johnson: { answer: false, status: "confirmed" },
      member_jess_johnson: { answer: true, status: "confirmed" },
    },
  },
  {
    clientSlug: "johnson",
    fileName: "seed_joint_1099div_2025.pdf",
    docType: "1099",
    text: "Form 1099-DIV for Adam Johnson and Jess Johnson (seed_joint_1099div_2025.pdf), joint brokerage account.\n1a Total ordinary dividends: 4,182.17.\n1b Qualified dividends: 3,610.40.\n2a Total capital gain distributions: 1,250.00.\n7 Foreign tax paid: 86.12.",
    answers: {
      tag_tax: { answer: true, status: "confirmed" },
      tag_earnings: { answer: false, status: "confirmed" },
      member_adam_johnson: { answer: true, status: "confirmed" },
      member_jess_johnson: { answer: true, status: "confirmed" },
    },
  },
  {
    clientSlug: "patel",
    fileName: "seed_anika_w2_2025.pdf",
    docType: "w2",
    text: "Form W-2 for Anika Patel (seed_anika_w2_2025.pdf). Every amount on this form belongs to Anika Patel.\nEmployer's name: Brightline Software Sample.\ne Employee's name: Anika Patel.\n1 Wages, tips, other compensation: 212,900.00.\n2 Federal income tax withheld: 44,120.00.",
    answers: {
      tag_tax: { answer: true, status: "confirmed" },
      tag_earnings: { answer: true, status: "confirmed" },
      member_anika_patel: { answer: true, status: "confirmed" },
    },
  },
];

// Mirrors the raw decision shape the decision service returns, so the seed exercises the real ingest path.
function seedDecision(document: SeedDocument): Uint8Array {
  const evidence = [{ id: "document", text: document.text, relevance: 1.0 }];
  const answers: Record<string, unknown> = {
    docType: { type: "choice", choice: document.docType, probabilities: { [document.docType]: 0.9 }, confidence: 0.8, evidence },
  };

  for (const [key, value] of Object.entries(document.answers)) {
    answers[key] = { type: "document_noul", mode: "both", answer: value.answer, status: value.status, evidence };
  }

  return Buffer.from(JSON.stringify({ answers }, null, 2));
}

async function seedClientIds(): Promise<Map<string, string>> {
  const advisorId = requireEnv("DEFAULT_USER_ID");
  const slugs = [...new Set(SEED_DOCUMENTS.map((document) => document.clientSlug))];
  const resolved = await Promise.all(slugs.map((slug) => clientResolve(advisorId, slug)));
  return new Map(resolved.map((client) => [client.slug, client.id]));
}

async function seedWrite(clientIds: Map<string, string>): Promise<void> {
  const results = await Promise.all(SEED_DOCUMENTS.map((document) => knowledgeBaseDocumentIngestDecision(clientIds.get(document.clientSlug)!, document.fileName, seedDecision(document))));
  for (const { document } of results) {
    console.log(`Seeded ${document.clientId} / ${document.fileName}  tags: ${document.tags.join(", ")}  members: ${document.familyMembers.join(", ")}  taxYear: ${document.taxYear}`);
  }
  await knowledgeBaseSyncAndWait();
}

async function seedRemove(clientIds: Map<string, string>): Promise<void> {
  const removed = await Promise.all(SEED_DOCUMENTS.map((document) => knowledgeBaseDocumentRemove(clientIds.get(document.clientSlug)!, document.fileName)));
  console.log(`Removed ${SEED_DOCUMENTS.length} seed documents (${removed.flat().length} indexed objects) and their stored originals.`);
  await knowledgeBaseSyncAndWait();
}

try {
  const clientIds = await seedClientIds();
  await (process.argv.includes("--remove") ? seedRemove(clientIds) : seedWrite(clientIds));
} catch (error) {
  console.error(`Failed: ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  await postgres_pool.end();
}
