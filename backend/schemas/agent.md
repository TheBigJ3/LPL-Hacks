# Rules
- Postgres on Amazon RDS is the primary datastore: documents, households, extracted fields, tags and verification state all live in Drizzle tables defined here. Add tables as the pipeline needs them.
- Drizzle ORM schema definitions only (tables, columns, relations) — this is the DB schema, nothing else.
- Zod schemas and TS types go in `backend/types`, not here.

# Specifics
- Column keys are pascalCase, mapped to a snake_case DB column name:
  `pascalCase: text("pascal_case")`
- If a column type repeats across tables (e.g. `createdAt`, `updatedAt`, or a shared `userType`), define it once in `general.ts` and import it — don't redefine it per table.
