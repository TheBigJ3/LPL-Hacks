import './.css'
import { AnimatePresence, motion } from 'motion/react'
import PageHeader from '@components/template/PageHeader/PageHeader'
import EmptyState from '@components/template/EmptyState/EmptyState'
import { useNoteLibrary } from './.ts'
import NoteToolbar from './components/NoteToolbar/NoteToolbar'
import NoteViewToggle from './components/NoteViewToggle/NoteViewToggle'
import NoteEditor from './popup/NoteEditor/NoteEditor'
import NoteCard from './components/NoteCard/NoteCard'
import NoteTable from './components/NoteTable/NoteTable'

const NoteLibrary = () => {
  const library = useNoteLibrary()

  if (!library.clientSelected) return <>
    <PageHeader title="Notes" />
    <div className="note-library flex flex-1 items-center justify-center">
      <h1 className="sr-only">Notes</h1>
      <EmptyState title="No client selected" subtitle="Select one to get started" />
    </div>
  </>

  return <>
    <PageHeader title="Notes">
      <NoteToolbar search={library.search} onCreate={library.createNote} />
    </PageHeader>

    <div className="note-library flex flex-col items-center">
      <h1 className="sr-only">Notes</h1>
      <section className="note-library__content flex w-full flex-col" aria-labelledby="note-library-title">
        <header className="flex items-center justify-between gap-4">
          <h2 id="note-library-title" className="note-library__title">All notes</h2>
          <NoteViewToggle view={library.view} onChange={library.setView} />
        </header>

        <AnimatePresence mode="wait">
          <motion.div
            key={library.view}
            variants={library.sectionVariants}
            initial="enter"
            animate="center"
            exit="exit"
          >
            {!library.notes.length && <EmptyState title={library.empty.title} subtitle={library.empty.subtitle} />}
            {!!library.notes.length && library.view === 'grid' &&
              <ul className="note-library__notes grid">
                {library.notes.map((note) => <NoteCard key={note.id} note={note} variants={library.itemVariants} onOpen={library.viewNote} onEdit={library.editNote} onDelete={library.deleteNote} />)}
              </ul>}
            {!!library.notes.length && library.view === 'list' && <NoteTable notes={library.notes} variants={library.itemVariants} onOpen={library.viewNote} onEdit={library.editNote} onDelete={library.deleteNote} />}
          </motion.div>
        </AnimatePresence>
      </section>
    </div>

    <AnimatePresence>
      {library.editor.open &&
        <NoteEditor
          key={library.editor.key}
          draft={library.editor.draft}
          startsEditing={library.editor.startsEditing}
          members={library.editor.members}
          onSave={library.editor.save}
          onClose={library.editor.close}
        />}
    </AnimatePresence>
  </>
}

export default NoteLibrary
