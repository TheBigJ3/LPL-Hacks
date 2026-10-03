import './.css'
import { AnimatePresence, motion } from 'motion/react'
import { NOTE_MENU_VARIANTS, useNoteMenu } from './.ts'

type NoteMenuProps = {
  id: string
  title: string
  onView: (id: string) => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
}

const NoteMenu = ({ id, title, onView, onEdit, onDelete }: NoteMenuProps) => {
  const menu = useNoteMenu(id, onView, onEdit, onDelete)

  return <div ref={menu.rootRef} className="note-menu relative flex-none" onKeyDown={menu.closeOnEscape}>
    <button
      ref={menu.buttonRef}
      type="button"
      className="note-menu__button grid place-items-center rounded-full"
      aria-label={`More options for ${title}`}
      aria-haspopup="true"
      aria-expanded={menu.open}
      onClick={menu.toggle}
    >
      <span className="material-symbols-outlined" aria-hidden="true">more_vert</span>
    </button>
    <AnimatePresence>
      {menu.open &&
        <motion.div className="note-menu__popover absolute right-0 z-10 rounded-lg p-1" variants={NOTE_MENU_VARIANTS} initial="closed" animate="open" exit="closed">
          <button type="button" className="note-menu__item flex h-9 w-full items-center gap-2 rounded-md px-2" onClick={menu.view}>
            <span className="material-symbols-outlined note-menu__icon" aria-hidden="true">visibility</span>
            View note
          </button>
          <button type="button" className="note-menu__item flex h-9 w-full items-center gap-2 rounded-md px-2" onClick={menu.edit}>
            <span className="material-symbols-outlined note-menu__icon" aria-hidden="true">edit</span>
            Edit note
          </button>
          <button type="button" className="note-menu__item note-menu__item-danger flex h-9 w-full items-center gap-2 rounded-md px-2" onClick={menu.remove}>
            <span className="material-symbols-outlined note-menu__icon" aria-hidden="true">delete</span>
            Delete note
          </button>
        </motion.div>}
    </AnimatePresence>
  </div>
}

export default NoteMenu
