# OXR bank-statement pilot

Status: **backend integration only; disabled by default**. No OXR service is deployed or enabled in production, and no live-model accuracy benchmark has been completed.

## Purpose

[SoMark OXR](https://github.com/SoMarkAI/OXR) provides document layout recognition and Markdown/HTML table output. It does not return PFinance transactions directly. The pilot therefore uses:

```text
statement PDF
  → existing native-text extraction when suitable
  → self-hosted OXR recognition when native extraction is insufficient
  → Gemini text-only transaction structuring
  → existing normalization, metadata, confidence, and import handling
```

If OXR recognition or Gemini text structuring fails, the service falls back to the existing direct Gemini document pipeline and adds a fallback warning. Request cancellation stops the pipeline without starting the fallback.

## Scope and privacy

- OXR is attempted only for bank statements inside the Gemini extraction stage. Receipts and other document types do not call OXR.
- Existing Qwen/LayoutLM self-hosted extraction is unchanged. OXR is not a replacement for `StatementParserClient`; their API contracts differ.
- The existing self-hosted-to-Gemini fallback chain is unchanged. The OXR hybrid is **not fully self-hosted**: recognized statement text is sent to Gemini for semantic structuring.
- Only Markdown recognition output is requested. Gemini receives that text, not the original inline document bytes, unless the direct-document fallback runs.
- The free hosted OXR API is not configured or used. Do not upload real customer statements to it.
- OXR response bodies and `data.error` details are not copied into errors because upstream errors may echo document content. API keys are sent in the multipart `api_key` field, never in the URL.

## Configuration

OXR remains disabled unless `OXR_SERVICE_URL` is explicitly set. `GEMINI_API_KEY` is also required for transaction structuring.

```bash
OXR_SERVICE_URL=https://oxr.internal.example
OXR_API_KEY=<key-for-the-self-hosted-endpoint>
OXR_HTTP_TIMEOUT_SECONDS=300  # optional; defaults to 300
GEMINI_API_KEY=<existing-key>
```

Use a private, authenticated OXR deployment. The inspected open-source sync route requires an `api_key` form field but does not itself verify it, so a public unprotected deployment is not sufficient. The default request timeout is five minutes; cold model startup can require a larger deployment-specific timeout.

Limits and failure handling:

- OXR response envelope: 16 MiB maximum.
- Recognized Markdown: 1 MiB maximum; larger output falls back rather than being truncated.
- HTTP status, envelope `code`, `data.error`, JSON validity, and non-empty Markdown are all validated. OXR can report errors such as codes `1133` and `1137` with HTTP 200.
- Gemini `MAX_TOKENS` responses are treated as truncation and trigger the direct-document fallback. The text stage uses the PDF-derived output-token budget when available.
- Successful results use OXR page metadata, total OXR+Gemini latency, and model provenance `SoMark OXR + gemini-2.0-flash`. `BankStatementResult` retains provenance through its processing-note warning.

## Serving expectations

The upstream project documents Linux, an NVIDIA BF16-capable GPU, a CUDA 13-compatible driver, Python 3.12, and separate recognition, layout-analysis, and API services. It lists 24 GB VRAM as a minimum for low-concurrency testing and 48 GB or more as recommended. Treat an A10G 24 GB deployment as a constrained experiment, not an assumed production configuration.

The sync route performs work inline. Load testing must include cold start, multi-page latency, concurrent requests, GPU memory pressure, and backend timeout behavior.

## Validation

The Go tests use synthetic fixtures and local HTTP test servers only:

```bash
cd backend
go test ./internal/extraction -run 'OXR|ParseBankStatement|ExtractFromTextWithGemini' -count=1
go test ./internal/extraction -count=1
```

Covered behavior includes the multipart contract, Markdown-only requests, response-envelope errors under HTTP 200, malformed/empty/oversized responses, sensitive-error redaction, text-only Gemini structuring, statement metadata, output-token budgets, receipt exclusion, direct-Gemini fallback, and `ParseBankStatement` conversion.

## Before enabling a real deployment

1. Run a real self-hosted OXR instance and verify its exact response against the mocked contract.
2. Benchmark synthetic native and scanned statement PDFs against the existing Qwen and Gemini paths. Measure transaction precision/recall, debit/credit separation, date and amount accuracy, page ordering, balance reconciliation, latency, and cost.
3. Include dense and long statements that exercise Markdown size, Gemini input limits, output truncation, and direct-document chunking. Add semantic text chunking if benchmarks show that fallback is insufficient.
4. Test failed startups, cold containers, timeouts, malformed responses, and concurrent uploads without using production customer documents.
5. Review the current [OXR license](https://github.com/SoMarkAI/OXR/blob/main/LICENSE). It includes terms beyond Apache 2.0, including commercial-use thresholds and prominent SoMark OXR attribution for online services. Add the required product UI or publicly accessible documentation attribution and complete a license review **before** production enablement.
6. Obtain separate approval for infrastructure, backend deployment, environment configuration, and production rollout.
