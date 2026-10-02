interface SubmissionButtonProps
{
    onClick?: () => void;
    state: string;
    text: string;
    className?: string;
}

function SubmissionButton({onClick, state, text, className} : SubmissionButtonProps)
{
    return(
       state !== "disabled"  ? <button type="submit" onClick={onClick} className={`flex col-span-2 rounded-full bg-main-white font-bold text-main-black justify-center h-11 items-center cursor-pointer transition-colors hover:bg-white ${className}`}>{text}</button>
       : <LoadingButton text={text} className={className}/>
    )
}

function LoadingButton({text, className} : { text: string; className?: string })
{
    return(
        <button type="button" aria-disabled="true" className={`flex col-span-2 rounded-full bg-white/20 font-bold text-main-white/60 justify-center h-11 items-center ${className}`}>{text}</button>
    )
}

export default SubmissionButton
