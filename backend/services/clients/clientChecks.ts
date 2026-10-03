const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function clientCheckIsId(idOrSlug: string): boolean {
  return UUID_PATTERN.test(idOrSlug);
}
