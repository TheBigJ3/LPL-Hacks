import { defineSocketEvent } from "../defineSocketEvent.js";

export default defineSocketEvent<{ conversationId: string; messageId: string; text: string }>()("insight:progress");
