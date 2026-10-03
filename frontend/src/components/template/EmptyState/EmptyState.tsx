import './.css'
import emptyButterfly from '@assets/documents/empty-butterfly.svg'
import emptyTrail from '@assets/documents/empty-trail.svg'

const EmptyState = ({ title, subtitle, icon }: { title: string; subtitle: string; icon?: string }) =>
  <div className="empty-state flex flex-col items-center gap-4 text-center">
    <div className="empty-state__art relative flex-none overflow-hidden" aria-hidden="true">
      <img src={emptyTrail} alt="" className="empty-state__trail absolute" />
      {icon
        ? <span className="material-symbols-outlined empty-state__icon absolute">{icon}</span>
        : <img src={emptyButterfly} alt="" className="empty-state__butterfly absolute" />}
    </div>
    <div className="flex flex-col items-center gap-2.5">
      <p className="empty-state__title">{title}</p>
      <p className="empty-state__subtitle">{subtitle}</p>
    </div>
  </div>

export default EmptyState
