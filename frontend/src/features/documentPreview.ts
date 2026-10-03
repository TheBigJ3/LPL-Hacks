import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import PDF_WORKER_URL from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = PDF_WORKER_URL

const DOCUMENT_PREVIEW_PDF_WIDTH = 1600

export type DocumentPreviewPage = {
  url: string
  aspect: number
}

export async function documentPreviewRender(file: File): Promise<DocumentPreviewPage[] | null> {
  try {
    return file.type === 'application/pdf' ? await documentPreviewRenderPdf(file) : [await documentPreviewRenderImage(file)]
  } catch {
    // Most browsers can't decode TIFF; callers fall back to rebuilding the page from OCR text.
    return null
  }
}

export function documentPreviewRelease(pages: DocumentPreviewPage[]) {
  for (const page of pages) URL.revokeObjectURL(page.url)
}

async function documentPreviewRenderImage(file: File): Promise<DocumentPreviewPage> {
  const bitmap = await createImageBitmap(file)
  const aspect = bitmap.height / bitmap.width
  bitmap.close()
  return { url: URL.createObjectURL(file), aspect }
}

async function documentPreviewRenderPdf(file: File): Promise<DocumentPreviewPage[]> {
  const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  try {
    const pages: DocumentPreviewPage[] = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: DOCUMENT_PREVIEW_PDF_WIDTH / page.getViewport({ scale: 1 }).width })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      await page.render({ canvas, viewport }).promise
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error(`Couldn't rasterize PDF page ${pageNumber}`)
      pages.push({ url: URL.createObjectURL(blob), aspect: viewport.height / viewport.width })
    }
    return pages
  } finally {
    await pdf.destroy()
  }
}
