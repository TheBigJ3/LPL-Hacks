import './.css'
import { Link } from 'react-router'
import type { DocumentCardView } from '../../../../.ts'

const DocumentCard = ({ document }: { document: DocumentCardView }) =>
  <Link to={document.href} className="document-card flex flex-col gap-6">
    <span className="document-card__stack relative block" aria-hidden="true">
      <span className="document-card__page document-card__page-back"><img src={document.thumbnail} alt="" /></span>
      <span className="document-card__page document-card__page-middle"><img src={document.thumbnail} alt="" /></span>
      <span className="document-card__page document-card__page-front"><img src={document.thumbnail} alt="" /></span>
    </span>
    <span className="flex min-w-0 flex-col gap-3">
      <span className="document-card__name truncate">{document.name}</span>
      <span className="document-card__date">{document.date}</span>
    </span>
  </Link>

export default DocumentCard
