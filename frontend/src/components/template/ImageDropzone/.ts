import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent } from 'react'

type UseImageDropzoneParams = {
  multiple?: boolean
  autoFocus?: boolean
  onFiles: (files: File[]) => void
}

export function useImageDropzone({ multiple, autoFocus, onFiles }: UseImageDropzoneParams) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    if (autoFocus) containerRef.current?.focus()
  }, [autoFocus])

  function openBrowser() {
    inputRef.current?.click()
  }

  function handleMouseEnter() {
    containerRef.current?.focus()
  }

  function handleMouseLeave() {
    containerRef.current?.blur()
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) onFiles(multiple ? Array.from(e.target.files) : [e.target.files[0]])
    e.target.value = ''
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files?.length) {
      const files = Array.from(e.dataTransfer.files)
      onFiles(multiple ? files : [files[0]])
    }
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
  }

  function handlePaste(e: ClipboardEvent<HTMLDivElement>) {
    const files = Array.from(e.clipboardData.files)
    if (files.length) {
      e.preventDefault()
      onFiles(multiple ? files : [files[0]])
    }
  }

  return {
    inputRef,
    containerRef,
    isDragging,
    openBrowser,
    handleMouseEnter,
    handleMouseLeave,
    handleChange,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handlePaste,
  }
}
