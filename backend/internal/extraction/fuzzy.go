package extraction

import (
	"strings"
	"sync"
	"time"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

// levenshtein computes the edit distance between two strings.
func levenshtein(a, b string) int {
	if len(a) == 0 {
		return len(b)
	}
	if len(b) == 0 {
		return len(a)
	}

	// Use single-row optimization: O(min(m,n)) space.
	if len(a) > len(b) {
		a, b = b, a
	}

	prev := make([]int, len(a)+1)
	for i := range prev {
		prev[i] = i
	}

	for j := 1; j <= len(b); j++ {
		curr := make([]int, len(a)+1)
		curr[0] = j
		for i := 1; i <= len(a); i++ {
			cost := 1
			if a[i-1] == b[j-1] {
				cost = 0
			}
			ins := curr[i-1] + 1
			del := prev[i] + 1
			sub := prev[i-1] + cost
			curr[i] = min3(ins, del, sub)
		}
		prev = curr
	}
	return prev[len(a)]
}

func min3(a, b, c int) int {
	if a < b {
		if a < c {
			return a
		}
		return c
	}
	if b < c {
		return b
	}
	return c
}

// fuzzyMerchantMatch attempts fuzzy matching against known merchant names.
// It returns a match only when the edit distance is within the threshold
// (maxDistance = max(2, len/4)) and the best match is unambiguous (at least
// 2 edits better than the second-best).
func fuzzyMerchantMatch(cleaned string) *MerchantInfo {
	if len(cleaned) < 4 {
		return nil // too short for reliable fuzzy matching
	}

	bestDist := len(cleaned) // worst case
	var bestInfo *MerchantInfo
	secondBest := len(cleaned)

	maxDist := max(2, len(cleaned)/4)

	for key, info := range merchantMappings {
		d := levenshtein(cleaned, key)
		if d < bestDist {
			secondBest = bestDist
			bestDist = d
			infoCopy := info
			bestInfo = &infoCopy
		} else if d < secondBest {
			secondBest = d
		}
	}

	if bestInfo == nil || bestDist > maxDist {
		return nil
	}

	// Require the best match to be unambiguous — at least 2 edits better
	// than the runner-up (unless it's an exact or near-exact match).
	if bestDist > 0 && secondBest-bestDist < 2 {
		return nil
	}

	// Scale confidence by edit distance: 0 edits = 0.92, 1 = 0.85, 2 = 0.78
	confidence := 0.92 - float64(bestDist)*0.07
	if confidence < 0.65 {
		confidence = 0.65
	}

	return &MerchantInfo{
		Name:       bestInfo.Name,
		Category:   bestInfo.Category,
		Confidence: confidence,
	}
}

// ─── Merchant cache ─────────────────────────────────────────────────────────

// merchantCacheEntry holds a cached merchant lookup result.
type merchantCacheEntry struct {
	info      *MerchantInfo
	expiresAt time.Time
}

// MerchantCache provides an in-memory cache for merchant normalization results.
// It is safe for concurrent use.
type MerchantCache struct {
	mu      sync.RWMutex
	entries map[string]merchantCacheEntry
	ttl     time.Duration
	maxSize int
}

// NewMerchantCache creates a cache with the given TTL and maximum entry count.
func NewMerchantCache(ttl time.Duration, maxSize int) *MerchantCache {
	return &MerchantCache{
		entries: make(map[string]merchantCacheEntry, 256),
		ttl:     ttl,
		maxSize: maxSize,
	}
}

// Get retrieves a cached result. Returns nil, false on miss or expiry.
func (c *MerchantCache) Get(key string) (*MerchantInfo, bool) {
	c.mu.RLock()
	entry, ok := c.entries[key]
	c.mu.RUnlock()

	if !ok || time.Now().After(entry.expiresAt) {
		return nil, false
	}
	return entry.info, true
}

// Put stores a result in the cache.
func (c *MerchantCache) Put(key string, info *MerchantInfo) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Simple eviction: clear half the cache when full.
	if len(c.entries) >= c.maxSize {
		count := 0
		for k := range c.entries {
			delete(c.entries, k)
			count++
			if count >= c.maxSize/2 {
				break
			}
		}
	}

	c.entries[key] = merchantCacheEntry{
		info:      info,
		expiresAt: time.Now().Add(c.ttl),
	}
}

// Size returns the current number of entries.
func (c *MerchantCache) Size() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.entries)
}

// ─── Cached normalizer ──────────────────────────────────────────────────────

// NormalizeMerchantCached runs NormalizeMerchant with fuzzy matching and
// caching. It checks the cache first, then runs the standard pipeline with
// an additional fuzzy-match tier between partial-word and keyword matching.
func NormalizeMerchantCached(rawMerchant string, cache *MerchantCache) MerchantInfo {
	lower := strings.ToLower(strings.TrimSpace(rawMerchant))

	// 1. Cache hit?
	if cache != nil {
		if info, ok := cache.Get(lower); ok {
			return *info
		}
	}

	// 2. Clean
	cleaned := prefixPattern.ReplaceAllString(lower, "")
	cleaned = suffixPattern.ReplaceAllString(cleaned, "")
	cleaned = longNumbers.ReplaceAllString(cleaned, "")
	cleaned = specialChars.ReplaceAllString(cleaned, "")
	cleaned = strings.TrimSpace(cleaned)

	// 3. Direct mapping
	for key, info := range merchantMappings {
		if strings.Contains(cleaned, key) || strings.Contains(key, cleaned) {
			cacheResult(cache, lower, &info)
			return info
		}
	}

	// 4. Partial word match
	for i := range merchantWordPatterns {
		e := &merchantWordPatterns[i]
		for _, word := range e.words {
			if strings.Contains(cleaned, word) {
				info := MerchantInfo{
					Name:       e.info.Name,
					Category:   e.info.Category,
					Confidence: 0.8,
				}
				cacheResult(cache, lower, &info)
				return info
			}
		}
	}

	// 5. Fuzzy match (new tier)
	if fuzzyInfo := fuzzyMerchantMatch(cleaned); fuzzyInfo != nil {
		cacheResult(cache, lower, fuzzyInfo)
		return *fuzzyInfo
	}

	// 6. Keyword fallback
	for keyword, category := range categoryKeywords {
		if strings.Contains(cleaned, keyword) {
			info := MerchantInfo{
				Name:       formatCleaned(cleaned),
				Category:   category,
				Confidence: 0.6,
			}
			cacheResult(cache, lower, &info)
			return info
		}
	}

	// 7. Unknown
	info := MerchantInfo{
		Name:       formatCleaned(cleaned),
		Category:   pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER,
		Confidence: 0.3,
	}
	cacheResult(cache, lower, &info)
	return info
}

func cacheResult(cache *MerchantCache, key string, info *MerchantInfo) {
	if cache != nil {
		cache.Put(key, info)
	}
}
