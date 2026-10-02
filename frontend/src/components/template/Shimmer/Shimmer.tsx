import './.css'

type ShimmerProps = {
  className?: string
}

const Shimmer = ({ className = '' }: ShimmerProps) => {
  return (
    <div className={`shimmer ${className}`} aria-hidden='true'>
      <span className='shimmer__beam shimmer__beam--horizontal' />
      <span className='shimmer__beam shimmer__beam--vertical' />
      <span className='shimmer__glow' />
    </div>
  )
}

export default Shimmer
