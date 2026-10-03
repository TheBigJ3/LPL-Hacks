import { defineSocketEvent } from "../defineSocketEvent.js";

export default defineSocketEvent<{ conversationId: string }>()("insight:watch");
