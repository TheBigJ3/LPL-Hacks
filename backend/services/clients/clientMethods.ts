import { asc, eq } from "drizzle-orm";
import type { Client } from "@lpl-hacks/shared/src/types/native/clients/client.js";
import { db } from "../../loaders/postgresLoader.js";
import { clientMembers, clients } from "../../schemas/clients.js";

export async function clientList(advisorId: string): Promise<Client[]> {
  const rows = await db.select({
    id: clients.id,
    slug: clients.slug,
    name: clients.name,
    kind: clients.kind,
    member: { id: clientMembers.id, slug: clientMembers.slug, name: clientMembers.name },
  })
    .from(clients)
    .leftJoin(clientMembers, eq(clientMembers.clientId, clients.id))
    .where(eq(clients.advisorId, advisorId))
    .orderBy(asc(clients.name), asc(clientMembers.name));

  const byId = new Map<string, Client>();
  for (const { member, ...client } of rows) {
    const entry = byId.get(client.id) ?? byId.set(client.id, { ...client, members: [] }).get(client.id)!;
    if (member) entry.members.push(member);
  }
  return [...byId.values()];
}
