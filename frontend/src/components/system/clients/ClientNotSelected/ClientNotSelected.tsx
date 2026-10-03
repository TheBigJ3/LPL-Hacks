import PageHeader from '@components/template/PageHeader/PageHeader'
import EmptyState from '@components/template/EmptyState/EmptyState'

const ClientNotSelected = () => <>
  <PageHeader title="All Households" />
  <div className="flex flex-1 items-center justify-center px-4">
    <h1 className="sr-only">No client selected</h1>
    <EmptyState title="No client selected" subtitle="Select one to get started" />
  </div>
</>

export default ClientNotSelected
