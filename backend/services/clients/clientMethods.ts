import { and, asc, eq, like, or, type SQL } from "drizzle-orm";
import type { Params as ClientCreateParams } from "@lpl-hacks/shared/src/types/native/api/v1/clients/create.js";
import type { Client } from "@lpl-hacks/shared/src/types/native/clients/client.js";
import { db } from "../../loaders/postgresLoader.js";
import { AppError } from "../../modules/AppError.js";
import { isUniqueViolation } from "../../modules/pgError.js";
import { clientMembers, clients } from "../../schemas/clients.js";
import { CLIENT_ERRORS } from "../../types/native/clients/errors.js";
import { clientCheckIsId, clientCheckMemberSlugs, clientCheckPickSlug, clientCheckSlugBase } from "./clientChecks.js";

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

// The slug only has to be unique per advisor; a race that takes it between the read and the insert is reported, not retried.
export async function clientCreate(advisorId: string, params: ClientCreateParams): Promise<Client> {
  const base = clientCheckSlugBase(params.name, "client");
  const taken = await db.select({ slug: clients.slug })
    .from(clients)
    .where(and(eq(clients.advisorId, advisorId), or(eq(clients.slug, base), like(clients.slug, `${base}-%`))));

  const slug = clientCheckPickSlug(base, taken.map((row) => row.slug));
  const memberNames = params.kind === "household" ? params.members.map((member) => member.name) : [];
  const memberSlugs = clientCheckMemberSlugs(memberNames);

  try {
    return await db.transaction(async (tx) => {
      const [client] = await tx.insert(clients)
        .values({ advisorId, slug, name: params.name, kind: params.kind })
        .returning({ id: clients.id, slug: clients.slug, name: clients.name, kind: clients.kind });

      const members = memberNames.length === 0 ? [] : await tx.insert(clientMembers)
        .values(memberNames.map((name, index) => ({ clientId: client!.id, slug: memberSlugs[index]!, name })))
        .returning({ id: clientMembers.id, slug: clientMembers.slug, name: clientMembers.name });

      return { ...client!, members: members.sort((a, b) => a.name.localeCompare(b.name)) };
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError(CLIENT_ERRORS.CLIENT_NAME_CONFLICT);
    throw err;
  }
}
