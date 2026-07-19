# Precision Press ERP Performance Baseline

**Date:** June 20, 2026
**Status:** Pre-Redis Implementation (Phase 0)

## Baseline Database Fetch Latencies
| Operation | Average Latency (ms) | Notes |
| :--- | :--- | :--- |
| **Product Fetch (Firestore)** | **1033.34 ms** | Extremely slow. This blocks `OrderBuilder` and `ProxyOrderBuilder` initial load. |
| **Customer Fetch (Firestore)** | 125.03 ms | Acceptable but can be faster. |
| **Single Product Fetch (Supabase)** | 80.26 ms | Used during ACDEMA proxy orders and Workflow validation. |
| **Single Profile Fetch (Supabase)** | 116.06 ms | Checked inside `executeOrderPlacementTx` before SQL execution. |

## Expected Order Placement Speed Improvements (Read Latency)
Because financial customer data must remain uncached to prevent staleness, the total latency will drop significantly but not to 10ms.

| Operation | Current | Expected after Redis |
| :--- | :--- | :--- |
| **Product list** | 1033 ms | **5–20 ms** |
| **Workflow** | 80–100 ms | **5–10 ms** |
| **Customer profile** | 116 ms | **80–120 ms** (financial data comes from DB) |
| **Total read time** | 1300+ ms | **100–200 ms** |

*Note: The 1033ms Firestore fetch is unusually high and indicates potential issues with the underlying query (e.g. missing pagination). Redis will mask this latency, but optimizing the source query may yield additional benefits.*

## Next Steps
We will now proceed with **Phase 1** (Core Product Cache, Workflow Cache) to replace the 1033ms Firestore read with a <10ms Redis snapshot, backed by PostgreSQL as the new source of truth.
