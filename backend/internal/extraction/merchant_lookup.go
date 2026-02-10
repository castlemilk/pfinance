package extraction

import (
	"context"
	"strings"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

// MerchantMappingStore is the subset of the store interface needed for merchant lookups.
type MerchantMappingStore interface {
	GetMerchantMappings(ctx context.Context, userID string) ([]*pfinancev1.MerchantMapping, error)
}

// StoreMerchantLookup adapts a store into a MerchantLookup.
type StoreMerchantLookup struct {
	store MerchantMappingStore
}

// NewStoreMerchantLookup creates a StoreMerchantLookup.
func NewStoreMerchantLookup(store MerchantMappingStore) *StoreMerchantLookup {
	return &StoreMerchantLookup{store: store}
}

// LookupMerchant checks user-specific merchant mappings.
func (l *StoreMerchantLookup) LookupMerchant(ctx context.Context, userID string, rawMerchant string) (*MerchantInfo, error) {
	mappings, err := l.store.GetMerchantMappings(ctx, userID)
	if err != nil {
		return nil, err
	}

	lower := strings.ToLower(strings.TrimSpace(rawMerchant))
	for _, m := range mappings {
		pattern := strings.ToLower(m.RawPattern)
		if strings.Contains(lower, pattern) || strings.Contains(pattern, lower) {
			return &MerchantInfo{
				Name:       m.NormalizedName,
				Category:   m.Category,
				Confidence: m.Confidence,
			}, nil
		}
	}
	return nil, nil
}
