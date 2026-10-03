const PG_UNIQUE_VIOLATION = "23505";
const PG_FOREIGN_KEY_VIOLATION = "23503";

export function isUniqueViolation(error: unknown): boolean {
    return pgErrorCode(error) === PG_UNIQUE_VIOLATION;
}

export function isForeignKeyViolation(error: unknown): boolean {
    return pgErrorCode(error) === PG_FOREIGN_KEY_VIOLATION;
}

// Drizzle wraps the driver's error in a DrizzleQueryError, so the Postgres code sits on its cause.
function pgErrorCode(error: unknown): unknown {
    if (typeof error !== "object" || error === null) return undefined;

    if ("code" in error && typeof error.code === "string") return error.code;

    return "cause" in error ? pgErrorCode(error.cause) : undefined;
}
