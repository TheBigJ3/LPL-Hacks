import { defineSocketEvent } from "../defineSocketEvent.js";

export default defineSocketEvent<{ documentId: string }>()("documents:extractionSettled");
