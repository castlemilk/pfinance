// backfill-cents iterates through all Firestore collections and populates
// missing *_cents fields from their double-precision counterparts.
//
// This script is idempotent: if a cents field already has a non-zero value,
// the document is skipped.
//
// Usage:
//
//	export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
//	export GOOGLE_CLOUD_PROJECT=your-project-id
//	go run ./scripts/backfill-cents/
package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"
)

// collectionConfig describes how to backfill a single Firestore collection.
type collectionConfig struct {
	name   string
	fields []fieldMapping // which fields to backfill
}

// fieldMapping maps a double field to its cents counterpart.
type fieldMapping struct {
	doubleField string // e.g. "Amount"
	centsField  string // e.g. "AmountCents"
}

func main() {
	ctx := context.Background()

	projectID := os.Getenv("GOOGLE_CLOUD_PROJECT")
	if projectID == "" {
		log.Fatal("GOOGLE_CLOUD_PROJECT environment variable is required")
	}

	client, err := firestore.NewClient(ctx, projectID)
	if err != nil {
		log.Fatalf("Failed to create Firestore client: %v", err)
	}
	defer client.Close()

	// Define all collections and their field mappings.
	// Field names are PascalCase because the Go Firestore SDK serializes
	// proto structs using Go struct field names.
	collections := []collectionConfig{
		{
			name: "expenses",
			fields: []fieldMapping{
				{doubleField: "Amount", centsField: "AmountCents"},
			},
		},
		{
			name: "groupExpenses",
			fields: []fieldMapping{
				{doubleField: "Amount", centsField: "AmountCents"},
			},
		},
		{
			name: "incomes",
			fields: []fieldMapping{
				{doubleField: "Amount", centsField: "AmountCents"},
			},
		},
		{
			name: "groupIncomes",
			fields: []fieldMapping{
				{doubleField: "Amount", centsField: "AmountCents"},
			},
		},
		{
			name: "budgets",
			fields: []fieldMapping{
				{doubleField: "Amount", centsField: "AmountCents"},
			},
		},
		{
			name: "groupBudgets",
			fields: []fieldMapping{
				{doubleField: "Amount", centsField: "AmountCents"},
			},
		},
		{
			name: "goals",
			fields: []fieldMapping{
				{doubleField: "TargetAmount", centsField: "TargetAmountCents"},
				{doubleField: "CurrentAmount", centsField: "CurrentAmountCents"},
			},
		},
		{
			name: "groupGoals",
			fields: []fieldMapping{
				{doubleField: "TargetAmount", centsField: "TargetAmountCents"},
				{doubleField: "CurrentAmount", centsField: "CurrentAmountCents"},
			},
		},
		{
			name: "recurringTransactions",
			fields: []fieldMapping{
				{doubleField: "Amount", centsField: "AmountCents"},
			},
		},
		{
			name: "groupRecurringTransactions",
			fields: []fieldMapping{
				{doubleField: "Amount", centsField: "AmountCents"},
			},
		},
		{
			name: "expenseContributions",
			fields: []fieldMapping{
				{doubleField: "Amount", centsField: "AmountCents"},
			},
		},
		{
			name: "incomeContributions",
			fields: []fieldMapping{
				{doubleField: "Amount", centsField: "AmountCents"},
			},
		},
		{
			name: "goalContributions",
			fields: []fieldMapping{
				{doubleField: "Amount", centsField: "AmountCents"},
			},
		},
	}

	for _, col := range collections {
		processed, updated, err := backfillCollection(ctx, client, col)
		if err != nil {
			log.Printf("[%s] ERROR: %v", col.name, err)
			continue
		}
		fmt.Printf("[%s] Processed %d docs, updated %d\n", col.name, processed, updated)
	}

	fmt.Println("\nBackfill complete.")
}

// backfillCollection iterates through every document in a collection and
// populates missing cents fields from the corresponding double fields.
// Returns (processed count, updated count, error).
func backfillCollection(ctx context.Context, client *firestore.Client, col collectionConfig) (int, int, error) {
	iter := client.Collection(col.name).Documents(ctx)
	defer iter.Stop()

	processed := 0
	updated := 0

	for {
		doc, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return processed, updated, fmt.Errorf("iterating %s: %w", col.name, err)
		}
		processed++

		data := doc.Data()
		var updates []firestore.Update

		for _, fm := range col.fields {
			centsVal := getInt64(data, fm.centsField)
			if centsVal != 0 {
				// Already has a cents value; skip this field.
				continue
			}

			doubleVal := getFloat64(data, fm.doubleField)
			if doubleVal == 0 {
				// Both are zero; nothing to do.
				continue
			}

			// Compute cents from the double value.
			cents := int64(doubleVal * 100)
			updates = append(updates, firestore.Update{
				Path:  fm.centsField,
				Value: cents,
			})
		}

		if len(updates) == 0 {
			continue
		}

		if _, err := doc.Ref.Update(ctx, updates); err != nil {
			log.Printf("[%s] Failed to update doc %s: %v", col.name, doc.Ref.ID, err)
			continue
		}
		updated++
	}

	return processed, updated, nil
}

// getFloat64 safely extracts a float64 value from a map.
// Firestore may store numbers as int64 or float64 depending on the value.
func getFloat64(data map[string]interface{}, key string) float64 {
	v, ok := data[key]
	if !ok || v == nil {
		return 0
	}
	switch val := v.(type) {
	case float64:
		return val
	case float32:
		return float64(val)
	case int64:
		return float64(val)
	case int:
		return float64(val)
	default:
		return 0
	}
}

// getInt64 safely extracts an int64 value from a map.
// Firestore may store numbers as int64 or float64 depending on the value.
func getInt64(data map[string]interface{}, key string) int64 {
	v, ok := data[key]
	if !ok || v == nil {
		return 0
	}
	switch val := v.(type) {
	case int64:
		return val
	case float64:
		return int64(val)
	case int:
		return int64(val)
	default:
		return 0
	}
}
