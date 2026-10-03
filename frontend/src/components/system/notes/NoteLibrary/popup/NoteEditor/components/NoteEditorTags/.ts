import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Variants } from 'motion/react'
import { NOTE_COLOR_OPTIONS, type NoteColor, type NoteMemberOption } from '@components/system/notes/NoteLibrary/.ts'

type NoteEditorTagsPanel = 'color' | 'member'

export const NOTE_EDITOR_TAGS_PANEL_VARIANTS: Variants = {
  closed: { opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.12, ease: 'easeIn' } },
  open: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] } },
}

export function useNoteEditorTags(
  color: NoteColor,
  memberId: string | null,
  members: NoteMemberOption[],
  onColorChange: (color: NoteColor) => void,
  onMemberChange: (memberId: string | null) => void,
  disabled: boolean,
) {
  const [panel, setPanel] = useState<NoteEditorTagsPanel | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!panel) return
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setPanel(null)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [panel])

  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !panel) return
    event.stopPropagation()
    setPanel(null)
  }

  useEffect(() => {
    if (disabled) setPanel(null)
  }, [disabled])

  const member = members.find((option) => option.id === memberId) ?? members[0]

  return {
    rootRef,
    panel,
    togglePanel: (next: NoteEditorTagsPanel) => setPanel((current) => current === next ? null : next),
    closeOnEscape,
    colorOptions: NOTE_COLOR_OPTIONS.map((option) => ({ ...option, selected: option.color === color })),
    colorLabel: NOTE_COLOR_OPTIONS.find((option) => option.color === color)?.label ?? color,
    member,
    memberInitial: member.label.charAt(0).toUpperCase(),
    memberOptions: members.map((option) => ({ ...option, key: option.id ?? 'household', selected: option.id === member.id })),
    pickColor: (next: NoteColor) => {
      onColorChange(next)
      setPanel(null)
    },
    pickMember: (next: string | null) => {
      onMemberChange(next)
      setPanel(null)
    },
  }
}
