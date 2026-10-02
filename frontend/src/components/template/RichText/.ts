import { useMemo } from 'react'

const RICH_TEXT_TAGS = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'A', 'UL', 'OL', 'LI', 'SPAN'])
const RICH_TEXT_BLOCK_PARENTS = new Set(['BODY', 'UL', 'OL'])
const RICH_TEXT_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])
const RICH_TEXT_FONT_SIZES = new Set(['12px', '14px', '16px', '20px', '24px', '32px'])

function richTextSafeHref(href: string): string | null {
  try {
    const url = new URL(href, window.location.origin)
    return RICH_TEXT_LINK_PROTOCOLS.has(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

function richTextSafeFontSize(style: string): string | null {
  const fontSize = /font-size:\s*([\d.]+px)/i.exec(style)?.[1]
  return fontSize && RICH_TEXT_FONT_SIZES.has(fontSize) ? fontSize : null
}

function richTextCleanElement(element: Element) {
  const href = element.tagName === 'A' ? richTextSafeHref(element.getAttribute('href') ?? '') : null
  const fontSize = richTextSafeFontSize(element.getAttribute('style') ?? '')

  for (const name of element.getAttributeNames()) element.removeAttribute(name)

  if (fontSize) element.setAttribute('style', `font-size: ${fontSize}`)

  if (href) {
    element.setAttribute('href', href)
    element.setAttribute('rel', 'noopener noreferrer')
    element.setAttribute('target', '_blank')
  }
}

export function richTextSanitize(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html')

  for (const element of parsed.body.querySelectorAll('*')) {
    if (RICH_TEXT_TAGS.has(element.tagName)) richTextCleanElement(element)
    else element.remove()
  }

  // Quill's getSemanticHTML writes every space as &nbsp;, which would stop the text wrapping
  const text = parsed.createTreeWalker(parsed.body, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  while (text.nextNode()) nodes.push(text.currentNode as Text)

  for (const node of nodes) {
    if (!node.data.trim() && RICH_TEXT_BLOCK_PARENTS.has(node.parentElement?.tagName ?? '')) node.remove()
    else node.data = node.data.replaceAll('\u00a0', ' ')
  }

  return parsed.body.innerHTML
}

export type RichTextState = {
  className: string
  markup: { __html: string }
}

export function useRichText(html: string, className?: string): RichTextState {
  return useMemo(
    () => ({
      className: className ? `rich-text ${className}` : 'rich-text',
      markup: { __html: richTextSanitize(html) },
    }),
    [html, className],
  )
}
