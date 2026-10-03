import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extensions'
import type { Variants } from 'motion/react'
import { APP_LAYOUT_CONTENT_ID } from '@components/template/AppLayout/.ts'
import { NOTE_ERRORS } from '@typings/native/notes/errors'
import type { NoteColor, NoteDraft, NoteSaved } from '../../.ts'

const NOTE_EDITOR_BODY_PLACEHOLDER = 'Start writing…'

export const NOTE_EDITOR_TITLE_PLACEHOLDER = 'Untitled note'

export const NOTE_EDITOR_FADE_VARIANTS: Variants = {
  hidden: { opacity: 0, transition: { duration: 0.14, ease: 'easeInOut' } },
  shown: { opacity: 1, transition: { duration: 0.18, ease: 'easeInOut' } },
}

export const NOTE_EDITOR_VARIANTS: Variants = {
  closed: { opacity: 0, transition: { duration: 0.18, ease: 'easeInOut' } },
  open: { opacity: 1, transition: { duration: 0.24, ease: 'easeInOut' } },
}

type NoteEditorPasteSplit = {
  title: string
  body: string
}

const NOTE_EDITOR_HEADING_TAGS = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6']
const NOTE_EDITOR_BOLD_TAGS = ['STRONG', 'B']
const NOTE_EDITOR_WRAPPER_TAGS = ['DIV', 'SECTION', 'ARTICLE', 'B', 'SPAN']

const noteEditorEscapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const noteEditorTextToHtml = (text: string) =>
  text.split(/\n{2,}|\r\n\r\n/).map((block) => block.trim()).filter(Boolean)
    .map((block) => `<p>${block.split(/\r?\n/).map(noteEditorEscapeHtml).join('<br>')}</p>`).join('')

const noteEditorIsBold = (element: Element) => {
  const weight = (element as HTMLElement).style?.fontWeight
  return NOTE_EDITOR_BOLD_TAGS.includes(element.tagName) && weight !== 'normal' && weight !== '400'
    || weight === 'bold' || Number(weight) >= 600
}

const noteEditorIsStrongBlock = (element: Element) => {
  if (NOTE_EDITOR_HEADING_TAGS.includes(element.tagName) || noteEditorIsBold(element)) return true
  if (!element.textContent?.trim()) return false
  const unbolded = element.cloneNode(true) as Element
  ;[...unbolded.querySelectorAll('*')].filter(noteEditorIsBold).forEach((node) => node.remove())
  return !unbolded.textContent?.trim()
}

const noteEditorFirstBlocks = (root: Element): Element[] => {
  const blocks = [...root.children].filter((child) => child.textContent?.trim() && child.tagName !== 'META' && child.tagName !== 'STYLE')
  const only = blocks[0]
  if (blocks.length === 1 && NOTE_EDITOR_WRAPPER_TAGS.includes(only.tagName) && only.children.length > 1) return noteEditorFirstBlocks(only)
  return blocks
}

const noteEditorSplitHtml = (html: string): NoteEditorPasteSplit | null => {
  const root = new DOMParser().parseFromString(html, 'text/html').body
  const [first, ...rest] = noteEditorFirstBlocks(root)
  if (!first || !noteEditorIsStrongBlock(first)) return null
  return { title: first.textContent?.replace(/\s+/g, ' ').trim() ?? '', body: rest.map((block) => block.outerHTML).join('') }
}

const noteEditorSplitText = (text: string): NoteEditorPasteSplit | null => {
  const [firstLine, ...rest] = text.replace(/^\s+/, '').split(/\r?\n/)
  const heading = firstLine.match(/^#{1,6}\s+(.+)$/)?.[1] ?? firstLine.match(/^\*\*(.+)\*\*$/)?.[1]
  if (!heading) return null
  return { title: heading.trim(), body: noteEditorTextToHtml(rest.join('\n')) }
}

const noteEditorSplitPaste = (html: string, text: string) =>
  (html ? noteEditorSplitHtml(html) : null) ?? noteEditorSplitText(text)

const noteEditorReadClipboard = async () => {
  if (navigator.clipboard.read) {
    const items = await navigator.clipboard.read()
    const htmlItem = items.find((item) => item.types.includes('text/html'))
    const textItem = items.find((item) => item.types.includes('text/plain'))
    return {
      html: htmlItem ? await (await htmlItem.getType('text/html')).text() : '',
      text: textItem ? await (await textItem.getType('text/plain')).text() : '',
    }
  }
  return { html: '', text: await navigator.clipboard.readText() }
}

export function useNoteEditor(
  draft: NoteDraft,
  startsEditing: boolean,
  onSave: (saved: NoteSaved) => void,
  onClose: () => void,
) {
  const [saved, setSaved] = useState(draft)
  const [editing, setEditing] = useState(startsEditing)
  const [title, setTitle] = useState(draft.title)
  const [color, setColor] = useState<NoteColor>(draft.color)
  const [memberId, setMemberId] = useState(draft.memberId)
  const [isEmpty, setIsEmpty] = useState(!draft.title && !draft.html.replace(/<[^>]*>/g, '').trim())
  const [pasteError, setPasteError] = useState<string | null>(null)
  const titleRef = useRef(title)
  const scrollRef = useRef<HTMLDivElement>(null)
  titleRef.current = title
  const applySplitRef = useRef<(split: NoteEditorPasteSplit) => boolean>(() => false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      }),
      Placeholder.configure({ placeholder: NOTE_EDITOR_BODY_PLACEHOLDER }),
    ],
    content: draft.html,
    editable: startsEditing,
    editorProps: {
      attributes: { class: 'note-editor__body', 'aria-label': 'Note body' },
      handlePaste: (_view, event) => {
        const split = noteEditorSplitPaste(event.clipboardData?.getData('text/html') ?? '', event.clipboardData?.getData('text/plain') ?? '')
        return split ? applySplitRef.current(split) : false
      },
    },
    onUpdate: ({ editor: current }) => setIsEmpty(!titleRef.current.trim() && current.isEmpty),
  })

  useEffect(() => {
    editor.setEditable(editing)
  }, [editor, editing])

  const portalTarget = document.getElementById(APP_LAYOUT_CONTENT_ID)
  if (!portalTarget) throw new Error(`NoteEditor needs #${APP_LAYOUT_CONTENT_ID} from AppLayout to mount into`)

  const insertBody = (html: string) => {
    if (!html) return
    if (editor.isEmpty) editor.chain().setContent(html).focus('end').run()
    else editor.chain().focus().insertContent(html).run()
  }

  const applySplit = (split: NoteEditorPasteSplit) => {
    if (titleRef.current.trim()) return false
    setTitle(split.title)
    setIsEmpty(false)
    insertBody(split.body)
    if (!split.body) editor.commands.focus('end')
    return true
  }
  applySplitRef.current = applySplit

  const changeTitle = (value: string) => {
    setTitle(value)
    setIsEmpty(!value.trim() && editor.isEmpty)
  }

  const titlePaste = (event: ClipboardEvent) => {
    const split = noteEditorSplitPaste(event.clipboardData.getData('text/html'), event.clipboardData.getData('text/plain'))
    if (split && applySplit(split)) event.preventDefault()
  }

  const pasteFromClipboard = async () => {
    setPasteError(null)
    const clipboard = await noteEditorReadClipboard().catch(() => null)
    if (!clipboard) return setPasteError(NOTE_ERRORS.CLIPBOARD_UNAVAILABLE.MESSAGE)
    if (!clipboard.html.trim() && !clipboard.text.trim()) return setPasteError(NOTE_ERRORS.CLIPBOARD_EMPTY.MESSAGE)
    const split = noteEditorSplitPaste(clipboard.html, clipboard.text)
    if (split && applySplit(split)) return
    insertBody(clipboard.html || noteEditorTextToHtml(clipboard.text))
    setIsEmpty(false)
  }

  const startEditing = () => {
    const scroller = scrollRef.current
    const top = scroller?.scrollTop ?? 0
    setEditing(true)
    editor.setEditable(true)
    editor.commands.focus('end', { scrollIntoView: false })
    requestAnimationFrame(() => scroller?.scrollTo({ top, behavior: 'instant' }))
  }

  const revert = () => {
    setTitle(saved.title)
    setIsEmpty(!saved.title && !saved.html.replace(/<[^>]*>/g, '').trim())
    setColor(saved.color)
    setMemberId(saved.memberId)
    editor.commands.setContent(saved.html)
    setEditing(false)
  }

  const cancel = () => {
    if (startsEditing) onClose()
    else revert()
  }

  const save = () => {
    const next = { title, html: editor.getHTML(), color, memberId }
    onSave({ ...next, text: editor.getText() })
    if (startsEditing) return onClose()
    setSaved(next)
    setEditing(false)
  }

  const shortcutKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (editing) cancel()
      else onClose()
    } else if (editing && event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      save()
    }
  }

  const titleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.metaKey || event.ctrlKey) return
    event.preventDefault()
    editor.commands.focus('start')
  }

  return {
    portalTarget,
    scrollRef,
    editing,
    startEditing,
    cancel,
    save,
    color,
    setColor,
    memberId,
    setMemberId,
    editor,
    title,
    changeTitle,
    titlePaste,
    showPaste: editing && isEmpty,
    pasteError,
    pasteFromClipboard,
    shortcutKeyDown,
    titleKeyDown,
  }
}
