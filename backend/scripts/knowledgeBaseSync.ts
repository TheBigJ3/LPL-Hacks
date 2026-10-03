import { GetIngestionJobCommand } from "@aws-sdk/client-bedrock-agent";
import { bedrock_agent_client, BEDROCK_DATA_SOURCE_ID, BEDROCK_KNOWLEDGE_BASE_ID } from "../loaders/bedrockAgentLoader.js";
import { knowledgeBaseDocumentSyncStart } from "../services/knowledgeBase/knowledgeBaseDocumentMethods.js";

export async function knowledgeBaseSyncAndWait(): Promise<void> {
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
