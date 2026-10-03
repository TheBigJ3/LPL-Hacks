const DOCUMENT_LIBRARY_SKELETON_TITLE_WIDTHS = ['44%', '22%', '30%']

export function useDocumentLibrarySkeleton(columns: number) {
  return {
    sections: DOCUMENT_LIBRARY_SKELETON_TITLE_WIDTHS.map((titleWidth, index) => ({ key: index, titleWidth })),
    cards: Array.from({ length: columns }, (_, index) => index),
  }
}
