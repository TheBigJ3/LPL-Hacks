const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CLIENT_SLUG_MAX_LENGTH = 60;

export function clientCheckIsId(idOrSlug: string): boolean {
  return UUID_PATTERN.test(idOrSlug);
}

export function clientCheckSlugBase(name: string, fallback: string): string {
  const slug = name.normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, CLIENT_SLUG_MAX_LENGTH)
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

export function clientCheckPickSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

// A member is addressed by first name in links ("?member=jess"); two members who share one fall back to their full names.
export function clientCheckMemberSlugs(names: string[]): string[] {
  const taken: string[] = [];
  for (const name of names) {
    const first = clientCheckSlugBase(name.split(/\s+/)[0] ?? "", "member");
    const base = taken.includes(first) ? clientCheckSlugBase(name, "member") : first;
    taken.push(clientCheckPickSlug(base, taken));
  }
  return taken;
}
