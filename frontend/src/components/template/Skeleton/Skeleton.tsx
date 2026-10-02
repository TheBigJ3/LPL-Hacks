import './.css'

type SkeletonProps = {
  className?: string
}

const Skeleton = ({ className = '' }: SkeletonProps) => (
  <div className={`skeleton ${className}`} />
)

export default Skeleton
