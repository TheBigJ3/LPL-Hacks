import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useEditorState, type Editor } from '@tiptap/react'
import type { Variants } from 'motion/react'

type NoteEditorToolbarPanel = 'style' | 'link' | 'emoji'

type NoteEditorTextStyle = {
  key: string
  label: string
  level: 1 | 2 | 3 | null
}

export const NOTE_EDITOR_TEXT_STYLES: NoteEditorTextStyle[] = [
  { key: 'paragraph', label: 'Body', level: null },
  { key: 'heading-1', label: 'Heading 1', level: 1 },
  { key: 'heading-2', label: 'Heading 2', level: 2 },
  { key: 'heading-3', label: 'Heading 3', level: 3 },
]

export const NOTE_EDITOR_EMOJIS = [
  '😀', '😊', '👍', '🙏', '🎉', '✅', '⚠️', '❗',
  '📌', '📎', '📄', '📈', '💰', '🏠', '🎓', '⏰',
  '📅', '✍️', '💡', '🔁', '❤️', '🤝', '👀', '⭐',
]

export const NOTE_EDITOR_PANEL_VARIANTS: Variants = {
  closed: { opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.12, ease: 'easeIn' } },
  open: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] } },
}

const noteEditorNormalizeHref = (value: string) => /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`

export function useNoteEditorToolbar(editor: Editor) {
  const [panel, setPanel] = useState<NoteEditorToolbarPanel | null>(null)
  const [linkDraft, setLinkDraft] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      bulletList: current.isActive('bulletList'),
      link: current.isActive('link'),
      level: ([1, 2, 3] as const).find((level) => current.isActive('heading', { level })) ?? null,
    }),
  })

  useEffect(() => {
    if (!panel) return
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setPanel(null)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [panel])

  const togglePanel = (next: NoteEditorToolbarPanel) => {
    if (next === 'link' && panel !== 'link') setLinkDraft(editor.getAttributes('link').href ?? '')
    setPanel((current) => current === next ? null : next)
  }

  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !panel) return
    event.stopPropagation()
    setPanel(null)
    editor.commands.focus()
  }

  const applyStyle = (level: NoteEditorTextStyle['level']) => {
    const chain = editor.chain().focus()
    if (level) chain.setHeading({ level }).run()
    else chain.setParagraph().run()
    setPanel(null)
  }

  const applyLink = (event: FormEvent) => {
    event.preventDefault()
    const href = linkDraft.trim()
    const chain = editor.chain().focus().extendMarkRange('link')
    if (href) chain.setLink({ href: noteEditorNormalizeHref(href) }).run()
    else chain.unsetLink().run()
    setPanel(null)
  }

  const removeLink = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    setPanel(null)
  }

  const insertEmoji = (emoji: string) => {
    editor.chain().focus().insertContent(emoji).run()
    setPanel(null)
  }

  return {
    rootRef,
    panel,
    active,
    styleLabel: NOTE_EDITOR_TEXT_STYLES.find((style) => style.level === active.level)?.label ?? 'Body',
    togglePanel,
    closeOnEscape,
    applyStyle,
    linkDraft,
    setLinkDraft,
    applyLink,
    removeLink,
    insertEmoji,
    toggleBold: () => editor.chain().focus().toggleBold().run(),
    toggleItalic: () => editor.chain().focus().toggleItalic().run(),
    toggleBulletList: () => editor.chain().focus().toggleBulletList().run(),
  }
}
