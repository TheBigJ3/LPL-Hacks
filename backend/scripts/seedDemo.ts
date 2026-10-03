import { sql } from "drizzle-orm";
import type { ClientKind } from "@lpl-hacks/shared/src/types/native/clients/client.js";
import { job_postgres_pool } from "../loaders/jobPostgresLoader.js";
import { db, postgres_pool } from "../loaders/postgresLoader.js";
import requireEnv from "../modules/requireEnv.js";
import { clientMembers, clients } from "../schemas/clients.js";

type DemoClient = {
    slug: string;
    name: string;
    kind: ClientKind;
    members: { slug: string; name: string }[];
};

const DEMO_CLIENTS: DemoClient[] = [
    {
        slug: "johnson",
        name: "Johnson Household",
        kind: "household",
        members: [
            { slug: "jess", name: "Jess Johnson" },
            { slug: "michelle", name: "Michelle Johnson" },
            { slug: "adam", name: "Adam Johnson" },
            { slug: "kim", name: "Kim Johnson" },
        ],
    },
    { slug: "dana-whitfield", name: "Dana Whitfield", kind: "individual", members: [] },
    {
        slug: "patel",
        name: "Patel Household",
        kind: "household",
        members: [
            { slug: "raj", name: "Raj Patel" },
            { slug: "priya", name: "Priya Patel" },
            { slug: "anika", name: "Anika Patel" },
        ],
    },
    {
        slug: "nguyen",
        name: "Nguyen Household",
        kind: "household",
        members: [
            { slug: "linh", name: "Linh Nguyen" },
            { slug: "minh", name: "Minh Nguyen" },
            { slug: "bao", name: "Bao Nguyen" },
        ],
    },
    { slug: "marcus-reed", name: "Marcus Reed", kind: "individual", members: [] },
    {
        slug: "garcia",
        name: "Garcia Household",
        kind: "household",
        members: [
            { slug: "sofia", name: "Sofia Garcia" },
            { slug: "mateo", name: "Mateo Garcia" },
        ],
    },
    { slug: "elena-rossi", name: "Elena Rossi", kind: "individual", members: [] },
    { slug: "kenji-sato", name: "Kenji Sato", kind: "individual", members: [] },
];

const advisorId = requireEnv("DEFAULT_USER_ID");

try {
    const seeded = await db.insert(clients)
        .values(DEMO_CLIENTS.map(({ slug, name, kind }) => ({ advisorId, slug, name, kind })))
        .onConflictDoUpdate({ target: [clients.advisorId, clients.slug], set: { name: sql`excluded.name`, kind: sql`excluded.kind` } })
        .returning({ id: clients.id, slug: clients.slug });

    const clientIds = new Map(seeded.map((client) => [client.slug, client.id]));
    const members = DEMO_CLIENTS.flatMap((client) => client.members.map((member) => ({ clientId: clientIds.get(client.slug)!, ...member })));

    await db.insert(clientMembers)
        .values(members)
        .onConflictDoUpdate({ target: [clientMembers.clientId, clientMembers.slug], set: { name: sql`excluded.name` } });

    console.log(`Seeded ${seeded.length} clients and ${members.length} members for advisor ${advisorId}`);
} finally {
    await Promise.all([postgres_pool.end(), job_postgres_pool.end()]);
}
