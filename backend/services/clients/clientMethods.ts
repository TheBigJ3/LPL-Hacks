import { and, asc, eq, type SQL } from "drizzle-orm";
import type { Client } from "@lpl-hacks/shared/src/types/native/clients/client.js";
import { db } from "../../loaders/postgresLoader.js";
import { AppError } from "../../modules/AppError.js";
import { clientMembers, clients } from "../../schemas/clients.js";
import { CLIENT_ERRORS } from "../../types/native/clients/errors.js";
import { clientCheckIsId } from "./clientChecks.js";

async function clientSelectWithMembers(where: SQL | undefined): Promise<Client[]> {
  const rows = await db.select({
    id: clients.id,
    slug: clients.slug,
    name: clients.name,
    kind: clients.kind,
    member: { id: clientMembers.id, slug: clientMembers.slug, name: clientMembers.name },
  })
    .from(clients)
    .leftJoin(clientMembers, eq(clientMembers.clientId, clients.id))
    .where(where)
    .orderBy(asc(clients.name), asc(clientMembers.name));

  const byId = new Map<string, Client>();
  for (const { member, ...client } of rows) {
    const entry = byId.get(client.id) ?? byId.set(client.id, { ...client, members: [] }).get(client.id)!;
    if (member) entry.members.push(member);
  }
  return [...byId.values()];
}

export async function clientList(advisorId: string): Promise<Client[]> {
  return clientSelectWithMembers(eq(clients.advisorId, advisorId));
}

// Comparing a non-uuid string against the uuid column is a Postgres error, so the lookup column is picked up front.
export async function clientResolve(advisorId: string, idOrSlug: string): Promise<Client> {
  const match = clientCheckIsId(idOrSlug) ? eq(clients.id, idOrSlug) : eq(clients.slug, idOrSlug);
  const [client] = await clientSelectWithMembers(and(eq(clients.advisorId, advisorId), match));

  if (!client) {
    throw new AppError(CLIENT_ERRORS.CLIENT_NOT_FOUND);
  }

  return client;
}
