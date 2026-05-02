# PFinance ML Engineering Design Spec
## PDF/Bank Statement Parsing Improvements & Smart Capabilities

**Version:** 1.0
**Date:** March 20, 2026
**Author:** ML Engineering
**Status:** Draft — Ready for Review

---

## 1. Executive Summary

PFinance's current ML stack relies heavily on Gemini API calls for structured data extraction from bank statements and receipts. While functional, this approach is expensive (~$0.01–0.03 per statement page), latency-bound by API round-trips, and inconsistent across bank formats. User corrections are tracked but never feed back into model improvement.

This spec proposes six capabilities that shift PFinance toward a **frozen-encoder + lightweight-head** architecture inspired by CalorieCLIP — using pretrained document understanding models as feature extractors with task-specific heads, rather than prompting general-purpose VLMs for structured output. The approach delivers 5–10× cost reduction per inference, 3–5× latency improvement, and enables on-device processing for privacy-sensitive users.

**Key outcomes after 10-week implementation:**

- Bank statement parsing cost drops from ~$0.01/page (Gemini) to ~$0.0005/page (self-hosted encoder + heads)
- Receipt extraction cost drops from ~$0.002–0.003/request (Qwen2-VL-7B) to ~$0.0003/request for common formats
- User corrections actively improve models via weekly LoRA fine-tuning loops
- Three new user-facing capabilities: recurring transaction detection, spending anomaly alerts, and spending forecasts

All new components integrate with the existing Go backend (Connect-RPC), Python ML service (FastAPI on Modal), Firestore, and Firebase Auth/Storage. The existing `ml_feedback_service.go`, LoRA fine-tuning scripts in `ml-service/fine_tuning/`, and `taxeval/` evaluation framework are extended rather than replaced.

---

## 2. Current ML Architecture Assessment

### What works well

**Receipt extraction pipeline.** Qwen2-VL-7B on Modal (A10G GPU) handles diverse receipt formats reliably. Gemini Flash fallback catches edge cases. The two-tier approach provides good coverage at reasonable cost. The Modal infrastructure is proven and stable.

**Category classification.** The merchant fuzzy matching system (Levenshtein distance + LRU cache) handles known merchants cheaply with no API calls. The 10-category taxonomy is well-scoped for personal finance.

**Tax deduction classification.** Gemini → 10 ATO categories works, and the `taxeval/` framework with ground truth scoring provides a solid evaluation foundation to extend to other capabilities.

**Confidence scoring.** Per-field confidence with auto-reject below 0.3 prevents bad data from entering the system silently. This pattern should be replicated across all new capabilities.

**Feedback tracking infrastructure.** `ml_feedback_service.go` already persists user corrections to Firestore. The data is there — it just isn't being used yet.

### What doesn't work well

**Bank statement parsing is the biggest pain point.** The current pipeline (PDF text extraction → Gemini structuring for digital PDFs; Gemini-only for scanned PDFs) has several failure modes. Different banks use different column layouts, date formats, and description conventions. Gemini sometimes hallucinates transactions, misassigns credit/debit signs, or silently drops transactions from the middle of a page. The API cost per statement page (~$0.01–0.03 depending on complexity) doesn't scale as users upload historical statements.

**Smart text parsing is brittle.** The regex + Gemini Flash hybrid breaks on new formats. Each new bank requires manual regex engineering before falling back to Gemini.

**No learning loop.** User corrections are tracked in Firestore but never used to improve models. The LoRA scripts in `ml-service/fine_tuning/` exist but have no production pipeline connecting correction data → training → evaluation → deployment.

**No proactive insights.** PFinance is purely reactive — it parses what users upload but offers no intelligence about spending patterns, recurring charges, or anomalies.

---

## 3. Architecture Overview

### Current architecture (simplified)

```
User Upload (PDF/Image)
        │
        ├─── Receipt Image ──→ Qwen2-VL-7B (Modal A10G) ──→ Structured Receipt JSON
        │                          ↓ (fallback)
        │                      Gemini Flash
        │
        ├─── Bank PDF (digital) ──→ PDF Text Extract ──→ Gemini Structuring ──→ Transactions[]
        │
        └─── Bank PDF (scanned) ──→ Gemini Vision ──→ Transactions[]

Structured Data ──→ Category Classification (fuzzy match + 10-cat)
                ──→ Tax Deduction Classification (Gemini → ATO categories)
                ──→ Confidence Scoring (per-field, reject < 0.3)
                ──→ Firestore persistence

User Corrections ──→ ml_feedback_service.go ──→ Firestore (unused)
```

### Proposed architecture

```
User Upload (PDF/Image)
        │
        ├─── Receipt Image ──→ [NEW] SigLIP Encoder (frozen) ──→ Task Heads ──→ Structured Receipt
        │                          ↓ (confidence < 0.7)
        │                      Qwen2-VL-7B (Modal A10G) ──→ Structured Receipt
        │                          ↓ (fallback)
        │                      Gemini Flash
        │
        ├─── Bank PDF (digital) ──→ PDF Text Extract ──→ [NEW] LayoutLMv3 Encoder (frozen)
        │                                                    ↓
        │                                              Bank-specific LoRA adapter
        │                                                    ↓
        │                                              Extraction Heads ──→ Transactions[]
        │
        └─── Bank PDF (scanned) ──→ Page Render (300 DPI) ──→ [NEW] Donut Encoder (frozen)
                                                                    ↓
                                                              Bank-specific LoRA adapter
                                                                    ↓
                                                              Extraction Heads ──→ Transactions[]

Structured Data ──→ Category Classification (fuzzy match + personalized overrides)
                ──→ Tax Deduction Classification (Gemini → ATO categories)
                ──→ Confidence Scoring (per-field, reject < 0.3)
                ──→ [NEW] Recurring Transaction Detector
                ──→ [NEW] Anomaly Detection (z-score → isolation forest)
                ──→ [NEW] Spending Forecaster (Prophet)
                ──→ Firestore persistence

User Corrections ──→ ml_feedback_service.go ──→ Firestore
                                                    ↓
                                              [NEW] Weekly LoRA fine-tuning pipeline
                                                    ↓
                                              [NEW] Evaluation on held-out corrections
                                                    ↓
                                              [NEW] Auto-deploy if metrics improve
```

---

## 4. Capability 1: Improved Bank Statement Parsing

### Problem statement

Gemini API calls for bank statement structuring cost $0.01–0.03 per page, add 2–5 seconds latency per page, and produce inconsistent results across bank formats. A user uploading 12 months of statements (60+ pages) triggers $0.60–1.80 in API costs and a multi-minute processing time.

### Model selection

**For digital PDFs (extractable text + layout):**

Use **LayoutLMv3** (`microsoft/layoutlmv3-base`, 125M params) as the frozen feature extractor. LayoutLMv3 jointly encodes text tokens, their 2D positions on the page, and optional page images. This is ideal for digital bank statements where we have both extracted text and spatial layout.

- HuggingFace ID: `microsoft/layoutlmv3-base`
- Input: text tokens + bounding boxes from PDF extraction (via `pdfplumber` or `PyMuPDF`)
- Output: 768-dim token embeddings with layout awareness
- Why not LayoutLMv2: v3 adds image patch embeddings and is better pretrained on document understanding

**For scanned PDFs (image-only):**

Use **Donut** (`naver-clova-ix/donut-base`, 200M params) as the encoder. Donut is an OCR-free document understanding model that directly processes page images without requiring a separate OCR step.

- HuggingFace ID: `naver-clova-ix/donut-base`
- Input: page image (rendered at 300 DPI, resized to 1280×960)
- Output: encoder hidden states (1024-dim)
- Why Donut over Gemini Vision: 100× cheaper per page, runs on our existing Modal A10G, deterministic output

**Alternative considered: SigLIP on rendered pages.** SigLIP (`google/siglip-so400m-patch14-384`) would work for both digital and scanned PDFs by rendering all pages to images. Simpler architecture (one model instead of two), but loses the explicit layout information that LayoutLMv3 exploits for digital PDFs. Reserve SigLIP for receipt processing where layout is less structured.

### Extraction heads

Five lightweight heads sit on top of the frozen encoder, each a 2-layer MLP (768 → 256 → output_dim) with ReLU activation:

1. **Transaction boundary detector** — binary token classifier: is this token part of a transaction row? Groups tokens into transaction spans.
2. **Date extractor** — sequence labeler (BIO tags) over transaction span tokens for date fields.
3. **Description extractor** — sequence labeler (BIO tags) for the transaction description/narrative.
4. **Amount extractor** — sequence labeler (BIO tags) for numeric amount fields, plus a regression head for the parsed float value.
5. **Sign classifier** — binary classifier per transaction: credit or debit. Uses contextual features (column position, nearby text like "CR"/"DR", sign conventions).
6. **Balance extractor** — sequence labeler for running balance column (used for validation: sum of transactions should reconcile with balance changes).

Each head is independently trainable. Total additional parameters per head: ~200K. All five heads together: ~1M params on top of the 125M frozen encoder.

### Bank-specific adapters

Australian banks have distinct statement formats. Rather than one model for all banks, use **LoRA adapters** (rank 8, alpha 16) applied to the frozen encoder's attention layers, with one adapter per bank family.

| Bank | Format characteristics | Adapter priority |
|---|---|---|
| CBA (CommBank) | Two-column layout, running balance on right, dates as DD Mon | P0 — highest volume |
| Westpac | Single-column, descriptions wrap to second line, dates as DD/MM/YYYY | P0 |
| NAB | Multi-column with separate debit/credit columns, dates as DD Mon YY | P0 |
| ANZ | Variable format by account type, dates as DD/MM/YYYY | P0 |
| ING | Clean single-column, minimal formatting | P1 |
| Macquarie | PDF with embedded tables, dates as DD-Mon-YYYY | P1 |
| Up Bank | Digital-only, clean export format | P2 |

LoRA adapter size: ~2MB per bank (rank 8 on attention layers of LayoutLMv3-base). All adapters can be loaded into memory simultaneously since they're tiny.

**Bank detection:** Before running extraction, classify the bank format. A simple CNN on the first page header region (crop top 20% of page → ResNet-18 → 7-class softmax). Train on ~50 examples per bank. Alternatively, regex on extracted text for known bank identifiers (ABN numbers, bank names in headers). Start with regex, fall back to CNN.

### Training data strategy

**Silver labels (Phase 1 — bootstrap).** Run the existing Gemini pipeline on a corpus of ~5,000 statement pages across the target banks. Use Gemini's structured output as training labels. Filter for high-confidence outputs (Gemini confidence > 0.8, amount fields parseable as valid floats, dates parseable). Expected yield: ~3,500 usable labeled pages.

**Gold labels (Phase 2 — refinement).** Mine user corrections from Firestore (`ml_feedback_service`). Every correction where a user fixed a transaction amount, date, or description is a gold label. Current estimate: ~500 corrections available. These are disproportionately valuable because they represent the exact failure modes we need to fix.

**Synthetic augmentation (Phase 3 — coverage).** Generate synthetic bank statements using templates:
- Extract real statement templates (headers, footers, column layouts) from each bank
- Generate realistic transaction descriptions from a merchant dictionary + amount distributions
- Render to PDF using `reportlab` or `weasyprint`
- Labels are known because we generated the data
- Target: 2,000 synthetic pages per bank format
- Add realistic noise: slight rotation (±2°), JPEG compression artifacts, scanner darkness variation for scanned PDF augmentation

### Serving architecture

```
Modal A10G GPU (shared with existing Qwen2-VL-7B)
    │
    ├── LayoutLMv3 encoder (loaded once, ~500MB VRAM)
    │       ├── CBA LoRA adapter (~2MB)
    │       ├── Westpac LoRA adapter
    │       ├── NAB LoRA adapter
    │       └── ANZ LoRA adapter
    │
    ├── Donut encoder (for scanned PDFs, ~800MB VRAM)
    │       └── Same bank-specific LoRA adapters
    │
    └── Extraction heads (~4MB total)

FastAPI endpoint: POST /v1/parse-statement
    Input: { pdf_url: str, bank_hint?: str }
    Output: { transactions: [...], confidence: float, bank_detected: str }
    Latency target: < 500ms per page (vs. 2-5s for Gemini)
```

**Fallback chain:** LayoutLMv3/Donut → confidence check → if < 0.5 on any critical field → Gemini structuring (existing pipeline). Log all fallbacks for retraining.

### Validation

Every parsed statement undergoes balance reconciliation: starting balance + sum(credits) - sum(debits) should equal ending balance (if running balance is present). Discrepancies > $0.01 trigger a warning and Gemini fallback.

---

## 5. Capability 2: Receipt Understanding Enhancement

### Problem statement

Qwen2-VL-7B on Modal costs ~$0.002–0.003 per receipt. At scale (1,000+ receipts/day), this is $60–90/month just for receipt processing. Most receipts follow common formats (Woolworths, Coles, Kmart, etc.) that don't need a 7B parameter model.

### Lightweight model design

Use **SigLIP** (`google/siglip-so400m-patch14-384`, 400M params) as a frozen image encoder with task-specific heads.

- HuggingFace ID: `google/siglip-so400m-patch14-384`
- Input: receipt image resized to 384×384
- Output: 1152-dim image embedding (patch tokens + CLS)
- Why SigLIP over CLIP: Better zero-shot performance on document-like images, trained with sigmoid loss (better calibrated confidences)

**Task heads (each a 2-layer MLP):**

1. **Merchant classifier** — top-100 known merchants (softmax) + "other" class. For "other", fall back to OCR + fuzzy matching. ~100K params.
2. **Total amount regressor** — attention over patch tokens → weighted pool → MLP → float. Learns to attend to the "TOTAL" region. ~150K params.
3. **Date extractor** — attention over patches → MLP → (day, month, year) as three regression outputs. ~150K params.
4. **Line item detector** — per-patch binary classifier: is this patch part of a line item region? → crop regions → OCR for item details. ~100K params.

Total head parameters: ~500K. Inference cost on A10G: ~$0.0003/receipt (10× cheaper than Qwen2-VL).

### Confidence-based routing

```python
def process_receipt(image: bytes) -> ReceiptData:
    # Stage 1: Lightweight model
    features = siglip_encoder(image)  # frozen, ~20ms on A10G
    result = extraction_heads(features)  # ~5ms

    if result.confidence >= 0.7:
        return result  # cost: ~$0.0003

    # Stage 2: Full VLM
    result = qwen2_vl_7b(image)  # existing pipeline, ~200ms
    if result.confidence >= 0.5:
        return result  # cost: ~$0.002-0.003

    # Stage 3: Gemini fallback
    return gemini_flash(image)  # cost: ~$0.005
```

Expected routing distribution (based on analysis of receipt types): 70% handled by SigLIP heads, 25% by Qwen2-VL, 5% by Gemini fallback. Blended cost: ~$0.0008/receipt (down from ~$0.0025).

### Training data

- **Existing Qwen2-VL outputs:** Run SigLIP on the same receipt images, train heads to match Qwen2-VL's structured output. ~10,000 receipts from existing pipeline.
- **Top merchant specialization:** For the top 20 Australian merchants (Woolworths, Coles, Bunnings, Kmart, etc.), collect 200+ receipt images each and verify labels manually.
- **Augmentation:** Random rotation (±15°), brightness/contrast jitter, partial occlusion, background variation.

---

## 6. Capability 3: Learning from User Corrections

### Current state

`ml_feedback_service.go` writes corrections to Firestore with this schema (inferred from typical Connect-RPC patterns):

```go
type MLFeedback struct {
    ID              string    `firestore:"id"`
    UserID          string    `firestore:"user_id"`
    TransactionID   string    `firestore:"transaction_id"`
    FieldName       string    `firestore:"field_name"`      // "category", "amount", "date", "description", "merchant"
    OriginalValue   string    `firestore:"original_value"`
    CorrectedValue  string    `firestore:"corrected_value"`
    ModelVersion    string    `firestore:"model_version"`
    CreatedAt       time.Time `firestore:"created_at"`
}
```

### Personalized merchant → category mapping

The simplest, highest-impact improvement. No ML required — pure lookup table with fallback.

```python
# Stored per-user in Firestore: users/{uid}/category_overrides/{merchant_normalized}
class CategoryOverride:
    merchant_normalized: str  # lowercase, stripped of location suffixes
    user_category: str        # user's preferred category
    correction_count: int     # how many times user corrected this
    last_corrected: datetime

def classify_category(merchant: str, user_id: str) -> str:
    normalized = normalize_merchant(merchant)

    # 1. Check user-specific override
    override = get_user_override(user_id, normalized)
    if override and override.correction_count >= 2:  # require 2+ corrections to override
        return override.user_category

    # 2. Check global learned mappings (aggregated across users, privacy-safe)
    global_mapping = get_global_mapping(normalized)
    if global_mapping and global_mapping.confidence > 0.9:
        return global_mapping.category

    # 3. Existing fuzzy matching + 10-category classifier
    return existing_classify(merchant)
```

**Implementation:** Add a `category_overrides` subcollection per user in Firestore. Update on every category correction. Read at classification time with caching (extend existing LRU cache to include per-user overrides).

### Weekly LoRA fine-tuning pipeline

```
┌─────────────────────────────────────────────────────────────┐
│  Weekly Pipeline (Cloud Scheduler → Modal job)              │
│                                                             │
│  1. Export corrections from Firestore (last 7 days)         │
│  2. Filter: keep corrections with clear signal              │
│     - Skip if user corrected back and forth (ambiguous)     │
│     - Skip if correction matches known data entry error     │
│  3. Format as training examples:                            │
│     - Statement parsing: (page_image, corrected_fields)     │
│     - Receipt: (receipt_image, corrected_fields)            │
│     - Category: (merchant, description, correct_category)   │
│  4. Split: 80% train, 20% held-out eval                    │
│  5. LoRA fine-tune (reuse ml-service/fine_tuning/ scripts)  │
│     - Rank 4, alpha 8, learning rate 2e-5, 3 epochs        │
│     - Max 30 min on A10G per training run                   │
│  6. Evaluate on held-out set:                               │
│     - If accuracy >= existing_model_accuracy + 1%: deploy   │
│     - If accuracy < existing_model_accuracy - 2%: alert     │
│     - Otherwise: skip deployment, accumulate more data      │
│  7. Deploy: upload new LoRA weights to Modal volume         │
│     - Hot-swap: new requests use new adapter, no downtime   │
│  8. Log metrics to evaluation dashboard                     │
└─────────────────────────────────────────────────────────────┘
```

**Reuse existing infra:** The LoRA scripts in `ml-service/fine_tuning/` handle the PEFT setup. Extend them to accept a Firestore export as input. The `taxeval/` scorer can be generalized to score extraction accuracy (not just tax categories).

### Active learning

When the model's confidence on a transaction is in the "uncertain" zone (0.3–0.6), surface a gentle prompt to the user:

```
"Is this transaction from 'COLES SUPERMARKETS' correctly categorized as 'Shopping'?"
[Yes] [No, it's Groceries ▾]
```

Prioritize prompts for:
- Transactions from merchants the model hasn't seen before
- Transactions where the lightweight model and the VLM fallback disagree
- Transactions near category decision boundaries

Rate-limit to max 3 prompts per user per week to avoid annoyance.

---

## 7. Capability 4: Recurring Transaction Detection

### Algorithm

Recurring transaction detection operates on the user's full transaction history, not individual statements.

**Step 1: Description clustering.**

Group transactions by normalized description using embedding similarity:

```python
from sentence_transformers import SentenceTransformer

# Use a small, fast embedding model
embedder = SentenceTransformer('all-MiniLM-L6-v2')  # 22M params, ~80MB

def cluster_transactions(transactions: list[Transaction]) -> list[TransactionCluster]:
    descriptions = [t.description for t in transactions]
    embeddings = embedder.encode(descriptions)

    # HDBSCAN for variable-density clustering (some merchants appear weekly, some monthly)
    clusterer = hdbscan.HDBSCAN(min_cluster_size=3, metric='cosine')
    labels = clusterer.fit_predict(embeddings)

    clusters = group_by_label(transactions, labels)
    return clusters
```

**Step 2: Periodicity detection per cluster.**

For each cluster, analyze the intervals between transactions:

```python
def detect_periodicity(cluster: TransactionCluster) -> RecurringPattern | None:
    dates = sorted([t.date for t in cluster.transactions])
    intervals = [(dates[i+1] - dates[i]).days for i in range(len(dates)-1)]

    if len(intervals) < 2:
        return None

    median_interval = np.median(intervals)
    interval_std = np.std(intervals)

    # Classify period
    if 25 <= median_interval <= 35 and interval_std < 5:
        period = "monthly"
    elif 12 <= median_interval <= 16 and interval_std < 3:
        period = "fortnightly"
    elif 5 <= median_interval <= 9 and interval_std < 2:
        period = "weekly"
    elif 85 <= median_interval <= 95 and interval_std < 10:
        period = "quarterly"
    elif 355 <= median_interval <= 375 and interval_std < 15:
        period = "yearly"
    else:
        return None  # irregular

    # Amount consistency
    amounts = [t.amount for t in cluster.transactions]
    amount_cv = np.std(amounts) / np.mean(amounts) if np.mean(amounts) != 0 else float('inf')
    is_fixed_amount = amount_cv < 0.05  # < 5% variation

    return RecurringPattern(
        description=cluster.representative_description,
        period=period,
        median_interval_days=median_interval,
        median_amount=np.median(amounts),
        amount_trend=compute_trend(amounts),  # linear regression slope
        is_fixed_amount=is_fixed_amount,
        next_expected_date=dates[-1] + timedelta(days=median_interval),
        confidence=compute_recurring_confidence(interval_std, amount_cv, len(dates)),
    )
```

**Step 3: Classification.**

Classify each recurring pattern:

| Type | Heuristic |
|---|---|
| Subscription | Fixed amount, monthly/yearly, merchant in known subscription list |
| Salary/income | Credit, fortnightly/monthly, large amount, consistent |
| Rent | Debit, monthly, large fixed amount, description contains "rent"/"transfer" |
| Utility | Debit, monthly/quarterly, variable amount, merchant in utility list |
| Insurance | Debit, monthly/yearly, fixed amount, merchant in insurance list |

**Known merchant lists** are initialized from a curated Australian merchant database and extended by user corrections.

### Output schema

```protobuf
message RecurringTransaction {
  string id = 1;
  string description = 2;
  string category = 3;
  string recurrence_type = 4;  // "subscription", "salary", "rent", "utility", "insurance", "other"
  string period = 5;           // "weekly", "fortnightly", "monthly", "quarterly", "yearly"
  double median_amount = 6;
  double amount_trend = 7;     // positive = increasing over time
  bool is_fixed_amount = 8;
  google.protobuf.Timestamp next_expected_date = 9;
  google.protobuf.Timestamp last_seen_date = 10;
  float confidence = 11;
  bool anomaly_flag = 12;      // true if last occurrence was missed or amount changed significantly
  repeated string transaction_ids = 13;  // references to underlying transactions
}
```

### Compute requirements

This capability runs entirely on CPU. The sentence-transformer embedding is the most expensive step (~5ms per transaction on CPU). For a user with 1,000 transactions, full recomputation takes ~5 seconds. Run incrementally: re-cluster only when new transactions are added, using cached embeddings for existing transactions.

Store embeddings in Firestore as a blob per user (compressed, ~4KB per 1,000 transactions at 384-dim float16).

---

## 8. Capability 5: Spending Anomaly Detection

### MVP: Statistical approach

Start simple. For each user, maintain a rolling spending profile:

```python
@dataclass
class SpendingProfile:
    user_id: str
    # Per-category monthly statistics (rolling 6-month window)
    category_stats: dict[str, CategoryStats]
    # Per-merchant statistics
    merchant_stats: dict[str, MerchantStats]
    last_updated: datetime

@dataclass
class CategoryStats:
    monthly_mean: float
    monthly_std: float
    monthly_median: float
    transaction_count_mean: float
    largest_single_transaction: float

def detect_anomalies(
    transaction: Transaction,
    profile: SpendingProfile
) -> list[Anomaly]:
    anomalies = []

    cat_stats = profile.category_stats.get(transaction.category)
    if cat_stats is None:
        # New category for this user — flag if amount > $100
        if transaction.amount > 100:
            anomalies.append(Anomaly(
                type="new_category",
                severity="info",
                message=f"First transaction in '{transaction.category}': ${transaction.amount:.2f}"
            ))
        return anomalies

    # Single transaction anomaly: amount >> user's typical for this category
    if cat_stats.monthly_std > 0:
        z_score = (transaction.amount - cat_stats.monthly_mean / cat_stats.transaction_count_mean) / (cat_stats.monthly_std / cat_stats.transaction_count_mean)
        if z_score > 3.0:
            anomalies.append(Anomaly(
                type="large_transaction",
                severity="warning",
                message=f"${transaction.amount:.2f} at {transaction.merchant} is unusually large for {transaction.category}"
            ))

    # Monthly spending anomaly: check at end of month
    current_month_total = get_current_month_spending(transaction.user_id, transaction.category)
    if cat_stats.monthly_std > 0:
        monthly_z = (current_month_total - cat_stats.monthly_mean) / cat_stats.monthly_std
        if monthly_z > 2.0:
            anomalies.append(Anomaly(
                type="high_monthly_spending",
                severity="warning",
                message=f"{transaction.category} spending this month (${current_month_total:.2f}) is above your usual range"
            ))

    return anomalies
```

### Upgrade path: Isolation Forest

Once we have 6+ months of per-user data, upgrade anomaly detection to an Isolation Forest for users with sufficient history:

```python
from sklearn.ensemble import IsolationForest

def build_user_anomaly_model(user_id: str) -> IsolationForest:
    """Train per-user anomaly model on monthly spending vectors."""
    monthly_vectors = get_monthly_spending_vectors(user_id)
    # Each vector: [groceries, dining, transport, shopping, ..., total] (11 features)

    if len(monthly_vectors) < 6:
        return None  # not enough data, use z-score approach

    model = IsolationForest(
        n_estimators=100,
        contamination=0.1,  # expect ~10% of months to be anomalous
        random_state=42
    )
    model.fit(monthly_vectors)
    return model
```

The Isolation Forest captures multi-category correlations (e.g., high dining + low groceries might be normal during holidays but anomalous otherwise) that z-scores miss.

### Alert delivery

Anomalies trigger Firebase Cloud Messaging (FCM) push notifications. Severity levels:

- **Info:** New category, slightly above average — no push, show in app feed
- **Warning:** >2σ transaction or monthly overshoot — push notification
- **Alert:** >3σ or recurring payment missed — push notification with emphasis

Rate-limit: max 2 push notifications per user per day for anomalies. Batch lower-severity items into a daily digest.

---

## 9. Capability 6: Spending Forecasting

### Model selection

Personal finance data is low-frequency (monthly aggregates) with strong seasonality (holiday spending, quarterly bills) and simple trends. **Prophet** (Meta's time-series library) is the right tool — it handles seasonality, holidays, and missing data gracefully without requiring deep learning.

```python
from prophet import Prophet
import pandas as pd

def forecast_category_spending(
    user_id: str,
    category: str,
    months_ahead: int = 3
) -> list[SpendingForecast]:
    # Get historical monthly spending
    history = get_monthly_spending(user_id, category)  # list of (month, amount)

    if len(history) < 4:
        # Not enough data for Prophet — use simple average
        avg = np.mean([h.amount for h in history])
        return [SpendingForecast(month=m, predicted=avg, lower=avg*0.7, upper=avg*1.3)
                for m in next_n_months(months_ahead)]

    df = pd.DataFrame({
        'ds': [h.month for h in history],
        'y': [h.amount for h in history]
    })

    model = Prophet(
        yearly_seasonality=len(history) >= 12,  # only if we have a year of data
        weekly_seasonality=False,  # monthly data, no weekly pattern
        daily_seasonality=False,
        changepoint_prior_scale=0.05,  # conservative — personal spending doesn't change rapidly
    )

    # Add known recurring transactions as regressors
    recurring = get_recurring_transactions(user_id, category)
    for r in recurring:
        df[f'recurring_{r.id}'] = [r.median_amount if is_expected(r, month) else 0
                                    for month in df['ds']]
        model.add_regressor(f'recurring_{r.id}')

    model.fit(df)

    future = model.make_future_dataframe(periods=months_ahead, freq='MS')
    # Fill recurring regressors for future dates
    for r in recurring:
        future[f'recurring_{r.id}'] = [r.median_amount if is_expected(r, month) else 0
                                        for month in future['ds']]

    forecast = model.predict(future)

    return [
        SpendingForecast(
            month=row['ds'],
            predicted=max(0, row['yhat']),  # spending can't be negative
            lower=max(0, row['yhat_lower']),
            upper=row['yhat_upper'],
        )
        for _, row in forecast.tail(months_ahead).iterrows()
    ]
```

### Budget overshoot warnings

Combine forecasts with user-set budgets (if any):

```python
def check_budget_overshoot(user_id: str) -> list[BudgetWarning]:
    budgets = get_user_budgets(user_id)  # user-set monthly budgets per category
    warnings = []

    for category, budget in budgets.items():
        current_month_actual = get_current_month_spending(user_id, category)
        days_elapsed = datetime.now().day
        days_in_month = calendar.monthrange(datetime.now().year, datetime.now().month)[1]

        # Linear projection for current month
        projected = current_month_actual * (days_in_month / days_elapsed) if days_elapsed > 0 else 0

        # Prophet forecast for next months
        forecasts = forecast_category_spending(user_id, category, months_ahead=2)

        if projected > budget * 1.1:  # >10% over budget
            warnings.append(BudgetWarning(
                category=category,
                budget=budget,
                projected_this_month=projected,
                actual_so_far=current_month_actual,
                severity="warning" if projected < budget * 1.3 else "alert",
            ))

    return warnings
```

### Compute requirements

Prophet fitting is CPU-bound and takes ~1–2 seconds per category per user. With 10 categories, a full forecast refresh takes ~15 seconds. Run as a nightly batch job (Cloud Scheduler → Modal CPU container). Cache forecasts in Firestore; invalidate when new transactions are added.

---

## 10. Infrastructure Updates

### Modal deployment changes

**Current Modal setup:**
- 1× A10G GPU container running Qwen2-VL-7B (receipt extraction)
- Scales 0→1→N based on request volume

**Proposed Modal setup:**

| Container | GPU | Models loaded | Estimated VRAM |
|---|---|---|---|
| `ml-primary` | A10G (24GB) | Qwen2-VL-7B (14GB) + SigLIP-400M (1.5GB) + extraction heads (10MB) | ~16GB |
| `ml-document` | A10G (24GB) | LayoutLMv3-base (0.5GB) + Donut-base (0.8GB) + all bank LoRA adapters (14MB) + extraction heads (4MB) | ~2GB |
| `ml-training` | A10G (24GB) | Weekly LoRA fine-tuning jobs | On-demand, 0 idle |
| `ml-cpu` | None (CPU) | sentence-transformers, Prophet, scikit-learn | CPU-only |

**Cost impact:**

| Component | Current monthly cost | Proposed monthly cost | Savings |
|---|---|---|---|
| Receipt processing (5K/month) | $12.50 (Qwen2-VL) | $4.00 (70% SigLIP, 25% Qwen2-VL, 5% Gemini) | $8.50 |
| Statement parsing (2K pages/month) | $30.00 (Gemini API) | $1.50 (LayoutLMv3/Donut) + $3.00 (Gemini fallback ~10%) | $25.50 |
| Weekly LoRA training | $0 | $4.00 (1hr A10G × 4 weeks) | -$4.00 |
| CPU containers (forecasting, anomaly) | $0 | $5.00 (nightly batch, low-tier CPU) | -$5.00 |
| **Total** | **$42.50** | **$17.50** | **$25.00 (59% reduction)** |

Note: Gemini API costs are based on current Gemini 1.5 Flash pricing. Modal GPU costs assume ~$1.10/hr for A10G with idle scaling.

### Model serving with FastAPI

Extend the existing FastAPI service with new endpoints:

```python
# New endpoints to add to the existing ML service

@app.post("/v1/parse-statement")
async def parse_statement(request: StatementRequest) -> StatementResponse:
    """Bank statement parsing with LayoutLMv3/Donut + bank-specific LoRA."""

@app.post("/v1/parse-receipt-lightweight")
async def parse_receipt_lightweight(request: ReceiptRequest) -> ReceiptResponse:
    """SigLIP + task heads for common receipts. Returns confidence for routing."""

@app.post("/v1/detect-recurring")
async def detect_recurring(request: RecurringRequest) -> RecurringResponse:
    """Recurring transaction detection for a user's transaction history."""

@app.post("/v1/detect-anomalies")
async def detect_anomalies(request: AnomalyRequest) -> AnomalyResponse:
    """Real-time anomaly detection for a single new transaction."""

@app.post("/v1/forecast-spending")
async def forecast_spending(request: ForecastRequest) -> ForecastResponse:
    """Per-category spending forecast for next 1-3 months."""

@app.post("/v1/trigger-training")
async def trigger_training(request: TrainingRequest) -> TrainingResponse:
    """Manually trigger LoRA fine-tuning (also runs on weekly schedule)."""
```

### Evaluation pipeline extension

Extend `taxeval/` into a general `mleval/` framework:

```
mleval/
├── evaluators/
│   ├── tax_evaluator.py          # existing taxeval/ logic, migrated
│   ├── statement_evaluator.py    # new: statement parsing accuracy
│   ├── receipt_evaluator.py      # new: receipt extraction accuracy
│   ├── category_evaluator.py     # new: category classification accuracy
│   ├── recurring_evaluator.py    # new: recurring detection precision/recall
│   └── anomaly_evaluator.py      # new: anomaly detection precision/recall
├── datasets/
│   ├── tax_ground_truth.json     # existing
│   ├── statement_ground_truth/   # new: per-bank ground truth
│   ├── receipt_ground_truth/     # new: labeled receipt images
│   └── recurring_ground_truth/   # new: manually labeled recurring sets
├── scorer.py                     # generalized from taxeval/scorer
├── cost_tracker.py               # existing, extended with new model costs
└── run_eval.py                   # unified eval runner
```

---

## 11. Training Data Strategy

### Data sources by capability

| Capability | Silver labels (automated) | Gold labels (human-verified) | Synthetic |
|---|---|---|---|
| Statement parsing | Gemini extractions (~5K pages) | User corrections (~500) | Template-based generation (~14K pages) |
| Receipt extraction | Qwen2-VL outputs (~10K receipts) | Manual verification of top merchants (~4K) | Augmented images (~20K) |
| Category classification | Current classifier outputs (~50K) | User corrections (~2K) | N/A |
| Recurring detection | Heuristic labels on existing data (~1K users) | Manual verification (~200 users) | Synthetic transaction histories (~5K) |
| Anomaly detection | N/A (unsupervised) | User feedback on alerts (collect post-launch) | Injected anomalies into real profiles (~1K) |

### Data pipeline

```
Firestore (corrections, transactions)
    │
    ├──→ Nightly export to Cloud Storage (GCS bucket: pfinance-ml-data/)
    │       ├── corrections/YYYY-MM-DD/
    │       ├── transactions/YYYY-MM-DD/  (anonymized: no merchant names, just embeddings)
    │       └── statements/YYYY-MM-DD/    (PDF images, linked to Gemini labels)
    │
    ├──→ Weekly aggregation job (Modal CPU)
    │       ├── Merge new corrections with existing training set
    │       ├── Deduplicate and validate
    │       ├── Split: 80% train, 10% val, 10% test (stratified by bank/merchant)
    │       └── Write to GCS: pfinance-ml-data/training-sets/v{N}/
    │
    └──→ Weekly LoRA training job (Modal A10G)
            ├── Pull training set from GCS
            ├── Fine-tune adapters
            ├── Evaluate on test split
            └── Deploy if improved
```

### Privacy considerations for training data

- Transaction descriptions and amounts are PII. All training data stays within the user's Firestore context and GCS bucket under the same Firebase project.
- Aggregated models (global category mappings, merchant lists) are trained on anonymized data: merchant name → category, with no user identifiers or amounts.
- Per-user LoRA adapters are never shared across users.
- Synthetic data generation uses only statistical distributions, not actual user data.

---

## 12. Evaluation Framework

### Per-capability metrics

| Capability | Primary metric | Secondary metrics | Target |
|---|---|---|---|
| Statement parsing | Transaction-level F1 (correct date + amount + sign) | Field-level accuracy, balance reconciliation rate | F1 > 0.95 |
| Receipt extraction | Field-level accuracy (merchant, total, date) | Routing efficiency (% handled by lightweight model) | Accuracy > 0.92, routing > 70% |
| Category classification | Top-1 accuracy | Per-category precision/recall, user override rate | Accuracy > 0.88 |
| Recurring detection | Precision and recall of recurring groups | Period classification accuracy | Precision > 0.90, Recall > 0.85 |
| Anomaly detection | Precision at user-confirmed anomalies | False positive rate (user dismissals) | Precision > 0.70 |
| Spending forecast | MAPE (mean absolute percentage error) | Budget overshoot prediction accuracy | MAPE < 20% |

### Evaluation cadence

- **On every model update (weekly):** Run statement_evaluator, receipt_evaluator, category_evaluator on held-out test sets. Gate deployment on metric thresholds.
- **Monthly:** Full evaluation sweep across all capabilities. Compare against Gemini baseline. Report cost savings.
- **Quarterly:** Refresh ground truth datasets. Re-evaluate synthetic data quality. Audit for data drift.

### A/B testing infrastructure

For new capabilities (recurring detection, anomaly alerts, forecasting), use Firebase Remote Config to roll out to percentage-based user cohorts:

- 10% initial rollout → monitor engagement and dismiss rates → 50% → 100%
- Track: notification tap rate, correction rate on ML outputs, user retention correlation

---

## 13. Implementation Roadmap

### Phase 1: Foundation (Weeks 1–3)

**Week 1: Data pipeline and evaluation framework**
- Migrate `taxeval/` to generalized `mleval/` framework
- Set up nightly Firestore → GCS export for corrections and transaction data
- Build statement ground truth dataset: manually label 200 statement pages (50 per big-4 bank)
- Set up CI pipeline: every PR to `ml-service/` runs `mleval/` on test sets

**Week 2: Personalized category overrides**
- Implement `category_overrides` Firestore subcollection
- Update `ml_feedback_service.go` to write overrides on category corrections
- Update category classification in Python ML service to check overrides first
- Deploy — immediate improvement with zero ML work

**Week 3: LayoutLMv3 statement parsing (digital PDFs)**
- Set up LayoutLMv3 encoder on Modal (new `ml-document` container)
- Implement extraction heads (5 heads, ~1M params total)
- Train on silver labels (Gemini extractions) for CBA and Westpac formats
- Evaluate against Gemini baseline on held-out statement pages

### Phase 2: Core ML (Weeks 4–6)

**Week 4: Bank-specific LoRA adapters + remaining banks**
- Train LoRA adapters for NAB, ANZ (P0 banks)
- Implement bank detection (regex-first, CNN fallback)
- Add balance reconciliation validation
- Deploy statement parsing with Gemini fallback for low-confidence results

**Week 5: Donut for scanned PDFs**
- Set up Donut encoder, share extraction heads (retrain for image input)
- Train on scanned statement images (render digital statements + add scanner noise for augmentation)
- Integrate into the same `POST /v1/parse-statement` endpoint with auto-detection of digital vs. scanned

**Week 6: SigLIP receipt enhancement**
- Set up SigLIP encoder on `ml-primary` container (co-located with Qwen2-VL)
- Train merchant classifier and amount/date extraction heads
- Implement confidence-based routing (SigLIP → Qwen2-VL → Gemini)
- Deploy with 10% traffic routing to new pipeline, compare cost and accuracy

### Phase 3: Smart Capabilities (Weeks 7–9)

**Week 7: Weekly LoRA fine-tuning pipeline**
- Build the correction export → training data formatter
- Integrate with existing `ml-service/fine_tuning/` LoRA scripts
- Set up weekly Cloud Scheduler trigger → Modal training job
- Implement auto-evaluation gate: deploy only if metrics improve
- First production fine-tuning run using accumulated corrections

**Week 8: Recurring transaction detection**
- Implement sentence-transformer embedding + HDBSCAN clustering
- Build periodicity detection and classification logic
- Create `RecurringTransaction` protobuf and Connect-RPC endpoint
- Backfill for existing users (batch job)
- Deploy API; frontend integration is separate workstream

**Week 9: Anomaly detection + spending forecasting**
- Implement z-score anomaly detection (MVP)
- Set up Prophet forecasting with nightly batch job on Modal CPU
- Implement FCM push notifications for anomaly alerts
- Deploy anomaly detection; forecasting API available for frontend

### Phase 4: Polish (Week 10)

**Week 10: Integration, testing, and optimization**
- End-to-end integration testing across all new capabilities
- Load testing on Modal: verify latency targets under concurrent requests
- Cost monitoring: validate projected savings against actuals
- Active learning prompt system (identify uncertain transactions, rate-limit prompts)
- Documentation: update API docs, runbooks for the training pipeline, incident response for model failures
- Train ING and Macquarie LoRA adapters (P1 banks) if time permits

### Dependencies and risks

| Risk | Mitigation |
|---|---|
| LayoutLMv3 extraction heads don't reach 0.95 F1 on real statements | Keep Gemini fallback permanently; route only high-confidence results through new pipeline |
| Insufficient user corrections for meaningful LoRA fine-tuning | Accelerate active learning prompts; generate more synthetic training data |
| Modal A10G VRAM insufficient for all models simultaneously | Split into two containers (already planned); or use A100 40GB if needed (~$1.60/hr) |
| Prophet forecasts are poor with < 6 months of user history | Graceful degradation: show simple averages with wider confidence intervals |
| User complaints about anomaly alert false positives | Start with high threshold (3σ), conservative notification rate (max 2/day) |

---

## 14. Cost Analysis

### Per-inference cost comparison

| Operation | Current (Gemini/Qwen2-VL) | Proposed (lightweight) | Reduction |
|---|---|---|---|
| Statement page (digital) | $0.010–0.030 | $0.0005 | 95–98% |
| Statement page (scanned) | $0.015–0.040 | $0.0008 | 95–98% |
| Receipt (common format) | $0.002–0.003 | $0.0003 | 85–90% |
| Receipt (complex, VLM needed) | $0.002–0.003 | $0.002–0.003 | 0% (same path) |
| Category classification | $0.0001 (local) | $0.0001 (local + override lookup) | 0% |
| Recurring detection | N/A | $0.001/user (CPU, amortized) | New capability |
| Anomaly detection | N/A | $0.0001/transaction (CPU) | New capability |
| Spending forecast | N/A | $0.005/user/month (Prophet CPU) | New capability |

### Monthly projection (at current scale)

| Line item | Current | Proposed | Delta |
|---|---|---|---|
| Gemini API (statements) | $30.00 | $3.00 (fallback only) | -$27.00 |
| Gemini API (tax, other) | $8.00 | $8.00 (unchanged) | $0.00 |
| Modal GPU (receipt) | $12.50 | $9.00 (less Qwen2-VL usage) | -$3.50 |
| Modal GPU (statement) | $0.00 | $5.00 (new container) | +$5.00 |
| Modal GPU (training) | $0.00 | $4.00 (weekly jobs) | +$4.00 |
| Modal CPU (forecast, etc.) | $0.00 | $5.00 | +$5.00 |
| **Total ML infra** | **$50.50** | **$34.00** | **-$16.50 (33%)** |

At 10× current scale (growth target), the savings multiply: Gemini API costs scale linearly with volume, while Modal GPU costs scale sub-linearly (better batching, container utilization).

| Scale | Current cost projection | Proposed cost projection | Savings |
|---|---|---|---|
| 1× (current) | $50.50/month | $34.00/month | $16.50 |
| 5× | $215.00/month | $85.00/month | $130.00 |
| 10× | $420.00/month | $130.00/month | $290.00 |

---

## 15. Privacy Considerations

### On-device processing

For privacy-sensitive users, offer on-device statement and receipt processing using quantized models:

**Statement parsing:**
- LayoutLMv3-base quantized to INT8 via ONNX Runtime: ~65MB model size, runs on modern phones (4GB+ RAM)
- Extraction heads: ~1MB quantized
- Bank LoRA adapters: ~500KB each (INT8)
- Total on-device package: ~70MB
- Latency: ~2 seconds per page on mid-range phone CPU (Snapdragon 7-series equivalent)

**Receipt processing:**
- SigLIP-400M is too large for mobile. Use `google/siglip-base-patch16-224` (86M params) → INT8 quantized: ~45MB
- Extraction heads retrained for smaller encoder: ~200KB
- Total on-device package: ~46MB
- Latency: ~500ms per receipt on phone

**Delivery:** Package as ONNX models, load via ONNX Runtime Mobile in the Flutter app. Download models on first opt-in, cache locally.

### Data retention

| Data type | Retention | Location |
|---|---|---|
| Uploaded PDFs/images | 30 days after processing, then deleted from Firebase Storage | Firebase Storage (user's project) |
| Extracted transaction data | Indefinite (user's financial data) | Firestore |
| User corrections | Indefinite (needed for training) | Firestore |
| ML model inputs/outputs | 7 days (for debugging) | Cloud Storage, auto-delete lifecycle |
| Training datasets | 90 days (rolling window) | Cloud Storage |
| LoRA adapters | Until superseded by next version | Modal volume + Cloud Storage backup |

### Privacy-preserving aggregation

Global model improvements (e.g., merchant → category mappings learned from all users) use differential privacy:
- Add Laplace noise to category counts per merchant before aggregation
- Require minimum 10 unique users per merchant before creating a global mapping
- Never include transaction amounts, dates, or user identifiers in global training data

---

## Appendix A: Model Card Summary

| Model | HuggingFace ID | Params | Use | Serving |
|---|---|---|---|---|
| LayoutLMv3-base | `microsoft/layoutlmv3-base` | 125M | Digital statement encoding | Modal A10G (frozen) |
| Donut-base | `naver-clova-ix/donut-base` | 200M | Scanned statement encoding | Modal A10G (frozen) |
| SigLIP-SO400M | `google/siglip-so400m-patch14-384` | 400M | Receipt image encoding | Modal A10G (frozen) |
| SigLIP-base (mobile) | `google/siglip-base-patch16-224` | 86M | On-device receipt processing | ONNX Runtime Mobile |
| Qwen2-VL-7B | `Qwen/Qwen2-VL-7B-Instruct` | 7.6B | Complex receipt fallback | Modal A10G (existing) |
| all-MiniLM-L6-v2 | `sentence-transformers/all-MiniLM-L6-v2` | 22M | Transaction description embedding | Modal CPU / on-device |
| HDBSCAN | scikit-learn-contrib/hdbscan | N/A | Transaction clustering | CPU |
| Prophet | facebook/prophet | N/A | Spending forecasting | Modal CPU |
| IsolationForest | scikit-learn | N/A | Anomaly detection (phase 2) | CPU |

## Appendix B: Key Dependencies

```
# Python ML service additions to requirements.txt
transformers>=4.40.0
peft>=0.10.0          # LoRA adapters
sentence-transformers>=2.7.0
hdbscan>=0.8.33
prophet>=1.1.5
scikit-learn>=1.4.0
onnxruntime>=1.17.0   # for quantization and on-device export
pdfplumber>=0.11.0    # PDF text + bbox extraction
Pillow>=10.0.0
```

## Appendix C: Go Backend Changes

New Connect-RPC service methods to expose ML capabilities:

```protobuf
service MLService {
  // Existing
  rpc ExtractReceipt(ExtractReceiptRequest) returns (ExtractReceiptResponse);
  rpc ClassifyCategory(ClassifyCategoryRequest) returns (ClassifyCategoryResponse);
  rpc ClassifyTaxDeduction(ClassifyTaxDeductionRequest) returns (ClassifyTaxDeductionResponse);

  // New
  rpc ParseBankStatement(ParseBankStatementRequest) returns (ParseBankStatementResponse);
  rpc GetRecurringTransactions(GetRecurringTransactionsRequest) returns (GetRecurringTransactionsResponse);
  rpc GetSpendingAnomalies(GetSpendingAnomaliesRequest) returns (GetSpendingAnomaliesResponse);
  rpc GetSpendingForecast(GetSpendingForecastRequest) returns (GetSpendingForecastResponse);
  rpc TriggerModelTraining(TriggerModelTrainingRequest) returns (TriggerModelTrainingResponse);
}
```

The Go backend acts as a thin proxy to the Python ML service, handling auth (Firebase Auth), rate limiting, and Firestore persistence of results. All ML inference stays in Python/Modal.
