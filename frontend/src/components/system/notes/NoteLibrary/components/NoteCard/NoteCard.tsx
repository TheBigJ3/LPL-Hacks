import './.css'
import { motion, type Variants } from 'motion/react'
import type { NoteCardView } from '../../.ts'
import NoteMenu from '../NoteMenu/NoteMenu'

type NoteCardProps = {
  note: NoteCardView
  variants?: Variants
  onOpen: (id: string) => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
}

const NoteCard = ({ note, variants, onOpen, onEdit, onDelete }: NoteCardProps) =>
  <motion.li className="note-card relative flex flex-col justify-between gap-3" data-color={note.color} variants={variants}>
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <span className="note-card__member flex min-w-0 items-center gap-3 rounded-full">
          <span className="note-card__avatar grid flex-none place-items-center rounded-full" aria-hidden="true">{note.memberInitial}</span>
          <span className="truncate">{note.member}</span>
        </span>
        <NoteMenu id={note.id} title={note.title} onView={onOpen} onEdit={onEdit} onDelete={onDelete} />
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <h3 className="note-card__title">{note.title}</h3>
        <p className="note-card__date">{note.date}</p>
      </div>
    </div>
    <p className="note-card__body truncate">{note.body}</p>
    <button type="button" className="note-card__open absolute inset-0" aria-label={`Open ${note.title}`} onClick={() => onOpen(note.id)} />
  </motion.li>

export default NoteCard
