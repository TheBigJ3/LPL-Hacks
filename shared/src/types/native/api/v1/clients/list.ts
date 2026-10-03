import type { Client } from "../../../clients/client.js";

export type Response = {
  success: true;
  clients: Client[];
};
