package extraction

import (
	"context"
	"testing"
	"time"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

// ─── Levenshtein tests ──────────────────────────────────────────────────────

func TestLevenshtein(t *testing.T) {
	tests := []struct {
		a, b string
		want int
	}{
		{"", "", 0},
		{"abc", "", 3},
		{"", "abc", 3},
		{"abc", "abc", 0},
		{"abc", "abd", 1},
		{"kitten", "sitting", 3},
		{"woolworths", "wolworths", 1}, // common typo
		{"starbucks", "starbuks", 1},   // missing c
		{"mcdonalds", "macdonalds", 1}, // a vs nothing
		{"netflix", "netflx", 1},       // missing i
		{"completely", "different", 8}, // large distance
	}

	for _, tt := range tests {
		got := levenshtein(tt.a, tt.b)
		if got != tt.want {
			t.Errorf("levenshtein(%q, %q) = %d, want %d", tt.a, tt.b, got, tt.want)
		}
	}
}

// ─── Fuzzy merchant match tests ─────────────────────────────────────────────

func TestFuzzyMerchantMatch(t *testing.T) {
	tests := []struct {
		input    string
		wantName string
		wantNil  bool
	}{
		// Close typos that should match
		{"wolworths", "Woolworths", false},
		{"starbuks", "Starbucks", false},
		{"netflx", "Netflix", false}, // 1 edit from "netflix"
		{"amazn", "Amazon", false},   // 1 edit from "amazon"

		// Too short for fuzzy matching
		{"bp", "", true},
		{"kf", "", true},

		// Exact matches should not be handled here (covered by NormalizeMerchant)
		// but if passed, they work fine
		{"woolworths", "Woolworths", false},
	}

	for _, tt := range tests {
		got := fuzzyMerchantMatch(tt.input)
		if tt.wantNil {
			if got != nil {
				t.Errorf("fuzzyMerchantMatch(%q) = %+v, want nil", tt.input, got)
			}
			continue
		}
		if got == nil {
			t.Errorf("fuzzyMerchantMatch(%q) = nil, want %q", tt.input, tt.wantName)
			continue
		}
		if got.Name != tt.wantName {
			t.Errorf("fuzzyMerchantMatch(%q).Name = %q, want %q", tt.input, got.Name, tt.wantName)
		}
		if got.Confidence <= 0 || got.Confidence > 1 {
			t.Errorf("fuzzyMerchantMatch(%q).Confidence = %f, want (0, 1]", tt.input, got.Confidence)
		}
	}
}

// ─── Cache tests ────────────────────────────────────────────────────────────

func TestMerchantCache(t *testing.T) {
	cache := NewMerchantCache(1*time.Minute, 100)

	info := &MerchantInfo{Name: "Test", Confidence: 0.9}
	cache.Put("key1", info)

	got, ok := cache.Get("key1")
	if !ok || got.Name != "Test" {
		t.Errorf("cache.Get(key1) = (%v, %v), want (Test, true)", got, ok)
	}

	_, ok = cache.Get("missing")
	if ok {
		t.Error("cache.Get(missing) should return false")
	}

	if cache.Size() != 1 {
		t.Errorf("cache.Size() = %d, want 1", cache.Size())
	}
}

func TestMerchantCache_NilEntry(t *testing.T) {
	cache := NewMerchantCache(1*time.Minute, 100)
	cache.Put("miss", nil)

	got, ok := cache.Get("miss")
	if !ok {
		t.Error("cache should store nil entries (cache negative lookups)")
	}
	if got != nil {
		t.Errorf("expected nil info for cached miss, got %+v", got)
	}
}

func TestMerchantCache_Eviction(t *testing.T) {
	cache := NewMerchantCache(1*time.Minute, 10)

	for i := 0; i < 15; i++ {
		cache.Put(string(rune('a'+i)), &MerchantInfo{Name: "x"})
	}

	// After eviction, size should be manageable
	if cache.Size() > 10 {
		t.Errorf("cache.Size() = %d, should be <= 10 after eviction", cache.Size())
	}
}

// ─── NormalizeMerchantCached tests ──────────────────────────────────────────

func TestNormalizeMerchantCached_ExactMatch(t *testing.T) {
	cache := NewMerchantCache(1*time.Minute, 100)

	info := NormalizeMerchantCached("WOOLWORTHS SUPERMARKET 1234", cache)
	if info.Name != "Woolworths" {
		t.Errorf("Name = %q, want Woolworths", info.Name)
	}
	if info.Confidence < 0.9 {
		t.Errorf("Confidence = %f, want >= 0.9", info.Confidence)
	}

	// Second call should hit cache
	info2 := NormalizeMerchantCached("woolworths supermarket 1234", cache)
	if info2.Name != info.Name {
		t.Errorf("cached result mismatch: %q vs %q", info2.Name, info.Name)
	}
}

func TestNormalizeMerchantCached_FuzzyMatch(t *testing.T) {
	cache := NewMerchantCache(1*time.Minute, 100)

	// "wolworths" is 1 edit from "woolworths" — should fuzzy match
	// Use a raw merchant string that won't match via substring or keyword
	info := NormalizeMerchantCached("WOLWORTHS", cache)
	if info.Name != "Woolworths" {
		t.Errorf("Name = %q, want Woolworths (fuzzy match)", info.Name)
	}
	if info.Category != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD {
		t.Errorf("Category = %v, want FOOD", info.Category)
	}
}

func TestNormalizeMerchantCached_NilCache(t *testing.T) {
	// Should work without a cache (no panic)
	info := NormalizeMerchantCached("WOOLWORTHS", nil)
	if info.Name != "Woolworths" {
		t.Errorf("Name = %q, want Woolworths", info.Name)
	}
}

// ─── StoreMerchantLookup tests ──────────────────────────────────────────────

type mockMerchantStore struct {
	mappings []*pfinancev1.MerchantMapping
}

func (m *mockMerchantStore) GetMerchantMappings(_ context.Context, _ string) ([]*pfinancev1.MerchantMapping, error) {
	return m.mappings, nil
}

func TestStoreMerchantLookup_ExactMatch(t *testing.T) {
	store := &mockMerchantStore{
		mappings: []*pfinancev1.MerchantMapping{
			{
				RawPattern:     "corner bakery",
				NormalizedName: "Corner Bakery",
				Category:       pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
				Confidence:     0.9,
			},
		},
	}
	lookup := NewStoreMerchantLookup(store)

	info, err := lookup.LookupMerchant(context.Background(), "user1", "CORNER BAKERY CAFE")
	if err != nil {
		t.Fatal(err)
	}
	if info == nil || info.Name != "Corner Bakery" {
		t.Errorf("expected Corner Bakery, got %+v", info)
	}
}

func TestStoreMerchantLookup_FuzzyMatch(t *testing.T) {
	store := &mockMerchantStore{
		mappings: []*pfinancev1.MerchantMapping{
			{
				RawPattern:     "cornerr bakery",
				NormalizedName: "Corner Bakery",
				Category:       pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
				Confidence:     0.85,
			},
		},
	}
	lookup := NewStoreMerchantLookup(store)

	// "corner bakery" vs "cornerr bakery" = 1 edit
	info, err := lookup.LookupMerchant(context.Background(), "user1", "corner bakery")
	if err != nil {
		t.Fatal(err)
	}
	if info == nil {
		t.Fatal("expected fuzzy match, got nil")
	}
	if info.Name != "Corner Bakery" {
		t.Errorf("Name = %q, want Corner Bakery", info.Name)
	}
}

func TestStoreMerchantLookup_CachesResults(t *testing.T) {
	callCount := 0
	store := &countingMerchantStore{
		mappings: []*pfinancev1.MerchantMapping{
			{
				RawPattern:     "test merchant",
				NormalizedName: "Test Merchant",
				Category:       pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER,
				Confidence:     0.8,
			},
		},
		callCount: &callCount,
	}
	lookup := NewStoreMerchantLookup(store)

	// First call hits the store
	lookup.LookupMerchant(context.Background(), "user1", "test merchant")
	if callCount != 1 {
		t.Errorf("expected 1 store call, got %d", callCount)
	}

	// Second call should hit cache
	lookup.LookupMerchant(context.Background(), "user1", "test merchant")
	if callCount != 1 {
		t.Errorf("expected 1 store call (cached), got %d", callCount)
	}
}

type countingMerchantStore struct {
	mappings  []*pfinancev1.MerchantMapping
	callCount *int
}

func (m *countingMerchantStore) GetMerchantMappings(_ context.Context, _ string) ([]*pfinancev1.MerchantMapping, error) {
	*m.callCount++
	return m.mappings, nil
}

// ─── Benchmarks ─────────────────────────────────────────────────────────────

func BenchmarkLevenshtein(b *testing.B) {
	for i := 0; i < b.N; i++ {
		levenshtein("woolworths supermarket", "wolworths supermrket")
	}
}

func BenchmarkFuzzyMerchantMatch(b *testing.B) {
	inputs := []string{"wolworths", "starbuks", "amazn", "netflx", "unknown merchant xyz"}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		fuzzyMerchantMatch(inputs[i%len(inputs)])
	}
}

func BenchmarkNormalizeMerchantCached(b *testing.B) {
	cache := NewMerchantCache(1*time.Minute, 4096)
	inputs := []string{
		"WOOLWORTHS SUPERMARKET 1234",
		"VISA*NETFLIX.COM",
		"UBER* TRIP 9f3a",
		"AMAZON AU PTY LTD",
		"EFTPOS BUNNINGS WAREHOUSE",
		"POS COLES 0042",
		"UNFAMILIAR MERCHANT XYZ",
		"MACDONALDS RESTAURANT AU",
	}

	// Warm the cache
	for _, in := range inputs {
		NormalizeMerchantCached(in, cache)
	}

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		NormalizeMerchantCached(inputs[i%len(inputs)], cache)
	}
}
