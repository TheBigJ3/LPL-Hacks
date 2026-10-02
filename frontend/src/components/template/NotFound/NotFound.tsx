import { Link } from "react-router"
import { notFoundContent, type NotFoundVariant } from "./.ts"
import './.css'

interface NotFoundProps {
    variant?: NotFoundVariant;
}

const NotFoundHelp = ({ prefix, links }: { prefix: string; links: { label: string; to?: string }[] }) => (
    <p className="not-found__help text-center font-[Arimo]">
        {prefix}{" "}
        {links.map((link, index) => (
            <span key={link.label}>
                {index > 0 && " or "}
                {link.to
                    ? <Link to={link.to} className="not-found__help-link">{link.label}</Link>
                    : <span className="not-found__help-link">{link.label}</span>}
            </span>
        ))}
        {"."}
    </p>
)

function NotFound({ variant = "page404" }: NotFoundProps) {
    const content = notFoundContent[variant]

    return (
        <div className="not-found flex flex-col items-center justify-center w-full">
            <span className="not-found__code" aria-hidden="true">404</span>

            <div className="not-found__content flex flex-col items-center gap-12">
                <div className="flex flex-col items-center gap-6 text-center">
                    <h2 className="font-bold font-[Arimo] text-main-white">{content.title}</h2>

                    <div className="not-found__description font-[Arimo] text-paragraph-off-white text-center">
                        {content.description.map((line) => <p key={line}>{line}</p>)}
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-3">
                        {content.actions.map((action, index) => (
                            <Link
                                key={action.label}
                                to={action.to}
                                className={
                                    index === 1
                                        ? "not-found__action not-found__action--primary"
                                        : "not-found__action not-found__action--secondary"
                                }
                            >
                                {action.label}
                            </Link>
                        ))}
                    </div>
                </div>

                {content.helpText && <NotFoundHelp prefix={content.helpText.prefix} links={content.helpText.links} />}
            </div>
        </div>
    )
}

export default NotFound
