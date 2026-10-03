import './.css'
import { AnimatePresence, motion } from 'motion/react'
import type { Editor } from '@tiptap/react'
import { NOTE_EDITOR_EMOJIS, NOTE_EDITOR_PANEL_VARIANTS, NOTE_EDITOR_TEXT_STYLES, useNoteEditorToolbar } from './.ts'

const NoteEditorToolbar = ({ editor }: { editor: Editor }) => {
  const toolbar = useNoteEditorToolbar(editor)

  return <div ref={toolbar.rootRef} className="note-editor-toolbar flex items-center justify-center gap-6" role="toolbar" aria-label="Formatting" onKeyDown={toolbar.closeOnEscape}>
    <div className="relative">
      <button
        type="button"
        className="note-editor-toolbar__button note-editor-toolbar__style flex items-center gap-1 rounded-md"
        aria-label={`Text style: ${toolbar.styleLabel}`}
        aria-haspopup="true"
        aria-expanded={toolbar.panel === 'style'}
        onClick={() => toolbar.togglePanel('style')}
      >
        <span className="material-symbols-outlined note-editor-toolbar__icon" aria-hidden="true">text_fields</span>
        <span className="material-symbols-outlined note-editor-toolbar__chevron" aria-hidden="true">expand_more</span>
      </button>
      <AnimatePresence>
        {toolbar.panel === 'style' &&
          <motion.div className="note-editor-toolbar__panel note-editor-toolbar__style-panel absolute rounded-lg p-1" variants={NOTE_EDITOR_PANEL_VARIANTS} initial="closed" animate="open" exit="closed">
            {NOTE_EDITOR_TEXT_STYLES.map((style) =>
              <button
                key={style.key}
                type="button"
                className="note-editor-toolbar__option flex h-9 w-full items-center gap-2 rounded-md px-2"
                data-level={style.level ?? 'body'}
                data-selected={style.level === toolbar.active.level}
                onClick={() => toolbar.applyStyle(style.level)}
              >
                <span className="material-symbols-outlined note-editor-toolbar__check flex-none" aria-hidden="true">check</span>
                {style.label}
              </button>
            )}
          </motion.div>}
      </AnimatePresence>
    </div>

    <div className="flex items-center gap-3">
      <div className="relative">
        <button
          type="button"
          className="note-editor-toolbar__button grid place-items-center rounded-md"
          data-active={toolbar.active.link}
          aria-label="Link"
          aria-haspopup="true"
          aria-expanded={toolbar.panel === 'link'}
          onClick={() => toolbar.togglePanel('link')}
        >
          <span className="material-symbols-outlined note-editor-toolbar__icon" aria-hidden="true">link</span>
        </button>
        <AnimatePresence>
          {toolbar.panel === 'link' &&
            <motion.form className="note-editor-toolbar__panel note-editor-toolbar__link-panel absolute flex items-center gap-2 rounded-lg p-2" variants={NOTE_EDITOR_PANEL_VARIANTS} initial="closed" animate="open" exit="closed" onSubmit={toolbar.applyLink}>
              <input
                className="note-editor-toolbar__link-input min-w-0 flex-1 rounded-md px-2"
                placeholder="Paste a link"
                aria-label="Link address"
                value={toolbar.linkDraft}
                autoFocus
                onChange={(event) => toolbar.setLinkDraft(event.target.value)}
              />
              {toolbar.active.link &&
                <button type="button" className="note-editor-toolbar__link-action rounded-md px-2" onClick={toolbar.removeLink}>Remove</button>}
              <button type="submit" className="note-editor-toolbar__link-action note-editor-toolbar__link-apply rounded-md px-2">Apply</button>
            </motion.form>}
        </AnimatePresence>
      </div>
      <button type="button" className="note-editor-toolbar__button grid place-items-center rounded-md" data-active={toolbar.active.bold} aria-label="Bold" aria-pressed={toolbar.active.bold} onClick={toolbar.toggleBold}>
        <span className="material-symbols-outlined note-editor-toolbar__icon" aria-hidden="true">format_bold</span>
      </button>
      <button type="button" className="note-editor-toolbar__button grid place-items-center rounded-md" data-active={toolbar.active.italic} aria-label="Italic" aria-pressed={toolbar.active.italic} onClick={toolbar.toggleItalic}>
        <span className="material-symbols-outlined note-editor-toolbar__icon" aria-hidden="true">format_italic</span>
      </button>
      <button type="button" className="note-editor-toolbar__button grid place-items-center rounded-md" data-active={toolbar.active.bulletList} aria-label="Bulleted list" aria-pressed={toolbar.active.bulletList} onClick={toolbar.toggleBulletList}>
        <span className="material-symbols-outlined note-editor-toolbar__icon" aria-hidden="true">format_list_bulleted</span>
      </button>
      <div className="relative">
        <button
          type="button"
          className="note-editor-toolbar__button grid place-items-center rounded-md"
          aria-label="Insert emoji"
          aria-haspopup="true"
          aria-expanded={toolbar.panel === 'emoji'}
          onClick={() => toolbar.togglePanel('emoji')}
        >
          <span className="material-symbols-outlined note-editor-toolbar__icon" aria-hidden="true">mood</span>
        </button>
        <AnimatePresence>
          {toolbar.panel === 'emoji' &&
            <motion.div className="note-editor-toolbar__panel note-editor-toolbar__emoji-panel absolute grid rounded-lg p-2" variants={NOTE_EDITOR_PANEL_VARIANTS} initial="closed" animate="open" exit="closed">
              {NOTE_EDITOR_EMOJIS.map((emoji) =>
                <button key={emoji} type="button" className="note-editor-toolbar__emoji grid place-items-center rounded-md" aria-label={`Insert ${emoji}`} onClick={() => toolbar.insertEmoji(emoji)}>{emoji}</button>
              )}
            </motion.div>}
        </AnimatePresence>
      </div>
    </div>
  </div>
}

export default NoteEditorToolbar
