import './.css'
import { Link } from 'react-router'
import { motion, type Variants } from 'motion/react'
import type { ClientCardView } from '../../.ts'

const ClientCard = ({ card, variants }: { card: ClientCardView; variants?: Variants }) =>
  <motion.li className="client-card" variants={variants}>
    <Link to={card.href} className="client-card__link flex h-full flex-col gap-4 rounded-lg p-4">
      <div className="flex items-center gap-3">
        <span className="client-card__avatar grid flex-none place-items-center rounded-full" data-kind={card.kind} aria-hidden="true">{card.initial}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="client-card__name truncate">{card.name}</span>
          <span className="client-card__detail truncate">{card.detail}</span>
        </span>
        <span className="material-symbols-outlined client-card__arrow flex-none" aria-hidden="true">arrow_forward</span>
      </div>

      {card.people.length > 0 &&
        <ul className="client-card__people flex flex-wrap gap-1.5" aria-label="Members">
          {card.people.map((person) =>
            <li key={person.key} className="client-card__person flex min-w-0 items-center gap-1.5 rounded-full">
              <span className="client-card__person-initial grid flex-none place-items-center rounded-full" aria-hidden="true">{person.initial}</span>
              <span className="truncate">{person.name}</span>
            </li>
          )}
          {card.extraPeople > 0 && <li className="client-card__person client-card__person-more rounded-full">+{card.extraPeople}</li>}
        </ul>}
    </Link>
  </motion.li>

export default ClientCard
