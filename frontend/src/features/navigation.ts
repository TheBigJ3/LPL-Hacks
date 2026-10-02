export type NavigationOption = { name: string; ref: string; trailingIcon?: string }

export const navigationOptions: NavigationOption[] = [
  { name: "Home", ref: "/#hero" },
  { name: "Events", ref: "/events" },
  { name: "Merch", ref: "/#merch", trailingIcon: "open_in_new" },
]

export function getActiveIndex(pathname: string, hash: string): number {
  if (pathname === "/events") return 1
  if (pathname !== "/") return -1
  if (hash === "#merch") return 2
  return 0
}
