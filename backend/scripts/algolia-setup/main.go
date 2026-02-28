// algolia-setup configures Algolia index settings for the pfinance project.
// This is the IaC definition for the Algolia search index.
//
// Usage:
//
//	ALGOLIA_APP_ID=... ALGOLIA_ADMIN_KEY=... go run ./scripts/algolia-setup
//	ALGOLIA_APP_ID=... ALGOLIA_ADMIN_KEY=... ALGOLIA_INDEX_NAME=pfinance go run ./scripts/algolia-setup
package main

import (
	"fmt"
	"log"
	"os"

	"github.com/algolia/algoliasearch-client-go/v4/algolia/search"
)

func int32Ptr(v int32) *int32 { return &v }

func main() {
	appID := os.Getenv("ALGOLIA_APP_ID")
	adminKey := os.Getenv("ALGOLIA_ADMIN_KEY")
	indexName := os.Getenv("ALGOLIA_INDEX_NAME")

	if appID == "" || adminKey == "" {
		log.Fatal("ALGOLIA_APP_ID and ALGOLIA_ADMIN_KEY are required")
	}
	if indexName == "" {
		indexName = "pfinance"
	}

	client, err := search.NewClient(appID, adminKey)
	if err != nil {
		log.Fatalf("Failed to create Algolia client: %v", err)
	}

	log.Printf("Configuring Algolia index %q (app: %s)...", indexName, appID)

	// =========================================================================
	// Index Settings — single source of truth for the Algolia index config
	// =========================================================================
	settings := &search.IndexSettings{
		// Searchable attributes in priority order
		SearchableAttributes: []string{
			"Description",
			"Category",
		},

		// Attributes available for faceting/filtering
		// filterOnly() = can filter but values not returned as facets
		// searchable() = can also search within facet values
		AttributesForFaceting: []string{
			"filterOnly(UserId)",
			"filterOnly(GroupId)",
			"searchable(Category)",
			"filterOnly(Type)",
			"filterOnly(Frequency)",
			"filterOnly(IsTaxDeductible)",
		},

		// Numeric attributes for range filters
		NumericAttributesForFiltering: []string{
			"Amount",
			"AmountCents",
			"DateUnix",
		},

		// Custom ranking (applied after text relevance)
		// Most recent expenses first
		CustomRanking: []string{
			"desc(DateUnix)",
		},

		// Attributes to retrieve in search results.
		// UserId is intentionally excluded — it's a filter-only field
		// for tenant isolation and should not be exposed in results.
		AttributesToRetrieve: []string{
			"objectID",
			"Description",
			"Category",
			"Amount",
			"AmountCents",
			"Date",
			"DateUnix",
			"GroupId",
			"Frequency",
			"IsTaxDeductible",
			"Type",
		},

		// Only highlight text-searchable fields
		AttributesToHighlight: []string{
			"Description",
			"Category",
		},

		// Pagination defaults
		HitsPerPage:       int32Ptr(25),
		MaxValuesPerFacet: int32Ptr(100),

		// Typo tolerance thresholds
		MinWordSizefor1Typo:  int32Ptr(4),
		MinWordSizefor2Typos: int32Ptr(8),
	}

	req := client.NewApiSetSettingsRequest(indexName, settings)
	resp, err := client.SetSettings(req)
	if err != nil {
		log.Fatalf("Failed to set index settings: %v", err)
	}

	log.Printf("Index settings applied (taskID: %d, updatedAt: %s)", resp.TaskID, resp.UpdatedAt)

	// Print summary
	fmt.Println()
	fmt.Println("=== Algolia Index Configuration ===")
	fmt.Printf("Index:              %s\n", indexName)
	fmt.Printf("App ID:             %s\n", appID)
	fmt.Println()
	fmt.Println("Searchable attrs:   Description, Category")
	fmt.Println("Facet filters:      UserId, GroupId, Category, Type, Frequency, IsTaxDeductible")
	fmt.Println("Numeric filters:    Amount, AmountCents, DateUnix")
	fmt.Println("Custom ranking:     desc(DateUnix)")
	fmt.Println("Hits per page:      25")
	fmt.Println()
	fmt.Println("Done. Settings are applied asynchronously — they'll be active within seconds.")
}
