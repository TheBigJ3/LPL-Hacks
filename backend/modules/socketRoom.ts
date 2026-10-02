export function socketRoom(kind: string, id: string): string {
  return `${kind}:${id}`;
}
