import './.css'
import type { InsightSegment } from '../../.ts'

const InsightMessageSegments = ({ segments, onCite }: { segments: InsightSegment[]; onCite: (sourceId: string) => void }) => <>
  {segments.map((segment, index) => segment.kind === 'bold'
    ? <strong key={index}>{segment.text}</strong>
    : segment.kind === 'italic'
      ? <em key={index}>{segment.text}</em>
      : segment.kind === 'code'
        ? <code key={index} className="insight-message-segments__code rounded px-1">{segment.text}</code>
        : segment.kind === 'citation'
      ? <button key={index} type="button" className="insight-message-segments__cite rounded-full" data-resolved={segment.number !== null} disabled={segment.number === null} onClick={() => onCite(segment.sourceId)} aria-label={`Source: ${segment.label}`} title={segment.label}>
        {segment.number ?? '·'}
      </button>
      : <span key={index}>{segment.text}</span>)}
</>

export default InsightMessageSegments
