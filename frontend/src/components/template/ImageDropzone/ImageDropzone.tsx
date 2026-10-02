import { type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { useImageDropzone } from './.ts'
import './.css'

type ImageDropzoneProps = {
  accept: string
  multiple?: boolean
  autoFocus?: boolean
  onFiles: (files: File[]) => void
  children: ReactNode
} & Omit<
  ComponentPropsWithoutRef<'div'>,
  'onClick' | 'onDrop' | 'onDragOver' | 'onDragLeave' | 'onPaste' | 'onMouseEnter' | 'onMouseLeave' | 'children'
>

export default function ImageDropzone({
  accept,
  multiple,
  autoFocus,
  onFiles,
  children,
  className,
  ...rest
}: ImageDropzoneProps) {
  const dz = useImageDropzone({ multiple, autoFocus, onFiles })

  return (
    <div
      {...rest}
      ref={dz.containerRef}
      className={className ? `image-dropzone ${className}` : 'image-dropzone'}
      data-dragging={dz.isDragging}
      onClick={dz.openBrowser}
      onDrop={dz.handleDrop}
      onDragOver={dz.handleDragOver}
      onDragLeave={dz.handleDragLeave}
      onPaste={dz.handlePaste}
      onMouseEnter={dz.handleMouseEnter}
      onMouseLeave={dz.handleMouseLeave}
      role='button'
      tabIndex={0}
    >
      {children}
      <input
        ref={dz.inputRef}
        className='image-dropzone__input'
        type='file'
        accept={accept}
        multiple={multiple}
        onChange={dz.handleChange}
      />
    </div>
  )
}
