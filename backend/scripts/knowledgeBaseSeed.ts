import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { GetIngestionJobCommand } from "@aws-sdk/client-bedrock-agent";
import { s3_client } from "../loaders/s3Loader.js";
import {
  bedrock_agent_client,
  BEDROCK_DATA_SOURCE_ID,
  BEDROCK_KNOWLEDGE_BASE_BUCKET,
  BEDROCK_KNOWLEDGE_BASE_ID,
} from "../loaders/bedrockAgentLoader.js";
import { knowledgeBaseDocumentSyncStart, knowledgeBaseDocumentWrite } from "../services/knowledgeBase/knowledgeBaseDocumentMethods.js";
import type { KnowledgeBaseDocument } from "../types/native/knowledgeBase/index.js";

const SEED_DOCUMENTS: KnowledgeBaseDocument[] = [
  {
    documentId: "seed-johnson-w2-2025",
    clientId: "johnson-family",
    fileName: "Johnson_Michael_W2_2025.pdf",
    formType: "W-2",
    tags: ["Tax", "Earnings"],
    taxYear: 2025,
    familyMember: "Michael Johnson",
    pages: [
      {
        page: 1,
        text: "Form W-2 Wage and Tax Statement 2025. Employee: Michael Johnson. Employer: Northwind Logistics Inc.",
        fields: [
          { fieldId: "seed-w2-box1", key: "Box 1 Wages, tips, other compensation", value: "148250.00", confidence: 98.6 },
          { fieldId: "seed-w2-box2", key: "Box 2 Federal income tax withheld", value: "27410.33", confidence: 96.1 },
          { fieldId: "seed-w2-box12d", key: "Box 12 Code D 401(k) elective deferrals", value: "23000.00", confidence: 84.2 },
        ],
      },
    ],
  },
  {
    documentId: "seed-johnson-paystub-2026-09",
    clientId: "johnson-family",
    fileName: "Johnson_Sarah_Paystub_2026-09.pdf",
    formType: "Pay Stub",
    tags: ["Earnings"],
    taxYear: 2026,
    familyMember: "Sarah Johnson",
    pages: [
      {
        page: 1,
        text: "Earnings statement, pay period 09/01/2026 to 09/15/2026. Employee: Sarah Johnson. Employer: Lakeside Medical Group.",
        fields: [
          { fieldId: "seed-stub-gross", key: "Gross pay this period", value: "6250.00", confidence: 97.9 },
          { fieldId: "seed-stub-ytd", key: "Gross pay year to date", value: "106250.00", confidence: 88.5 },
          { fieldId: "seed-stub-403b", key: "403(b) contribution this period", value: "500.00", confidence: 93.0 },
        ],
      },
    ],
  },
  {
    documentId: "seed-johnson-1099div-2025",
    clientId: "johnson-family",
    fileName: "Johnson_Joint_1099-DIV_2025.pdf",
    formType: "1099-DIV",
    tags: ["Tax", "Investments"],
    taxYear: 2025,
    familyMember: "Joint",
    pages: [
      {
        page: 1,
        text: "Form 1099-DIV Dividends and Distributions 2025. Recipients: Michael and Sarah Johnson, joint brokerage account.",
        fields: [
          { fieldId: "seed-div-1a", key: "Box 1a Total ordinary dividends", value: "4182.17", confidence: 99.1 },
          { fieldId: "seed-div-1b", key: "Box 1b Qualified dividends", value: "3610.40", confidence: 79.3 },
        ],
      },
      {
        page: 2,
        text: "Form 1099-DIV continued. Capital gain distributions and foreign tax paid.",
        fields: [
          { fieldId: "seed-div-2a", key: "Box 2a Total capital gain distributions", value: "1250.00", confidence: 95.4 },
          { fieldId: "seed-div-7", key: "Box 7 Foreign tax paid", value: "86.12", confidence: 91.8 },
        ],
      },
    ],
  },
  {
    documentId: "seed-patel-w2-2025",
    clientId: "patel-household",
    fileName: "Patel_Anika_W2_2025.pdf",
    formType: "W-2",
    tags: ["Tax", "Earnings"],
    taxYear: 2025,
    familyMember: "Anika Patel",
    pages: [
      {
        page: 1,
        text: "Form W-2 Wage and Tax Statement 2025. Employee: Anika Patel. Employer: Brightline Software LLC.",
        fields: [
          { fieldId: "seed-patel-box1", key: "Box 1 Wages, tips, other compensation", value: "212900.00", confidence: 98.8 },
          { fieldId: "seed-patel-box2", key: "Box 2 Federal income tax withheld", value: "44120.00", confidence: 97.0 },
        ],
      },
    ],
  },
];

function seedKeys(): string[] {
  return SEED_DOCUMENTS.flatMap((document) => document.pages.flatMap((page) => {
    const key = `documents/${document.documentId}/page-${page.page}.json`;
    return [key, `${key}.metadata.json`];
  }));
}

async function seedSyncAndWait(): Promise<void> {
  const ingestionJobId = await knowledgeBaseDocumentSyncStart(Math.floor(Date.now() / 30_000));
  console.log(`Sync started (ingestion ${ingestionJobId}), waiting for it to finish...`);

  for (let attempt = 0; attempt < 60; attempt++) {
    const { ingestionJob } = await bedrock_agent_client.send(new GetIngestionJobCommand({
      knowledgeBaseId: BEDROCK_KNOWLEDGE_BASE_ID,
      dataSourceId: BEDROCK_DATA_SOURCE_ID,
      ingestionJobId,
    }));

    if (ingestionJob?.status === "COMPLETE" || ingestionJob?.status === "FAILED" || ingestionJob?.status === "STOPPED") {
      console.log(`Sync ${ingestionJob.status}`, ingestionJob.statistics, ingestionJob.failureReasons ?? "");
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }

  console.log("Sync still running after 10 minutes; check the Bedrock console.");
}

async function seedWrite(): Promise<void> {
  const written = await Promise.all(SEED_DOCUMENTS.map(knowledgeBaseDocumentWrite));
  console.log(`Wrote ${written.flat().length} pages from ${SEED_DOCUMENTS.length} documents to s3://${BEDROCK_KNOWLEDGE_BASE_BUCKET}/documents/`);
  await seedSyncAndWait();
}

async function seedRemove(): Promise<void> {
  await s3_client.send(new DeleteObjectsCommand({
    Bucket: BEDROCK_KNOWLEDGE_BASE_BUCKET,
    Delete: { Objects: seedKeys().map((Key) => ({ Key })) },
  }));
  console.log(`Deleted ${seedKeys().length} seed objects from s3://${BEDROCK_KNOWLEDGE_BASE_BUCKET}/documents/`);
  await seedSyncAndWait();
}

await (process.argv.includes("--remove") ? seedRemove() : seedWrite());
