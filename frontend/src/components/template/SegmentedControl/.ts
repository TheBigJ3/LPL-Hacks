import { useId } from "react";

export const SEGMENTED_CONTROL_TRANSITION = { type: "spring", stiffness: 520, damping: 42 } as const;

export function useSegmentedControl() {
    return { indicatorId: useId() };
}
