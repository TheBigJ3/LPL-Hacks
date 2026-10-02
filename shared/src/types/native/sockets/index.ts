export type SocketAck =
    | { success: true }
    | { success: false; status?: string; message: string };
