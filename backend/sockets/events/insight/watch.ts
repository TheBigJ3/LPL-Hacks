import { z } from "zod";
import { socketRoom } from "../../../modules/socketRoom.js";
import { AppError } from "../../../modules/AppError.js";
import { GENERAL_ERRORS } from "../../../types/native/errors.js";
import type { SocketEventConfig, SocketEventHandler } from "../../../types/native/sockets/index.js";

const payloadSchema = z.object({
  conversationId: z.uuid(),
});

const config: SocketEventConfig = {
  rateLimitPoints: 1,
};

const handler: SocketEventHandler = async (payload, { socket }) => {
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) throw new AppError(GENERAL_ERRORS.BAD_REQUEST);

  await socket.join(socketRoom("insight", parsed.data.conversationId));
  return { success: true };
};

export default { config, handler };
