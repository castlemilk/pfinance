# **State of the Art in Document Data Extraction 2026: Architectures, Benchmarks, and High-Throughput Engineering**

## **1\. Introduction: The Vision-Language Paradigm Shift**

The domain of document data extraction has undergone a fundamental metamorphosis by early 2026\. For decades, the industry relied on fragmented Optical Character Recognition (OCR) pipelines that treated text recognition and layout analysis as separate, often conflicting, objectives. These traditional systems—exemplified by early iterations of Tesseract or template-based legacy tools—operated on a "detect-then-read" basis. They would isolate bounding boxes of text and transcribe them, leaving the complex semantic reconstruction of tables, columns, and reading order to brittle post-processing heuristics.1 This legacy approach proved fundamentally inadequate for the "superquick" and accurate parsing of complex financial documents like bank statements and receipts, where the spatial relationship between a dollar amount and a date is as critical as the characters themselves.

In the current landscape of 2026, we observe the ascendancy of **Vision-Language Models (VLMs)** and **End-to-End (E2E) architectures**. These models do not merely "read" text; they "perceive" documents. By integrating visual encoders directly with Large Language Model (LLM) decoders, modern systems process a document image as a unified semantic entity. This shift has been driven by the need to solve the "raster-scan" problem—where traditional models read strictly left-to-right, top-to-bottom—and replace it with human-like visual attention that can navigate the non-linear layouts of multi-column bank statements or crumpled receipts.3

The imperative for high-speed processing—parsing millions of pages per day—has further bifurcated the research landscape. On one side, we see massive, reasoning-heavy models like **GPT-5** and **Gemini 3 Pro**, which offer unparalleled accuracy but suffer from high latency (16-33 seconds per page).5 On the other, a new class of highly optimized, efficiency-focused models such as **DeepSeek-OCR 2**, **Mistral OCR 3**, and **PaddleOCR-VL-1.5** has emerged. These architectures prioritize **Contexts Optical Compression** and **Visual Causal Flow**, enabling throughputs exceeding 200,000 pages per day on a single GPU node while maintaining state-of-the-art (SOTA) accuracy on complex benchmarks.6

This report provides an exhaustive technical analysis of the 2026 ecosystem. It evaluates the most effective models for financial document extraction, dissects the hardware and software infrastructure required for high-throughput ("superquick") pipelines, and analyzes the specific challenges of parsing multi-page tables and distorted receipts.

## **2\. Theoretical Framework: Innovations Driving 2026 Models**

To understand why 2026 models vastly outperform their predecessors, one must examine the core architectural innovations that define this generation: **Visual Causal Flow** and **Contexts Optical Compression**.

### **2.1 Contexts Optical Compression: Breaking the Token Bottleneck**

The primary bottleneck in "superquick" extraction is the cost of autoregressive generation. In a traditional LLM approach, a dense bank statement might be tokenized into 2,000+ text tokens. Generating these tokens sequentially is computationally expensive and slow.

Research from DeepSeek and BentoML highlights the breakthrough of **Contexts Optical Compression**. Instead of translating visual information into a verbose stream of text tokens, 2026 architectures compress visual data into dense "visual tokens." A single visual token can represent the semantic equivalent of multiple words, encoding not just the characters but their typeface, weight, and spatial position.8

* **Mechanism:** The **DeepEncoder V2** architecture (used in DeepSeek-OCR 2\) utilizes a convolutional compressor to reduce high-resolution inputs (e.g., 1024x1024 pixels) into a compact set of 256 to 1,120 visual tokens.  
* **Implication:** This compression allows the model to process a page with 10x-20x fewer operational steps than a text-only model. For a high-throughput pipeline, this translates to an order-of-magnitude reduction in latency. A page that previously took 5 seconds to process can now be handled in sub-second timeframes, enabling the parsing of massive backlogs of financial records.3

### **2.2 Visual Causal Flow: Solving the "Stitching" Problem**

Financial documents are rarely linear. A bank statement may have a sidebar with summary data, a main transaction table, and footer disclosures. Traditional "raster-scan" models (reading top-left to bottom-right) often fail here, merging the sidebar text into the main table rows and corrupting the data.

The innovation of **Visual Causal Flow**, introduced in **DeepSeek-OCR 2**, addresses this by decoupling the visual scanning order from the pixel grid.

* **Architecture:** The model employs **learnable queries** (causal flow tokens) that interact with the visual tokens via a customized attention mask.  
* **Function:** Before the decoder generates a single character, the encoder's flow tokens "plan" the reading path based on semantic logic. The model recognizes that the "Transaction" column header dictates the flow of the subsequent rows, and that the sidebar is a separate semantic block.  
* **Result:** This allows the model to "stitch" multi-column data correctly, preventing the common error where debit and credit columns are merged. This capability is critical for bank statement parsing, where a single column shift can invalidate an entire financial audit.3

## **3\. Comparative Analysis of Leading Models**

The market in 2026 offers a diverse array of tools. For the specific requirement of parsing bank statements and receipts "superquickly," three models stand out as the most effective: **DeepSeek-OCR 2**, **Mistral OCR 3**, and **PaddleOCR-VL-1.5**.

### **3.1 DeepSeek-OCR 2: The High-Throughput Specialist**

**DeepSeek-OCR 2** represents the pinnacle of open-source efficiency in early 2026\. It is specifically engineered for scenarios where throughput (pages per second) is the primary KPI.

#### **Architectural Specifications**

* **Encoder:** DeepEncoder V2 (based on Qwen2-0.5B), replacing the older CLIP encoder. This shift enables the "Visual Causal Flow" described above.3  
* **Decoder:** A 3B parameter Mixture-of-Experts (MoE) model. Crucially, it activates only \~570M parameters during inference. This "sparse activation" means that while the model has the knowledge capacity of a 3B model, it runs with the speed and computational cost of a 0.6B model.8  
* **Resolution:** Supports dynamic resolution strategies (up to 1280x1280), essential for reading fine print on bank statements.8

#### **Throughput and Performance**

The performance metrics for DeepSeek-OCR 2 are exceptional for high-volume workflows:

* **Throughput:** Validated benchmarks on a single NVIDIA A100 GPU demonstrate a processing rate of **\~200,000 pages per day** (approx. 2.3 pages per second) in a batch inference setting.  
* **Speed:** In streaming mode, it achieves \~2,500 tokens/second.6  
* **Accuracy:** It scores **91.09%** on the **OmniDocBench v1.5**, a 3.73% improvement over its predecessor, primarily due to better handling of complex reading orders.11

#### **Best Fit**

DeepSeek-OCR 2 is the optimal choice for organizations building internal, private-cloud parsing pipelines where data volume is massive (e.g., historical back-filling of transaction logs) and data privacy prevents the use of public APIs.

### **3.2 Mistral OCR 3: The Enterprise Standard**

For users prioritizing ease of integration and immediate accuracy over raw infrastructure control, **Mistral OCR 3** (released late 2025\) has established itself as the commercial standard.

#### **"Doc-as-Prompt" Philosophy**

Mistral’s core differentiator is its **semantic reconstruction** capability. It does not output a JSON of bounding boxes; it outputs a clean, structured Markdown representation of the document.

* **Tables:** It reconstructs complex, nested tables into HTML/Markdown tables with high fidelity, handling row-spans and col-spans that confuse simpler models.  
* **Multilingual:** It supports 99%+ accuracy across 25+ languages, making it ideal for international receipts.13

#### **Comparative Benchmarks**

* **Table Accuracy:** Mistral OCR 3 achieves **96.6% accuracy** on table extraction tasks, significantly outperforming legacy providers like Amazon Textract (84.8%) and even some larger VLMs like GPT-4o in specific table-dense benchmarks.5  
* **Handwriting:** Internal tests show **88.9% accuracy** on handwriting, positioning it as a strong contender for receipt parsing where human-written tips or totals are common.5  
* **Cost Efficiency:** At **$1 per 1,000 pages** (via batch API), it undercuts traditional competitors like Google Document AI ($20-$30/1k pages) by a massive margin, democratizing high-volume extraction.13

### **3.3 PaddleOCR-VL-1.5: The "In-the-Wild" Robustness King**

While DeepSeek and Mistral excel at digital or clean scanned documents, **PaddleOCR-VL-1.5** is the superior choice for "in-the-wild" capture—specifically, receipts photographed by mobile devices.

#### **Irregular Box Localization**

Receipts are rarely flat. They are crumpled, held in hands, or photographed at oblique angles. Standard OCR models assume rectangular text boxes, which fail when lines of text curve due to paper deformation.

* **Innovation:** PaddleOCR-VL-1.5 introduces **irregular box localization**, using polygonal segmentation to map text lines that warp or curve. This allows it to "unroll" the text digitally, maintaining line integrity even on distorted receipts.15

#### **Efficiency**

* **Size:** With only **0.9B parameters**, it is lightweight enough to be deployed on edge servers or even optimized for mobile devices, reducing the latency of data transmission.15  
* **Accuracy:** Surprisingly, despite its small size, it holds the SOTA on **OmniDocBench v1.5** with **94.5%** accuracy, beating many larger models due to its specialized training on distorted datasets.17

### **3.4 The Frontier Models: GPT-5 and Gemini 3 Pro**

For cases requiring intense **reasoning** rather than just extraction—such as determining if a specific expense on a receipt violates a complex company policy—the frontier models **GPT-5** and **Google Gemini 3 Pro** remain relevant.

* **Handwriting SOTA:** GPT-5 holds the absolute SOTA for complex cursive handwriting (95% accuracy), surpassing Mistral and DeepSeek.5  
* **Latency Trade-off:** The cost of this intelligence is speed. These models operate at **16-33 seconds per page**, making them unsuitable for the "superquick" requirement unless used selectively as a second-pass auditor for flagged documents.5

### **3.5 Summary of Model Capabilities**

| Model | Type | OmniDocBench v1.5 | Throughput (Pages/Day) | Table Accuracy | Primary Strength |
| :---- | :---- | :---- | :---- | :---- | :---- |
| **DeepSeek-OCR 2** | Open Source (3B MoE) | 91.09% | \~200,000 (A100) | High | High Throughput / Reading Order |
| **Mistral OCR 3** | Commercial API | N/A (74% win rate) | \~2,800,000\* | 96.6% | Semantic Markdown / Cost ($1/1k) |
| **PaddleOCR-VL-1.5** | Open Source (0.9B) | **94.5%** | High (Edge capable) | SOTA | Distorted Receipts / Irregular Layouts |
| **Reducto** | Hybrid API | N/A | Scalable Cloud | **90.2%** | Complex Table Stitching / Hybrid Vision |
| **GPT-5** | Frontier VLM | N/A | Low (\< 5,000) | Moderate | Reasoning / Cursive Handwriting |

\*Table 1: Comparative analysis of leading document extraction models in 2026\. *Throughput for Mistral is estimated based on reported 2,000 pages/minute rate.*.5

## **4\. Engineering "Superquick" Pipelines: Hardware & Software**

To achieve "superquick" parsing—defined here as minimizing latency for single requests and maximizing throughput for batches—the choice of model must be paired with the correct infrastructure.

### **4.1 Inference Engines: vLLM vs. TensorRT-LLM**

The software engine running the model is as critical as the model itself. In 2026, **vLLM** has emerged as the superior choice for VLM inference, particularly for open-source models like DeepSeek-OCR and Qwen2.5-VL.

* **PagedAttention & Continuous Batching:** Traditional engines process batches in lockstep; if one document takes longer to generate, the entire batch waits. vLLM utilizes **PagedAttention** to manage key-value (KV) cache memory non-contiguously. This allows for **continuous batching**, where completed requests are ejected and new ones inserted immediately.20  
* **Performance Delta:** Benchmarks indicate that vLLM outperforms NVIDIA's TensorRT-LLM by **30-80%** in throughput for variable-length workloads (common in document parsing where text density varies wildly). DeepSeek-OCR 2 officially provides optimization scripts for vLLM (run\_dpsk\_ocr2\_pdf.py) to maximize this concurrency.21

### **4.2 Hardware Selection: NVIDIA H200 vs. B200**

The hardware layer defines the physical limits of speed.

* **NVIDIA H200:** This GPU is the "workhorse" for 2026 inference. With **141GB of HBM3e memory** and **4.8 TB/s bandwidth**, it excels at holding the large KV caches required for high-resolution document processing. For pure inference workloads, the H200 is often more cost-efficient than the B200.23  
* **NVIDIA B200 (Blackwell):** While the B200 offers higher theoretical stats (192GB memory, 8 TB/s bandwidth), its primary advantage lies in *training* massive models. For parsing documents, the H200 provides sufficient bandwidth to saturate the token generation speed of models like DeepSeek-OCR 2\.  
* **Recommendation:** A cluster of **H200s** running **vLLM** provides the optimal price/performance ratio for a high-volume bank statement parsing pipeline.23

### **4.3 Deployment Architectures**

To integrate these components into a cohesive system, a **Microservices Architecture** is recommended:

1. **Ingestion & Pre-processing Node:**  
   * *Function:* Intake PDFs/Images. Perform hash-based deduplication.  
   * *Tool:* Lightweight CPU-based vision models (e.g., MobileNet) for orientation detection and deskewing. This offloads trivial tasks from the expensive GPUs.  
2. **Inference Cluster (GPU Layer):**  
   * *Function:* Runs the heavy VLM (DeepSeek or Paddle).  
   * *Configuration:* Use **vLLM** with ocr\_batch endpoints. Configure "Gundam Mode" (dynamic tiling) for DeepSeek to handle high-resolution bank statements.8  
3. **Agentic Logic Node:**  
   * *Function:* Post-processing. Stitches multi-page JSONs, validates sums, and normalizes dates.  
   * *Tool:* Small, fast LLMs (e.g., Llama-3-8B or Mistral Small) running on CPU or lower-tier GPUs.25

## **5\. Domain-Specific Challenges and Solutions**

### **5.1 Parsing Bank Statements: The "Stitching" & Schema Challenge**

Bank statements are the "final boss" of document extraction due to their tabular complexity and multi-page nature.

#### **The "Stitching" Problem**

A single transaction table often spans multiple pages. Page 1 has headers; Page 2 does not. A naive model processing Page 2 sees a list of numbers without context, often misclassifying a "Balance" column as a "Credit" column.

* **Solution: Agentic Workflow Patterns.** The SOTA approach in 2026 involves "schema carry-over." An **Agentic Workflow** (using tools like **Unstract** or **Reducto**) extracts the schema (headers) from Page 1 and passes it as a "system prompt" or context to the processing of Page 2\. The agent "stitches" the rows together, ensuring the Closing Balance of Page 1 matches the Opening Balance of Page 2\.26  
* **Hybrid Approaches:** **Reducto** uses a hybrid approach combining computer vision (to detect the visual grid) with VLMs (to interpret the text). This outperforms pure VLMs which can "hallucinate" row alignment in dense grids. Reducto achieves **90.2%** on the **RD-TableBench**, making it the leader for complex table extraction.19

#### **Schema Drift**

Banks frequently change their statement layouts. Rule-based parsers break immediately. VLMs like DeepSeek and Mistral are **resilient to schema drift** because they rely on semantic understanding ("This looks like a date") rather than coordinate-based rules ("Date is at x=100, y=200"). This reduces maintenance overhead to near zero.1

### **5.2 Parsing Receipts: Distortion and Degradation**

Receipts present physical challenges: thermal paper fades, users crumble them, and lighting is often poor.

#### **Handling Distortion**

* **Solution:** As noted, **PaddleOCR-VL-1.5** is the preferred model here due to **irregular box localization**. It maps text to a mesh rather than a grid, effectively "flattening" the crumpled receipt in vector space before recognition.15

#### **Handling Low Quality/Fading**

* **Solution:** High-resolution vision encoders are critical. **Qwen2.5-VL** and **DeepSeek-OCR 2** support native resolution processing (up to 4K), allowing them to distinguish faint thermal print from background noise better than models that downsample images to 224x224 or 512x512.11  
* **Agentic Correction:** For faded text, a "reasoning" layer is vital. If a receipt shows "Burger: $10, Fries: $5, Total: $15", but the "1" in "15" is faded, a standard OCR might read "$5". An agentic loop calculates the sum of line items ($10+$5) and corrects the total to "$15" based on mathematical logic, boosting system reliability.30

## **6\. Benchmarking the Landscape: Data-Driven Insights**

In 2026, the benchmark for success is no longer just "Character Error Rate" (CER) but structural fidelity.

### **6.1 OmniDocBench v1.5**

This benchmark measures performance across diverse document types (financial, academic, newspapers).

* **Leader:** **PaddleOCR-VL-1.5 (94.5%)**.  
* **Runner Up:** **DeepSeek-OCR 2 (91.09%)**.  
* **Insight:** Paddle's dominance here suggests that for a general-purpose pipeline that must handle *anything* a user uploads, it is the most robust starting point.11

### **6.2 RD-TableBench**

This benchmark is specific to complex tables (merged cells, implicit headers).

* **Leader:** **Reducto (90.2%)**.  
* **Comparison:** Commercial giants like Azure Document Intelligence and AWS Textract trail by significant margins (up to 20%) in highly complex scenarios.  
* **Insight:** For bank statements specifically, general benchmarks like OmniDocBench are less relevant than RD-TableBench. If table accuracy is the priority, Reducto (or a custom pipeline mimicking its hybrid approach) is superior.19

### **6.3 DeltOCR (Handwriting)**

For receipts with handwritten tips:

* **Leader:** **GPT-5 (95%)**.  
* **Alternatives:** **Gemini 3 Pro**, **Mistral OCR 3 (88.9%)**.  
* **Insight:** While GPT-5 is the most accurate, Mistral provides a "good enough" accuracy for most receipt use cases at 1/10th the cost and 10x the speed.5

## **7\. Commercial vs. Open Source: A Strategic Decision**

The decision between building (Open Source) vs. buying (Commercial API) hinges on three factors: Cost, Privacy, and Engineering Resource.

### **7.1 Cost Analysis (Per 1,000 Pages)**

* **Mistral OCR 3:** **$1.00** (Batch API).  
* **DeepSeek-OCR 2 (Self-Hosted):** **\~$0.50 \- $0.80**.  
  * *Calculation:* Running an H200 instance costs \~$2-$4/hour. At 200,000 pages/day throughput, the per-page cost is minuscule, but this requires high volume to amortize the GPU cost. For low volumes, the idle GPU time makes self-hosting more expensive than API pay-per-use.13  
* **Legacy Providers:** Google/AWS charge **$20-$50**, making them economically unviable for high-volume 2026 applications.14

### **7.2 Privacy and Compliance**

For banking applications, data sovereignty is often non-negotiable.

* **Open Source:** **DeepSeek-OCR 2** and **PaddleOCR-VL-1.5** can be deployed entirely **air-gapped** within a private VPC. No data leaves the bank's infrastructure. This is the only viable path for strict GDPR/CCPA or internal banking compliance.2  
* **Commercial:** Mistral offers "selective self-hosting" for sensitive data, but this usually comes with a higher enterprise contract cost.13

## **8\. Future Outlook: Emerging Technologies**

### **8.1 Visual Forgetting and Infinite Context**

A limitation of current VLMs is context window size. DeepSeek is pioneering **Visual Forgetting**, a mechanism inspired by biological memory. It allows the model to "blur" or compress the visual tokens of previous pages while retaining high-level semantic context (e.g., "This is a statement from Chase Bank"). This could allow for the ingestion of 100+ page loan agreements in a single pass without quadratic computational cost.8

### **8.2 Agentic Feedback Loops**

The next leap in accuracy will come from **Agentic Feedback Loops**. Instead of a linear extraction, the system will employ a "Critic" agent.

1. **Extract:** VLM parses the receipt.  
2. **Critique:** Logic agent checks: "Is the tax 10% of the subtotal?"  
3. **Refine:** If the check fails, the Critic prompts the VLM: "Look at the tax line again. Is it an 8 or a 0?" This iterative process mimics human double-checking and can drive accuracy from 95% to near 100%.32

## **9\. Conclusion and Strategic Recommendations**

To meet the requirement of parsing bank statements and receipts "superquickly" and effectively in 2026, a monolithic approach is insufficient. The data dictates a specialized, hybrid strategy.

### **9.1 Recommended Architecture for High-Volume Parsing**

1. **The "Superquick" Engine:** Deploy **DeepSeek-OCR 2** on **vLLM** using **NVIDIA H200** GPUs.  
   * *Reasoning:* It offers the highest throughput (200k pages/day) and uses Visual Causal Flow to correctly interpret the reading order of complex bank statements. It is the most efficient model for raw text/structure extraction.  
2. **The "In-the-Wild" Specialist:** Route receipt images to a lightweight **PaddleOCR-VL-1.5** instance.  
   * *Reasoning:* Its irregular box localization handles crumpled/skewed receipts better than any other model, and its small size allows for cost-effective scaling.  
3. **The "Brain":** Implement an **Agentic Stitching Layer** (using Unstract or custom logic).  
   * *Reasoning:* Raw extraction is not enough for multi-page bank statements. An agent is required to carry the table schema across pages and validate mathematical consistency (Credits \- Debits \= Balance).  
4. **The Commercial Alternative:** For teams lacking deep ML engineering resources, use **Mistral OCR 3**.  
   * *Reasoning:* At $1/1k pages, it is cost-competitive with self-hosting and offers SOTA table extraction out-of-the-box, outputting clean Markdown that is ready for immediate downstream use.

By leveraging these specific tools—DeepSeek for speed/logic, Paddle for distortion, and Agents for continuity—you can construct a parsing pipeline that is not only "superquick" but robust enough for the exacting standards of financial data processing.

#### **Works cited**

1. Best Data Extraction Software Tools October 2025 \- Extend AI, accessed on February 4, 2026, [https://www.extend.ai/resources/best-data-extraction-software](https://www.extend.ai/resources/best-data-extraction-software)  
2. 8 Top Open-Source OCR Models Compared: A Complete Guide \- Modal, accessed on February 4, 2026, [https://modal.com/blog/8-top-open-source-ocr-models-compared](https://modal.com/blog/8-top-open-source-ocr-models-compared)  
3. DeepSeek-OCR 2: Visual Causal Flow \- arXiv, accessed on February 4, 2026, [https://arxiv.org/html/2601.20552v1](https://arxiv.org/html/2601.20552v1)  
4. DeepSeek OCR 2 Deep Dive: How to Accurately Extract Complex Tables and Multi-column Documents (A Practical Guide) | iWeaver AI, accessed on February 4, 2026, [https://www.iweaver.ai/blog/deepseek-ocr2-deep-dive-how-deploy/](https://www.iweaver.ai/blog/deepseek-ocr2-deep-dive-how-deploy/)  
5. Master the Paper Chaos: Comparing Azure's OCR and Document ..., accessed on February 4, 2026, [https://jannikreinhard.com/2026/01/12/master-the-paper-chaos-comparing-azures-ocr-and-document-intelligence-powerhouses/](https://jannikreinhard.com/2026/01/12/master-the-paper-chaos-comparing-azures-ocr-and-document-intelligence-powerhouses/)  
6. What hardware or throughput requirements does DeepSeek-OCR have? \- Milvus, accessed on February 4, 2026, [https://milvus.io/ai-quick-reference/what-hardware-or-throughput-requirements-does-deepseekocr-have](https://milvus.io/ai-quick-reference/what-hardware-or-throughput-requirements-does-deepseekocr-have)  
7. Introducing Mistral OCR 3, accessed on February 4, 2026, [https://mistral.ai/news/mistral-ocr-3](https://mistral.ai/news/mistral-ocr-3)  
8. DeepSeek-OCR Explained: How Contexts Optical Compression ..., accessed on February 4, 2026, [https://www.bentoml.com/blog/deepseek-ocr-contexts-optical-compression-explained](https://www.bentoml.com/blog/deepseek-ocr-contexts-optical-compression-explained)  
9. Beyond OCR: DeepSeek's New Vision Compression and How it Serves Document AI, accessed on February 4, 2026, [https://www.llamaindex.ai/blog/beyond-ocr](https://www.llamaindex.ai/blog/beyond-ocr)  
10. \[2601.20552\] DeepSeek-OCR 2: Visual Causal Flow \- arXiv, accessed on February 4, 2026, [https://arxiv.org/abs/2601.20552](https://arxiv.org/abs/2601.20552)  
11. DeepSeek releases OCR 2 with new visual encoding architecture, targeting more human-like machine vision \- TechNode, accessed on February 4, 2026, [https://technode.com/2026/01/28/deepseek-releases-ocr-2-with-new-visual-encoding-architecture-targeting-more-human-like-machine-vision/](https://technode.com/2026/01/28/deepseek-releases-ocr-2-with-new-visual-encoding-architecture-targeting-more-human-like-machine-vision/)  
12. DeepSeek-OCR: How Optical Compression Redefines Long Context | IntuitionLabs, accessed on February 4, 2026, [https://intuitionlabs.ai/articles/deepseek-ocr-optical-compression](https://intuitionlabs.ai/articles/deepseek-ocr-optical-compression)  
13. Mistral OCR, accessed on February 4, 2026, [https://mistral.ai/news/mistral-ocr](https://mistral.ai/news/mistral-ocr)  
14. Document Data Extraction in 2026: LLMs vs OCRs \- Vellum AI, accessed on February 4, 2026, [https://www.vellum.ai/blog/document-data-extraction-llms-vs-ocrs](https://www.vellum.ai/blog/document-data-extraction-llms-vs-ocrs)  
15. Unlocking high-performance document parsing of PaddleOCR VL 1 5 on AMD GPUs, accessed on February 4, 2026, [https://www.amd.com/en/developer/resources/technical-articles/2026/unlocking-high-performance-document-parsing-of-paddleocr-vl-1-5-.html](https://www.amd.com/en/developer/resources/technical-articles/2026/unlocking-high-performance-document-parsing-of-paddleocr-vl-1-5-.html)  
16. PaddlePaddle/PaddleOCR-VL-1.5 \- Hugging Face, accessed on February 4, 2026, [https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.5](https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.5)  
17. \[2601.21957\] PaddleOCR-VL-1.5: Towards a Multi-Task 0.9B VLM for Robust In-the-Wild Document Parsing \- arXiv, accessed on February 4, 2026, [https://arxiv.org/abs/2601.21957](https://arxiv.org/abs/2601.21957)  
18. OCR Benchmark: Text Extraction / Capture Accuracy \[2026\], accessed on February 4, 2026, [https://research.aimultiple.com/ocr-accuracy/](https://research.aimultiple.com/ocr-accuracy/)  
19. Best LLM‑Ready Document Parsers in 2025: Methods and Trade‑Offs, accessed on February 4, 2026, [https://llms.reducto.ai/best-llm-ready-document-parsers-2025](https://llms.reducto.ai/best-llm-ready-document-parsers-2025)  
20. vLLM vs TensorRT-LLM: Key differences, performance, and how to run them \- Northflank, accessed on February 4, 2026, [https://northflank.com/blog/vllm-vs-tensorrt-llm-and-how-to-run-them](https://northflank.com/blog/vllm-vs-tensorrt-llm-and-how-to-run-them)  
21. Why is vLLM Outperforming TensorRT-LLM (Nvidia's deployment library)? My Shocking Benchmarks on GPT-OSS-120B with H100 : r/LocalLLaMA \- Reddit, accessed on February 4, 2026, [https://www.reddit.com/r/LocalLLaMA/comments/1oyawkl/why\_is\_vllm\_outperforming\_tensorrtllm\_nvidias/](https://www.reddit.com/r/LocalLLaMA/comments/1oyawkl/why_is_vllm_outperforming_tensorrtllm_nvidias/)  
22. deepseek-ai/DeepSeek-OCR: Contexts Optical Compression \- GitHub, accessed on February 4, 2026, [https://github.com/deepseek-ai/DeepSeek-OCR](https://github.com/deepseek-ai/DeepSeek-OCR)  
23. B200 vs H200: Best GPU for LLMs, vision models, and scalable training | Blog \- Northflank, accessed on February 4, 2026, [https://northflank.com/blog/b200-vs-h200](https://northflank.com/blog/b200-vs-h200)  
24. H100 vs H200 vs B200: NVIDIA GPU Comparison | Introl Blog, accessed on February 4, 2026, [https://introl.com/blog/h100-vs-h200-vs-b200-choosing-the-right-nvidia-gpus-for-your-ai-workload](https://introl.com/blog/h100-vs-h200-vs-b200-choosing-the-right-nvidia-gpus-for-your-ai-workload)  
25. katanaml/sparrow: Structured data extraction and instruction calling with ML, LLM and Vision LLM \- GitHub, accessed on February 4, 2026, [https://github.com/katanaml/sparrow](https://github.com/katanaml/sparrow)  
26. A 2026 Guide to AI Bank Statement Extraction & Processing \- Unstract, accessed on February 4, 2026, [https://unstract.com/blog/guide-to-automating-bank-statement-extraction-and-processing/](https://unstract.com/blog/guide-to-automating-bank-statement-extraction-and-processing/)  
27. How LLMs boosted our bank statement parsing coverage by up to 5x \- Inscribe AI, accessed on February 4, 2026, [https://www.inscribe.ai/blog/how-llms-boosted-our-bank-statement-parsing-coverage-by-up-to-5x](https://www.inscribe.ai/blog/how-llms-boosted-our-bank-statement-parsing-coverage-by-up-to-5x)  
28. Announcing RD-TableBench: An Open-Source Table ... \- Reducto, accessed on February 4, 2026, [https://reducto.ai/blog/rd-tablebench](https://reducto.ai/blog/rd-tablebench)  
29. 7 Best Open-Source OCR Models 2025: Benchmarks & Cost Comparison | E2E Networks, accessed on February 4, 2026, [https://www.e2enetworks.com/blog/complete-guide-open-source-ocr-models-2025](https://www.e2enetworks.com/blog/complete-guide-open-source-ocr-models-2025)  
30. Document AI Guide: Agentic OCR & Workflows | LlamaIndex, accessed on February 4, 2026, [https://www.llamaindex.ai/blog/document-ai-the-next-evolution-of-intelligent-document-processing](https://www.llamaindex.ai/blog/document-ai-the-next-evolution-of-intelligent-document-processing)  
31. DeepSeek OCR: Why Performance Breaks Down on Real-World Documents, accessed on February 4, 2026, [https://labelyourdata.com/articles/deepseek-ocr](https://labelyourdata.com/articles/deepseek-ocr)  
32. The 2026 Guide to AI Agent Workflows \- Vellum AI, accessed on February 4, 2026, [https://www.vellum.ai/blog/agentic-workflows-emerging-architectures-and-design-patterns](https://www.vellum.ai/blog/agentic-workflows-emerging-architectures-and-design-patterns)  
33. The 9 Best Agentic Workflow Patterns to Scale AI Agents in 2026 \- Beam AI, accessed on February 4, 2026, [https://beam.ai/agentic-insights/the-9-best-agentic-workflow-patterns-to-scale-ai-agents-in-2026](https://beam.ai/agentic-insights/the-9-best-agentic-workflow-patterns-to-scale-ai-agents-in-2026)