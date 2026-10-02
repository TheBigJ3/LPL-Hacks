import type * as React from "react"
import FormInput from "../FormInput/FormInput"
import { usePasswordInput } from "./.ts"

type PasswordInputProps = {
    name: string;
    placeholder: string;
    label?: string;
    className?: string;
    error?: string;
    value?: string;
    autoComplete: "current-password" | "new-password";
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

export default function PasswordInput(props: PasswordInputProps) {
    const password = usePasswordInput()

    return (
        <FormInput
            {...props}
            type={password.type}
            trailing={
                <button type="button" className="flex size-11 items-center justify-center text-paragraph-off-white transition-colors hover:text-main-white" aria-label={password.toggleLabel} onClick={password.toggle}>
                    <span className="material-symbols-outlined text-[20px]" translate="no" aria-hidden="true">{password.icon}</span>
                </button>
            }
        />
    )
}
