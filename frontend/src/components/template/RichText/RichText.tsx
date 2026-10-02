import type { ComponentPropsWithRef } from 'react'
import { useRichText } from './.ts'
import './.css'

type RichTextProps = Omit<ComponentPropsWithRef<'div'>, 'children' | 'dangerouslySetInnerHTML'> & {
  html: string
}

export default function RichText({ html, className, ...rest }: RichTextProps) {
  const richText = useRichText(html, className)

  return <div {...rest} className={richText.className} dangerouslySetInnerHTML={richText.markup} />
}
