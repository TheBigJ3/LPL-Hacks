// Only the dev script sets this, so an unset or mistyped NODE_ENV fails closed and never unlocks a development shortcut.
export default function isDevelopment(): boolean {
    return process.env.NODE_ENV === "development";
}
