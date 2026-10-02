import { useConfetti } from './.ts'
import './.css'

type Props = {
  tint: string
}

const Confetti = ({ tint }: Props) => {
  const confetti = useConfetti(tint)

  return <canvas ref={confetti.ref} className='confetti' aria-hidden='true' />
}

export default Confetti
