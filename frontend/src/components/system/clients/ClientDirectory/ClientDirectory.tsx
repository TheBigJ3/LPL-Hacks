import './.css'
import { AnimatePresence, motion } from 'motion/react'
import PageHeader from '@components/template/PageHeader/PageHeader'
import EmptyState from '@components/template/EmptyState/EmptyState'
import OnboardingTour from '@components/template/OnboardingTour/OnboardingTour'
import {
  CLIENT_DIRECTORY_ITEM_VARIANTS,
  CLIENT_DIRECTORY_LIST_VARIANTS,
  CLIENT_DIRECTORY_TOUR_STEPS,
  CLIENT_DIRECTORY_TOUR_STORAGE_KEY,
  useClientDirectory,
} from './.ts'
import ClientToolbar from './components/ClientToolbar/ClientToolbar'
import ClientCard from './components/ClientCard/ClientCard'
import ClientOnboarding from './popup/ClientOnboarding/ClientOnboarding'

const ClientDirectory = () => {
  const directory = useClientDirectory()

  return <>
    <PageHeader title="Clients">
      <ClientToolbar query={directory.query} onQueryChange={directory.setQuery} onClear={directory.clearQuery} onAdd={directory.onboarding.start} />
    </PageHeader>

    <div className="client-directory flex flex-col items-center">
      <h1 className="sr-only">Clients</h1>
      <section data-onboarding="client-list" className="client-directory__content flex w-full flex-col" aria-labelledby="client-directory-title">
        <header className="flex items-baseline gap-3">
          <h2 id="client-directory-title" className="client-directory__title">All clients</h2>
          {!directory.loading && <span className="client-directory__count">{directory.total}</span>}
        </header>

        {directory.error && <p className="client-directory__error" role="alert">{directory.error}</p>}

        {!directory.loading && !directory.error && !directory.cards.length &&
          <div className="flex flex-col items-center">
            <EmptyState title={directory.empty.title} subtitle={directory.empty.subtitle} />
            {directory.empty.canAdd &&
              <button type="button" className="client-directory__add flex h-11 items-center gap-2 rounded-lg px-4" onClick={directory.onboarding.start}>
                <span className="material-symbols-outlined" aria-hidden="true">person_add</span>
                Add your first client
              </button>}
          </div>}

        {!!directory.cards.length &&
          <motion.ul className="client-directory__grid grid" variants={CLIENT_DIRECTORY_LIST_VARIANTS} initial="enter" animate="center">
            {directory.cards.map((card) => <ClientCard key={card.id} card={card} variants={CLIENT_DIRECTORY_ITEM_VARIANTS} />)}
          </motion.ul>}
      </section>
    </div>

    <OnboardingTour steps={CLIENT_DIRECTORY_TOUR_STEPS} storageKey={CLIENT_DIRECTORY_TOUR_STORAGE_KEY} />

    <AnimatePresence>
      {directory.onboarding.open && <ClientOnboarding onClose={directory.onboarding.close} />}
    </AnimatePresence>
  </>
}

export default ClientDirectory
