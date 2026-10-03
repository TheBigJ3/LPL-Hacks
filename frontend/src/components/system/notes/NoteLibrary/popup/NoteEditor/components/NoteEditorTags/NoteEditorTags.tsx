import './.css'
import { AnimatePresence, motion } from 'motion/react'
import { NOTE_EDITOR_TAGS_PANEL_VARIANTS, useNoteEditorTags } from './.ts'
import type { NoteColor, NoteMemberOption } from '@components/system/notes/NoteLibrary/.ts'

type NoteEditorTagsProps = {
  color: NoteColor
  memberId: string | null
  members: NoteMemberOption[]
  disabled: boolean
  onColorChange: (color: NoteColor) => void
  onMemberChange: (memberId: string | null) => void
}

const NoteEditorTags = ({ color, memberId, members, disabled, onColorChange, onMemberChange }: NoteEditorTagsProps) => {
  const tags = useNoteEditorTags(color, memberId, members, onColorChange, onMemberChange, disabled)

  return <div ref={tags.rootRef} className="note-editor-tags flex items-center gap-3" data-disabled={disabled} onKeyDown={tags.closeOnEscape}>
    <div className="relative">
      <button
        type="button"
        className="note-editor-tags__swatch block"
        data-color={color}
        aria-label={`Note color: ${tags.colorLabel}`}
        aria-haspopup="true"
        aria-expanded={tags.panel === 'color'}
        disabled={disabled}
        onClick={() => tags.togglePanel('color')}
      />
      <AnimatePresence>
        {tags.panel === 'color' &&
          <motion.div className="note-editor-tags__panel note-editor-tags__color-panel absolute flex gap-2 rounded-lg p-2" role="group" aria-label="Note color" variants={NOTE_EDITOR_TAGS_PANEL_VARIANTS} initial="closed" animate="open" exit="closed">
            {tags.colorOptions.map((option) =>
              <button
                key={option.color}
                type="button"
                className="note-editor-tags__swatch note-editor-tags__swatch-option grid place-items-center"
                data-color={option.color}
                data-selected={option.selected}
                aria-label={option.label}
                aria-pressed={option.selected}
                onClick={() => tags.pickColor(option.color)}
              >
                {option.selected && <span className="material-symbols-outlined note-editor-tags__swatch-check" aria-hidden="true">check</span>}
              </button>
            )}
          </motion.div>}
      </AnimatePresence>
    </div>

    <div className="relative min-w-0">
      <button
        type="button"
        className="note-editor-tags__member flex min-w-0 items-center gap-2 rounded-full"
        aria-label={`Tagged member: ${tags.member.label}`}
        aria-haspopup="true"
        aria-expanded={tags.panel === 'member'}
        disabled={disabled}
        onClick={() => tags.togglePanel('member')}
      >
        <span className="note-editor-tags__avatar grid flex-none place-items-center rounded-full" aria-hidden="true">{tags.memberInitial}</span>
        <span className="truncate">{tags.member.label}</span>
        <span className="material-symbols-outlined note-editor-tags__chevron flex-none" aria-hidden="true">expand_more</span>
      </button>
      <AnimatePresence>
        {tags.panel === 'member' &&
          <motion.div className="note-editor-tags__panel note-editor-tags__member-panel absolute rounded-lg p-1" role="group" aria-label="Tag a member" variants={NOTE_EDITOR_TAGS_PANEL_VARIANTS} initial="closed" animate="open" exit="closed">
            {tags.memberOptions.map((option) =>
              <button
                key={option.key}
                type="button"
                className="note-editor-tags__option flex h-9 w-full items-center gap-2 rounded-md px-2"
                data-selected={option.selected}
                aria-pressed={option.selected}
                onClick={() => tags.pickMember(option.id)}
              >
                <span className="material-symbols-outlined note-editor-tags__check flex-none" aria-hidden="true">check</span>
                <span className="truncate">{option.label}</span>
              </button>
            )}
          </motion.div>}
      </AnimatePresence>
    </div>
  </div>
}

export default NoteEditorTags
