import { useState } from "react";

export function usePasswordInput() {
    const [visible, setVisible] = useState(false);

    return {
        type: visible ? "text" : "password",
        icon: visible ? "visibility_off" : "visibility",
        toggleLabel: visible ? "Hide password" : "Show password",
        toggle: () => setVisible((current) => !current),
    };
}
