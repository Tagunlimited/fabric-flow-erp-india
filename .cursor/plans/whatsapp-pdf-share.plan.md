# WhatsApp: PDF + summary (updated)

## Copy change (user request)

Remove from the WhatsApp PDF message all of the following:

- The line about the PDF being downloaded to the device
- "Please attach it to this chat..."
- The entire block **How to attach** (numbered steps with the attachment emoji)

**Implementation:** In [`QuotationDetailPage.tsx`](src/pages/accounts/QuotationDetailPage.tsx), edit `WhatsAppSharing.generatePDFMessage` so the message stays a short professional summary only, for example:

- Company header, greeting, quotation number, amount, closing/thanks  
- No manual-attach instructions (those were only relevant for the old download + `wa.me` fallback)

When implementing **Web Share** with `files` + `text`, use the **same shortened plain-text body** for `navigator.share({ text })` so users never see the removed lines in either path.

**Toast:** Adjust the success string after fallback (e.g. avoid "instructions" if the message no longer contains them).

---

## Technical approach (unchanged)

- **`wa.me` cannot attach files** — use **Web Share API** with `files: [pdf]` + `text` when `navigator.canShare` allows it.
- **Fallback:** download PDF + open `wa.me` with the **same shortened text** (no attach steps).

Refactor: `buildQuotationPdfBlob()` → `downloadQuotationPdf()` uses blob + anchor; share handler tries `navigator.share` then fallback.

---

## Todos

- [ ] Extract `buildQuotationPdfBlob` + keep download behavior
- [ ] Shorten `generatePDFMessage` (remove download/attach/how-to lines); add plain-text helper for share
- [ ] `handleSharePDFToWhatsApp`: Web Share with file + text; fallback with shortened message
- [ ] Update success toasts; test mobile + desktop fallback
