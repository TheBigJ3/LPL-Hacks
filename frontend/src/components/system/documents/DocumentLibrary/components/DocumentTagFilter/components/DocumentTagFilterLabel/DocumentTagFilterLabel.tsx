import './.css'
import { useDocumentTagFilterLabel } from './.ts'

const DocumentTagFilterLabel = ({ label, className = '' }: { label: string; className?: string }) => {
  const { containerRef, textRef, ...view } = useDocumentTagFilterLabel(label)

  return <span ref={containerRef} className={`document-tag-filter-label block min-w-0 overflow-hidden ${className}`} data-overflowing={view.overflowing} style={view.style}>
    <span ref={textRef} className="document-tag-filter-label__text block">{label}</span>
  </span>
}

export default DocumentTagFilterLabel
