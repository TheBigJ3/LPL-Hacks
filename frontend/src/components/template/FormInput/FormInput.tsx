import type * as React from "react"
import './.css'

interface FormInputProps {
    name: string;
    type: string;
    placeholder: string;
    label?: string;
    className?: string;
    error?: string;
    value?: string;
    max?: string;
    autoComplete?: string;
    trailing?: React.ReactNode;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function FormInput({
    name,
    type,
    placeholder,
    label,
    className = "",
    error,
    value,
    max,
    autoComplete,
    trailing,
    onChange
}: FormInputProps)
{
   
    return(
        <div className={`form-input flex w-full min-w-0 ${className} flex-col gap-1.5`} data-error={Boolean(error)} data-trailing={Boolean(trailing)}>
            {label && (
                <label
                    htmlFor={name}
                    className="pl-[2px] text-[13px] text-paragraph-off-white font-[Arimo] font-normal leading-[140%]"
                >
                    {label}
                </label>
            )}
            <div className="relative flex w-full">
                <input 
                    id={name}
                    name={name} 
                    type={type} 
                    placeholder={placeholder} 
                    value={value}
                    max={max}
                    autoComplete={autoComplete}
                    aria-invalid={Boolean(error)}
                    className="form-input__field flex h-11 w-full rounded-xl border border-card-outlines bg-white/[0.04] px-[14px] text-[15px] text-main-white"
                    onChange={onChange} 
                />
                {trailing && <div className="absolute inset-y-0 right-0 flex items-center">{trailing}</div>}
            </div>
            {error && <p className="pl-[2px] w-full text-xs text-error-outline font-[Arimo]">{`${error}`}</p>}
        </div>
    )
}
export default FormInput
