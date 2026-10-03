import './.css'
import { motion, type Variants } from 'motion/react'
import type { NoteCardView } from '../../.ts'
import NoteMenu from '../NoteMenu/NoteMenu'

type NoteTableProps = {
  notes: NoteCardView[]
  variants?: Variants
  onOpen: (id: string) => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
}

const NoteTable = ({ notes, variants, onOpen, onEdit, onDelete }: NoteTableProps) =>
  <table className="note-table w-full">
    <thead>
      <tr>
        <th scope="col" className="note-table__name-cell">Name</th>
        <th scope="col" className="note-table__preview-cell">Preview</th>
        <th scope="col" className="note-table__member-cell">Member</th>
        <th scope="col" className="note-table__date-cell">Created</th>
        <th scope="col" className="note-table__menu-cell"><span className="sr-only">Actions</span></th>
      </tr>
    </thead>
    <tbody>
      {notes.map((note) =>
        <motion.tr key={note.id} className="note-table__row" variants={variants}>
          <th scope="row" className="note-table__name-cell">
            <button type="button" className="note-table__open flex w-full min-w-0 items-center gap-4 text-left" aria-label={`Open ${note.title}`} onClick={() => onOpen(note.id)}>
              <span className="note-table__icons relative grid flex-none" aria-hidden="true">
                <span className="material-symbols-outlined note-table__icon note-table__icon-note">sticky_note_2</span>
                <span className="material-symbols-outlined note-table__icon note-table__icon-edit">edit</span>
              </span>
              <span className="note-table__title truncate">{note.title}</span>
            </button>
          </th>
          <td className="note-table__preview-cell"><span className="note-table__preview block truncate">{note.body}</span></td>
          <td className="note-table__member-cell">
            <span className="flex min-w-0 items-center gap-3">
              <span className="note-table__avatar grid flex-none place-items-center rounded-full" aria-hidden="true">{note.memberInitial}</span>
              <span className="truncate">{note.member}</span>
            </span>
          </td>
          <td className="note-table__date-cell">{note.date}</td>
          <td className="note-table__menu-cell">
            <NoteMenu id={note.id} title={note.title} onView={onOpen} onEdit={onEdit} onDelete={onDelete} />
          </td>
        </motion.tr>
      )}
    </tbody>
  </table>

export default NoteTable
