// Fills only keys that are missing or blank, so a value someone set by hand is never replaced.
export function envFileFill(content: string, values: Record<string, string>, header: string): { content: string; filled: string[] } {
  const filled: string[] = [];
  const present = new Set<string>();

  const lines = content.split("\n").map((line) => {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (!match) return line;
    const [, key, value] = match;
    present.add(key!);
    if (value!.trim() !== "" || values[key!] === undefined) return line;
    filled.push(key!);
    return `${key}=${values[key!]}`;
  });

  const missing = Object.entries(values).filter(([key]) => !present.has(key));
  for (const [key] of missing) filled.push(key);

  const appended = missing.length > 0 ? ["", `# ${header}`, ...missing.map(([key, value]) => `${key}=${value}`)] : [];
  const body = lines.join("\n").replace(/\n*$/, "");

  return { content: `${[body, ...appended].join("\n")}\n`, filled };
}
