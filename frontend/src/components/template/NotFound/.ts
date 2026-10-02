export type NotFoundVariant = "page404"

interface NotFoundAction {
    label: string;
    to: string;
}

interface NotFoundHelpLink {
    label: string;
    to?: string;
}

interface NotFoundHelpText {
    prefix: string;
    links: NotFoundHelpLink[];
}

interface NotFoundContent {
    title: string;
    description: string[];
    actions: NotFoundAction[];
    helpText?: NotFoundHelpText;
}

export const export const notFoundContent: Record<NotFoundVariant, NotFoundContent> = {
    page404: {
        title: "Page not found.",
        description: [
            "This page may have moved, changed, or never existed.",
        ],
        actions: [
            { label: "Back to home", to: "/" },
        ],
    },
}
