export function ablThumbnailUrl(book: any): string | null {
  // attachments: context THUMBNAIL = 4 in their proto
  const atts: any[] = book?.attachments ?? [];
  const thumb = atts.find((a) => a?.context === "BOOK_ATTACHMENT_CONTEXT_THUMBNAIL" || a?.context === 4);
  const url = thumb?.file?.url ?? null;
  return typeof url === "string" && url.length ? url : null;
}

export function ablPdfUrl(book: any): string | null {
  // PDF context = 2
  const atts: any[] = book?.attachments ?? [];
  const pdf = atts.find((a) => a?.context === "BOOK_ATTACHMENT_CONTEXT_PDF" || a?.context === 2);
  const url = pdf?.file?.url ?? null;
  return typeof url === "string" && url.length ? url : null;
}

export function ablAuthors(book: any): string {
  const contribs: any[] = book?.contributors ?? [];
  const names = contribs
    .map((c) => c?.contributor?.name || c?.displayName)
    .filter(Boolean);
  return names.length ? names.slice(0, 3).join("، ") : "غير معروف";
}
