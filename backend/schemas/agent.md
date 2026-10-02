# Rules
- Postgres came with the template; the pipeline stores documents and fields in DynamoDB. No tables exist yet — only add a Drizzle table if something genuinely needs relational storage. DynamoDB table/key design is documented next to its loader/service, not here.
- Drizzle ORM schema definitions only (tables, columns, relations) — this is the DB schema, nothing else.
- Zod schemas and TS types go in `backend/types`, not here.

# Specifics
- Column keys are pascalCase, mapped to a snake_case DB column name:
  `pascalCase: text("pascal_case")`
- If a column type repeats across tables (e.g. `createdAt`, `updatedAt`, or a shared `userType`), define it once in `general.ts` and import it — don't redefine it per table.
