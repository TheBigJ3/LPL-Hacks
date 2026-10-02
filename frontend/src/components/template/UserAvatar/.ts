import { useState } from 'react'

export type UserAvatarState = {
  showImage: boolean
  initials: string
  hideImage: () => void
}

export function userAvatarInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
}

export function useUserAvatar(src: string | null, firstName: string, lastName: string): UserAvatarState {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  return {
    showImage: src !== null && src !== failedSrc,
    initials: userAvatarInitials(firstName, lastName),
    hideImage: () => setFailedSrc(src),
  }
}
