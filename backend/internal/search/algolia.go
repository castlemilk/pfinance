package search

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"

	"github.com/algolia/algoliasearch-client-go/v4/algolia/search"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// Config holds Algolia configuration.
type Config struct {
	AppID     string
	APIKey    string // Search-only API key
	IndexName string
}

// SearchParams defines the input for an Algolia search.
type SearchParams struct {
	Query    string
	UserID   string
	GroupID  string
	Category string
	// Amount range (dollars)
	AmountMin float64
	AmountMax float64
	// Date range
	StartDate *time.Time
	EndDate   *time.Time
	// Transaction type filter
	Type pfinancev1.TransactionType
	// Pagination (offset-based)
	Page     int
	PageSize int
}

// SearchResponse holds results from Algolia.
type SearchResponse struct {
	Results    []*pfinancev1.SearchResult
	TotalCount int
	TotalPages int
	Page       int
}

// AlgoliaClient wraps the Algolia search API client.
type AlgoliaClient struct {
	client    *search.APIClient
	indexName string
}

// NewAlgoliaClient creates a new Algolia search client.
func NewAlgoliaClient(cfg Config) (*AlgoliaClient, error) {
	if cfg.AppID == "" || cfg.APIKey == "" {
		return nil, fmt.Errorf("algolia AppID and APIKey are required")
	}
	if cfg.IndexName == "" {
		cfg.IndexName = "pfinance"
	}

	client, err := search.NewClient(cfg.AppID, cfg.APIKey)
	if err != nil {
		return nil, fmt.Errorf("creating algolia client: %w", err)
	}

	return &AlgoliaClient{
		client:    client,
		indexName: cfg.IndexName,
	}, nil
}

// Search performs a full-text search via Algolia.
func (c *AlgoliaClient) Search(ctx context.Context, params SearchParams) (*SearchResponse, error) {
	pageSize := params.PageSize
	if pageSize <= 0 {
		pageSize = 25
	}
	if pageSize > 100 {
		pageSize = 100
	}

	page := params.Page
	if page < 0 {
		page = 0
	}

	filters := buildFilters(params)

	hitsPerPage := int32(pageSize)
	algoliaPage := int32(page)
	searchParams := search.SearchParamsObjectAsSearchParams(
		search.NewSearchParamsObject().
			SetQuery(params.Query).
			SetHitsPerPage(hitsPerPage).
			SetPage(algoliaPage).
			SetFilters(filters),
	)

	resp, err := c.client.SearchSingleIndex(c.client.NewApiSearchSingleIndexRequest(c.indexName).WithSearchParams(searchParams))
	if err != nil {
		return nil, fmt.Errorf("algolia search: %w", err)
	}

	results := make([]*pfinancev1.SearchResult, 0, len(resp.Hits))
	for _, hit := range resp.Hits {
		result := hitToSearchResult(hit.AdditionalProperties)
		if result != nil {
			results = append(results, result)
		}
	}

	totalCount := 0
	if resp.NbHits != nil {
		totalCount = int(*resp.NbHits)
	}
	totalPages := 0
	if resp.NbPages != nil {
		totalPages = int(*resp.NbPages)
	}

	return &SearchResponse{
		Results:    results,
		TotalCount: totalCount,
		TotalPages: totalPages,
		Page:       page,
	}, nil
}

// buildFilters constructs Algolia filter string from search params.
// UserId is always enforced for security.
func buildFilters(params SearchParams) string {
	var parts []string

	// Always filter by user for security
	if params.UserID != "" {
		parts = append(parts, fmt.Sprintf("UserId:%q", params.UserID))
	}

	if params.GroupID != "" {
		parts = append(parts, fmt.Sprintf("GroupId:%q", params.GroupID))
	}

	if params.Category != "" {
		parts = append(parts, fmt.Sprintf("Category:%q", params.Category))
	}

	switch params.Type {
	case pfinancev1.TransactionType_TRANSACTION_TYPE_EXPENSE:
		parts = append(parts, `Type:"expense"`)
	case pfinancev1.TransactionType_TRANSACTION_TYPE_INCOME:
		parts = append(parts, `Type:"income"`)
	}

	// Amount range
	if params.AmountMin > 0 {
		parts = append(parts, fmt.Sprintf("Amount >= %f", params.AmountMin))
	}
	if params.AmountMax > 0 {
		parts = append(parts, fmt.Sprintf("Amount <= %f", params.AmountMax))
	}

	// Date range (using DateUnix numeric field)
	if params.StartDate != nil {
		parts = append(parts, fmt.Sprintf("DateUnix >= %d", params.StartDate.Unix()))
	}
	if params.EndDate != nil {
		parts = append(parts, fmt.Sprintf("DateUnix <= %d", params.EndDate.Unix()))
	}

	return strings.Join(parts, " AND ")
}

// hitToSearchResult converts an Algolia hit to a proto SearchResult.
func hitToSearchResult(props map[string]any) *pfinancev1.SearchResult {
	result := &pfinancev1.SearchResult{}

	if v, ok := props["objectID"].(string); ok {
		result.Id = v
	}
	if v, ok := props["Description"].(string); ok {
		result.Description = v
	}
	if v, ok := props["Category"].(string); ok {
		result.Category = v
	}
	if v, ok := props["GroupId"].(string); ok {
		result.GroupId = v
	}

	// Amount — prefer AmountCents
	if v, ok := props["AmountCents"].(float64); ok && v != 0 {
		result.AmountCents = int64(v)
		result.Amount = v / 100
	} else if v, ok := props["Amount"].(float64); ok {
		result.Amount = v
	}

	// Date — prefer DateUnix (unix timestamp)
	if v, ok := props["DateUnix"].(float64); ok && v > 0 {
		t := time.Unix(int64(v), 0)
		result.Date = timestamppb.New(t)
	} else if v, ok := props["Date"].(string); ok {
		t, err := time.Parse(time.RFC3339, v)
		if err == nil {
			result.Date = timestamppb.New(t)
		}
	}

	// Type
	if v, ok := props["Type"].(string); ok {
		switch strings.ToLower(v) {
		case "expense":
			result.Type = pfinancev1.TransactionType_TRANSACTION_TYPE_EXPENSE
		case "income":
			result.Type = pfinancev1.TransactionType_TRANSACTION_TYPE_INCOME
		}
	}

	if result.Id == "" {
		log.Printf("algolia: skipping hit with no objectID")
		return nil
	}

	return result
}
