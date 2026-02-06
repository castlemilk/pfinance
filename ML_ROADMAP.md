# ML Extraction Pipeline Roadmap

This document outlines future enhancements for the PFinance ML document extraction system.

## Current State (v1.0)

- **Self-hosted ML**: Qwen2-VL-7B on Modal serverless GPU
- **Gemini API**: Alternative extraction via Google's Gemini 1.5 Flash
- **Smart Text Entry**: Natural language parsing with debounced AI
- **Supported Documents**: Receipts (images), Bank Statements (PDF)
- **Categories**: 10 expense categories with merchant normalization

---

## Phase 1: Accuracy & Reliability (Next 2-4 weeks)

### 1.1 Evaluation Framework
- [ ] Build comprehensive test suite with 200+ labeled documents
- [ ] Automated accuracy benchmarks on PR (CI integration)
- [ ] Track metrics: F1 score, category accuracy, amount accuracy, date accuracy
- [ ] Dashboard showing extraction quality over time

### 1.2 Confidence Thresholds
- [ ] Add confidence-based UI warnings ("Low confidence - please verify")
- [ ] Auto-reject extractions below threshold (e.g., <0.5)
- [ ] Show per-field confidence (amount: 95%, date: 70%, category: 85%)

### 1.3 Error Recovery
- [ ] Better error messages for failed extractions
- [ ] Retry logic with exponential backoff for ML service
- [ ] Fallback chain: Self-hosted → Gemini → Manual entry prompt

### 1.4 Multi-page PDF Support
- [ ] Handle PDFs with 10+ pages efficiently
- [ ] Progress indicator for large documents
- [ ] Page-by-page extraction with streaming results

---

## Phase 2: User Experience (4-8 weeks)

### 2.1 Bulk Import UI
- [ ] Review screen for bank statement imports (show all transactions)
- [ ] Checkbox selection for which transactions to import
- [ ] Bulk category override
- [ ] Duplicate detection with visual diff

### 2.2 Learning from Corrections
- [ ] Track user corrections (changed category, fixed amount)
- [ ] Store correction patterns per user
- [ ] Apply learned patterns to future extractions
- [ ] "Remember this merchant" feature

### 2.3 Receipt Gallery
- [ ] Store original receipt images with expenses
- [ ] View receipt alongside expense details
- [ ] Search expenses by receipt content

### 2.4 Camera Improvements
- [ ] Auto-capture when receipt is detected and stable
- [ ] Edge detection / crop suggestion
- [ ] Multi-shot mode for long receipts
- [ ] Flash/torch control

---

## Phase 3: Model Improvements (8-12 weeks)

### 3.1 Fine-tuned Model
- [ ] Collect anonymized extraction data (with user consent)
- [ ] Fine-tune Qwen2-VL on financial documents
- [ ] A/B test fine-tuned vs base model
- [ ] Target: 95%+ accuracy on receipts

### 3.2 Specialized Models
- [ ] Receipt-specific model (smaller, faster)
- [ ] Bank statement model (table extraction focus)
- [ ] Invoice model (line items, tax, totals)

### 3.3 Local/On-Device Extraction
- [ ] Investigate smaller models (Qwen2-VL-2B, PaddleOCR)
- [ ] WebGPU/WASM inference for basic OCR
- [ ] Hybrid: local pre-processing + cloud refinement

### 3.4 Multi-Currency Support
- [ ] Detect currency from document (USD, EUR, AUD, etc.)
- [ ] Auto-convert to user's preferred currency
- [ ] Historical exchange rates for past transactions

---

## Phase 4: Advanced Features (12+ weeks)

### 4.1 Recurring Transaction Detection
- [ ] Identify subscriptions from bank statements
- [ ] "Netflix appears monthly - mark as recurring?"
- [ ] Subscription tracker dashboard

### 4.2 Merchant Intelligence
- [ ] Auto-fetch merchant logos
- [ ] Merchant category database (MCC codes)
- [ ] Location-based merchant suggestions

### 4.3 Smart Categorization Rules
- [ ] User-defined rules ("Transactions from X → Category Y")
- [ ] Time-based rules ("Weekend food = Entertainment")
- [ ] Amount-based rules (">$100 groceries = bulk shopping")

### 4.4 Anomaly Detection
- [ ] Flag unusual transactions ("$500 at coffee shop?")
- [ ] Spending pattern analysis
- [ ] Duplicate transaction warning

### 4.5 Voice Entry
- [ ] "Add expense: twenty dollars for lunch"
- [ ] Speech-to-text → Smart text parser
- [ ] Hands-free receipt logging

---

## Phase 5: Infrastructure & Scale (Ongoing)

### 5.1 Cost Optimization
- [ ] Batch processing for bulk imports
- [ ] Caching for repeated merchant lookups
- [ ] Model quantization (INT8/INT4) for faster inference
- [ ] Cold start optimization on Modal

### 5.2 Production Deployment
- [ ] Move ML service to Cloud Run GPU (L4) for lower latency
- [ ] Multi-region deployment
- [ ] Rate limiting per user
- [ ] Usage analytics and billing hooks

### 5.3 Privacy & Security
- [ ] End-to-end encryption for document uploads
- [ ] Auto-delete processed images after extraction
- [ ] GDPR compliance (data retention policies)
- [ ] Audit logging for all extractions

### 5.4 Monitoring & Observability
- [ ] Extraction latency metrics (p50, p95, p99)
- [ ] Error rate dashboards
- [ ] Model performance drift detection
- [ ] Alerting for service degradation

---

## Quick Wins (Can Do This Week)

1. **Add extraction method to expense metadata** - Track which method was used
2. **Improve Gemini prompt** - Add more category examples
3. **Add "Scan another" button** - Quick follow-up scans
4. **Show compression stats in UI** - "Compressed 4MB → 350KB"
5. **Better loading skeletons** - Shimmer effects during processing

---

## Technical Debt

- [ ] Remove legacy `/api/process-document` frontend route (now using backend)
- [ ] Consolidate category mapping (frontend + backend have duplicates)
- [ ] Add proper error types for extraction failures
- [ ] Unit tests for extraction service
- [ ] Integration tests for full extraction flow

---

## Metrics to Track

| Metric | Current | Target |
|--------|---------|--------|
| Receipt extraction accuracy | ~85% | 95% |
| Bank statement extraction accuracy | ~90% | 98% |
| Average extraction time (receipt) | ~3s | <1.5s |
| Average extraction time (PDF, 5 pages) | ~8s | <4s |
| User correction rate | Unknown | <10% |
| Self-hosted vs Gemini usage | Unknown | Track |

---

## Resources

- [Qwen2-VL Model Card](https://huggingface.co/Qwen/Qwen2-VL-7B-Instruct)
- [Modal GPU Documentation](https://modal.com/docs/guide/gpu)
- [Gemini API Documentation](https://ai.google.dev/docs)
- [PaddleOCR (alternative)](https://github.com/PaddlePaddle/PaddleOCR)
