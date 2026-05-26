/**
 * OCR Processor — future Edge Function stub.
 *
 * Planned flow:
 * 1. Verify JWT + approved profile (same as import-processor)
 * 2. Download image/PDF from squadron-files bucket
 * 3. Run OCR (Tesseract WASM, cloud OCR, or queued worker)
 * 4. Store extracted text in parsed_documents
 * 5. Re-invoke import-processor or return text for review
 *
 * Deploy when OCR provider is selected:
 *   supabase functions deploy ocr-processor
 */
import { cors, json } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  return json({
    ok: false,
    error: "OCR processing is not enabled yet. Upload CSV, TXT, XLSX, or DOCX for automatic extraction.",
    needs_ocr: true,
  }, 501);
});
