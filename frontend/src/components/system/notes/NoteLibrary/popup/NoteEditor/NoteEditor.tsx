import './.css'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { EditorContent } from '@tiptap/react'
import { NOTE_EDITOR_FADE_VARIANTS, NOTE_EDITOR_TITLE_PLACEHOLDER, NOTE_EDITOR_VARIANTS, useNoteEditor } from './.ts'
import NoteEditorToolbar from './components/NoteEditorToolbar/NoteEditorToolbar'
import NoteEditorTags from './components/NoteEditorTags/NoteEditorTags'
import type { NoteDraft, NoteMemberOption, NoteSaved } from '../../.ts'

type NoteEditorProps = {
  draft: NoteDraft
  startsEditing: boolean
  members: NoteMemberOption[]
  onSave: (saved: NoteSaved) => void
  onClose: () => void
}

const NoteEditor = ({ draft, startsEditing, members, onSave, onClose }: NoteEditorProps) => {
  const noteEditor = useNoteEditor(draft, startsEditing, onSave, onClose)

  return createPortal(<motion.div
    className="note-editor absolute inset-0 flex flex-col"
    role="dialog"
    aria-modal="true"
    aria-label={noteEditor.editing ? 'Note editor' : 'Note'}
    data-editing={noteEditor.editing}
    data-paste={noteEditor.showPaste}
    variants={NOTE_EDITOR_VARIANTS}
    initial="closed"
    animate="open"
    exit="closed"
    onKeyDown={noteEditor.shortcutKeyDown}
  >
    <header className="note-editor__header grid flex-none items-center">
      <p className="note-editor__heading">Note editor</p>
      <AnimatePresence initial={false}>
        {noteEditor.editing &&
          <motion.div className="note-editor__toolbar-slot" variants={NOTE_EDITOR_FADE_VARIANTS} initial="hidden" animate="shown" exit="hidden">
            <NoteEditorToolbar editor={noteEditor.editor} />
          </motion.div>}
      </AnimatePresence>
      <AnimatePresence mode="wait" initial={false}>
        {noteEditor.editing
          ? <motion.div key="editing" className="note-editor__actions flex items-center gap-6" variants={NOTE_EDITOR_FADE_VARIANTS} initial="hidden" animate="shown" exit="hidden">
            <button type="button" className="note-editor__action note-editor__cancel grid place-items-center rounded-full" aria-label={startsEditing ? 'Discard changes' : 'Revert to saved'} onClick={noteEditor.cancel}>
              <span className="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
            <button type="button" className="note-editor__action note-editor__save grid place-items-center rounded-full" aria-label="Save note" onClick={noteEditor.save}>
              <span className="material-symbols-outlined" aria-hidden="true">check</span>
            </button>
          </motion.div>
          : <motion.div key="viewing" className="note-editor__actions flex items-center gap-6" variants={NOTE_EDITOR_FADE_VARIANTS} initial="hidden" animate="shown" exit="hidden">
            <button type="button" className="note-editor__action note-editor__edit grid place-items-center rounded-full" aria-label="Edit note" onClick={noteEditor.startEditing}>
              <span className="material-symbols-outlined" aria-hidden="true">edit</span>
            </button>
            <button type="button" className="note-editor__action note-editor__close grid place-items-center rounded-full" aria-label="Close note" onClick={onClose}>
              <span className="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
          </motion.div>}
      </AnimatePresence>
    </header>

    <div ref={noteEditor.scrollRef} className="note-editor__scroll flex-1 overflow-y-auto">
      <div className="note-editor__page mx-auto flex w-full flex-col gap-6">
        <NoteEditorTags
          color={noteEditor.color}
          memberId={noteEditor.memberId}
          members={members}
          disabled={!noteEditor.editing}
          onColorChange={noteEditor.setColor}
          onMemberChange={noteEditor.setMemberId}
        />
        <input
          className="note-editor__title w-full"
          placeholder={NOTE_EDITOR_TITLE_PLACEHOLDER}
          aria-label="Note title"
          value={noteEditor.title}
          readOnly={!noteEditor.editing}
          autoFocus={startsEditing}
          onChange={(event) => noteEditor.changeTitle(event.target.value)}
          onPaste={noteEditor.titlePaste}
          onKeyDown={noteEditor.titleKeyDown}
        />
        <EditorContent editor={noteEditor.editor} />
        <AnimatePresence initial={false}>
          {noteEditor.showPaste &&
            <motion.div className="note-editor__paste flex flex-col items-start gap-2" variants={NOTE_EDITOR_FADE_VARIANTS} initial="hidden" animate="shown" exit="hidden">
              <button type="button" className="note-editor__paste-button flex items-center gap-2.5 rounded-full" onClick={noteEditor.pasteFromClipboard}>
                Or click to paste
                <span className="material-symbols-outlined note-editor__paste-icon" aria-hidden="true">move_to_inbox</span>
              </button>
              {noteEditor.pasteError && <p className="note-editor__paste-error" role="alert">{noteEditor.pasteError}</p>}
            </motion.div>}
        </AnimatePresence>
      </div>
    </div>
  </motion.div>, noteEditor.portalTarget)
}

export default NoteEditor
