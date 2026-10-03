export function fileDownloadJson(fileName: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  // Safari cancels the download if the URL is revoked in the same task.
  setTimeout(() => URL.revokeObjectURL(url))
}
