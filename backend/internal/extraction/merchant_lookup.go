package extraction

import (
	"context"
	"fmt"
	"math"
	"strings"
	"time"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

// overrideConfidence returns confidence derived from category override correction count.
func overrideConfidence(count int32) float64 {
	return math.Min(0.99, 0.8+0.05*float64(count))
}

// MerchantMappingStore is the subset of the store interface needed for merchant lookups.
type MerchantMappingStore interface {
	GetMerchantMappings(ctx context.Context, userID string) ([]*pfinancev1.MerchantMapping, error)
}

// CategoryOverrideStore is the subset of the store interface needed for category override lookups.
type CategoryOverrideStore interface {
	GetCategoryOverrides(ctx context.Context, userID string) ([]*pfinancev1.CategoryOverride, error)
}

// StoreMerchantLookup adapts a store into a MerchantLookup with fuzzy matching
// and per-user caching.
type StoreMerchantLookup struct {
	store         MerchantMappingStore
	overrideStore CategoryOverrideStore
	cache         *MerchantCache // shared cache keyed by "userID:rawMerchant"
}

// NewStoreMerchantLookup creates a StoreMerchantLookup with a built-in cache.
func NewStoreMerchantLookup(store MerchantMappingStore) *StoreMerchantLookup {
	return &StoreMerchantLookup{
		store: store,
		cache: NewMerchantCache(10*time.Minute, 2048),
	}
}

// SetCategoryOverrideStore sets the store for per-user category overrides.
func (l *StoreMerchantLookup) SetCategoryOverrideStore(store CategoryOverrideStore) {
	l.overrideStore = store
}

// LookupMerchant checks user-specific merchant mappings with exact, substring,
// and fuzzy matching. Results are cached per user+merchant pair.
func (l *StoreMerchantLookup) LookupMerchant(ctx context.Context, userID string, rawMerchant string) (*MerchantInfo, error) {
	lower := strings.ToLower(strings.TrimSpace(rawMerchant))
	cacheKey := fmt.Sprintf("%s:%s", userID, lower)

	// Check cache first
	if l.cache != nil {
		if info, ok := l.cache.Get(cacheKey); ok {
			return info, nil
		}
	}

	// Pass 0: check per-user category overrides (2+ corrections required)
	if l.overrideStore != nil {
		overrides, err := l.overrideStore.GetCategoryOverrides(ctx, userID)
		if err == nil {
			for _, o := range overrides {
				if o.CorrectionCount >= 2 &&
					(strings.Contains(lower, o.MerchantNormalized) ||
						strings.Contains(o.MerchantNormalized, lower)) {
					info := &MerchantInfo{
						Name:       NormalizeMerchant(rawMerchant).Name,
						Category:   o.UserCategory,
						Confidence: overrideConfidence(o.CorrectionCount),
					}
					l.cacheResult(cacheKey, info)
					return info, nil
				}
			}
		}
	}

	mappings, err := l.store.GetMerchantMappings(ctx, userID)
	if err != nil {
		return nil, err
	}

	// Pass 1: exact/substring match (high confidence)
	for _, m := range mappings {
		pattern := strings.ToLower(m.RawPattern)
		if strings.Contains(lower, pattern) || strings.Contains(pattern, lower) {
			info := &MerchantInfo{
				Name:       m.NormalizedName,
				Category:   m.Category,
				Confidence: m.Confidence,
			}
			l.cacheResult(cacheKey, info)
			return info, nil
		}
	}

	// Pass 2: fuzzy match against user mappings
	bestDist := len(lower)
	var bestMapping *pfinancev1.MerchantMapping
	maxDist := max(2, len(lower)/4)

	for _, m := range mappings {
		pattern := strings.ToLower(m.RawPattern)
		d := levenshtein(lower, pattern)
		if d < bestDist && d <= maxDist {
			bestDist = d
			bestMapping = m
		}
	}

	if bestMapping != nil {
		confidence := bestMapping.Confidence * (1.0 - float64(bestDist)*0.1)
		if confidence < 0.5 {
			confidence = 0.5
		}
		info := &MerchantInfo{
			Name:       bestMapping.NormalizedName,
			Category:   bestMapping.Category,
			Confidence: confidence,
		}
		l.cacheResult(cacheKey, info)
		return info, nil
	}

	// Cache the miss too to avoid repeated store lookups
	l.cacheResult(cacheKey, nil)
	return nil, nil
}

func (l *StoreMerchantLookup) cacheResult(key string, info *MerchantInfo) {
	if l.cache != nil {
		l.cache.Put(key, info)
	}
}
