import type { CSSProperties } from 'react'
import { useUserAvatar } from './.ts'
import './.css'

type UserAvatarProps = {
  src: string | null
  firstName: string
  lastName: string
  size?: number
}

export default function UserAvatar({ src, firstName, lastName, size = 36 }: UserAvatarProps) {
  const avatar = useUserAvatar(src, firstName, lastName)

  return (
    <span className='user-avatar' style={{ '--user-avatar-size': `${size}px` } as CSSProperties} aria-hidden>
      {avatar.showImage ? (
        <img className='user-avatar__image' src={src ?? undefined} alt='' referrerPolicy='no-referrer' onError={avatar.hideImage} />
      ) : (
        avatar.initials
      )}
    </span>
  )
}
