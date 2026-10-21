# Invoice PDF CMaps

pdf-cmaps.json contains the unmodified UniJIS-UCS2-HW-H, UniJIS-UCS2-H,
and Adobe-Japan1-UCS2 binary CMaps, base64 encoded from pdfjs-dist@1.10.100/cmaps
(the PDF.js version used by pdf-parse@1.1.1). The Adobe redistribution license
is retained in pdf-cmaps.LICENSE.

These maps decode the non-embedded Japanese fonts in Yamato Web invoices.
The static JSON require ensures Vercel bundles them with the function.

Run: node --test tests/yamato.test.cjs

Set YAMATO_PDF_PATH to the local October 2026 invoice to also test the real
356-page PDF through the production extractor. The private PDF is not committed.
