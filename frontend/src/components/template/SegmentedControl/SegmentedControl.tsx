import { motion } from 'motion/react'
import { SEGMENTED_CONTROL_TRANSITION, useSegmentedControl } from './.ts'
import './.css'

type SegmentedControlOption<T extends string> = {
    value: T;
    label: string;
};

type SegmentedControlProps<T extends string> = {
    options: readonly SegmentedControlOption<T>[];
    value?: T;
    ariaLabel: string;
    onChange: (value: T) => void;
};

export default function SegmentedControl<T extends string>({ options, value, ariaLabel, onChange }: SegmentedControlProps<T>) {
    const control = useSegmentedControl()

    return (
        <div className="segmented-control" role="group" aria-label={ariaLabel}>
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    aria-pressed={value === option.value}
                    className="segmented-control__option"
                    onClick={() => onChange(option.value)}
                >
                    {value === option.value && (
                        <motion.span layoutId={control.indicatorId} className="segmented-control__indicator" transition={SEGMENTED_CONTROL_TRANSITION}/>
                    )}
                    <span className="segmented-control__label">{option.label}</span>
                </button>
            ))}
        </div>
    )
}
