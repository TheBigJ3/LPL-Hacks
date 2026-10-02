export function inputFocusAtEnd(element: HTMLInputElement | HTMLTextAreaElement | null) {
  if (!element) return

  element.focus({ preventScroll: true })
  element.setSelectionRange(element.value.length, element.value.length)
}
