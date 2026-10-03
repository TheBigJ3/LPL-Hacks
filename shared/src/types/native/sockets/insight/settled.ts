import { defineSocketEvent } from "../defineSocketEvent.js";

export default defineSocketEvent<{ conversationId: string; messageId: string }>()("insight:settled");
