// Package extraction provides document extraction capabilities using ML models.
package extraction

import (
	"regexp"
	"strings"

	"golang.org/x/text/cases"
	"golang.org/x/text/language"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

// MerchantInfo contains normalized merchant information.
type MerchantInfo struct {
	Name       string
	Category   pfinancev1.ExpenseCategory
	Confidence float64
}

// merchantMappings maps known merchant keywords to normalized names and categories.
var merchantMappings = map[string]MerchantInfo{
	// Grocery stores
	"woolworths":  {Name: "Woolworths", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, Confidence: 0.95},
	"coles":       {Name: "Coles", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, Confidence: 0.95},
	"aldi":        {Name: "Aldi", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, Confidence: 0.95},
	"costco":      {Name: "Costco", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, Confidence: 0.95},
	"iga":         {Name: "IGA", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, Confidence: 0.95},
	"whole foods": {Name: "Whole Foods", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, Confidence: 0.95},
	"trader joe":  {Name: "Trader Joe's", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, Confidence: 0.95},

	// Fast food & restaurants
	"mcdonalds":   {Name: "McDonald's", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, Confidence: 0.95},
	"mcdonald's":  {Name: "McDonald's", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, Confidence: 0.95},
	"starbucks":   {Name: "Starbucks", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, Confidence: 0.95},
	"subway":      {Name: "Subway", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, Confidence: 0.95},
	"kfc":         {Name: "KFC", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, Confidence: 0.95},
	"burger king": {Name: "Burger King", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, Confidence: 0.95},
	"dominos":     {Name: "Domino's", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, Confidence: 0.95},
	"pizza hut":   {Name: "Pizza Hut", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, Confidence: 0.95},

	// Food delivery
	"uber eats": {Name: "Uber Eats", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, Confidence: 0.95},
	"doordash":  {Name: "DoorDash", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, Confidence: 0.95},
	"deliveroo": {Name: "Deliveroo", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, Confidence: 0.95},
	"menulog":   {Name: "Menulog", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, Confidence: 0.95},
	"grubhub":   {Name: "Grubhub", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, Confidence: 0.95},

	// Transportation
	"uber":    {Name: "Uber", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION, Confidence: 0.95},
	"lyft":    {Name: "Lyft", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION, Confidence: 0.95},
	"didi":    {Name: "DiDi", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION, Confidence: 0.95},
	"shell":   {Name: "Shell", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION, Confidence: 0.95},
	"bp":      {Name: "BP", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION, Confidence: 0.95},
	"caltex":  {Name: "Caltex", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION, Confidence: 0.95},
	"ampol":   {Name: "Ampol", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION, Confidence: 0.95},
	"chevron": {Name: "Chevron", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION, Confidence: 0.95},
	"exxon":   {Name: "Exxon", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION, Confidence: 0.95},
	"opal":    {Name: "Opal Card", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION, Confidence: 0.95},
	"myki":    {Name: "Myki", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION, Confidence: 0.95},

	// Entertainment
	"netflix":         {Name: "Netflix", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT, Confidence: 0.95},
	"spotify":         {Name: "Spotify", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT, Confidence: 0.95},
	"disney+":         {Name: "Disney+", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT, Confidence: 0.95},
	"hulu":            {Name: "Hulu", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT, Confidence: 0.95},
	"amazon prime":    {Name: "Amazon Prime", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT, Confidence: 0.95},
	"hbo max":         {Name: "HBO Max", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT, Confidence: 0.95},
	"youtube premium": {Name: "YouTube Premium", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT, Confidence: 0.95},

	// Shopping
	"amazon":   {Name: "Amazon", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING, Confidence: 0.95},
	"ebay":     {Name: "eBay", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING, Confidence: 0.95},
	"target":   {Name: "Target", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING, Confidence: 0.95},
	"walmart":  {Name: "Walmart", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING, Confidence: 0.95},
	"ikea":     {Name: "IKEA", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING, Confidence: 0.95},
	"bunnings": {Name: "Bunnings", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING, Confidence: 0.95},
	"jb hi-fi": {Name: "JB Hi-Fi", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING, Confidence: 0.95},

	// Healthcare
	"chemist warehouse": {Name: "Chemist Warehouse", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HEALTHCARE, Confidence: 0.95},
	"priceline":         {Name: "Priceline Pharmacy", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HEALTHCARE, Confidence: 0.95},
	"cvs":               {Name: "CVS Pharmacy", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HEALTHCARE, Confidence: 0.95},
	"walgreens":         {Name: "Walgreens", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HEALTHCARE, Confidence: 0.95},

	// Utilities
	"telstra":  {Name: "Telstra", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES, Confidence: 0.95},
	"optus":    {Name: "Optus", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES, Confidence: 0.95},
	"vodafone": {Name: "Vodafone", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES, Confidence: 0.95},
	"verizon":  {Name: "Verizon", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES, Confidence: 0.95},
	"at&t":     {Name: "AT&T", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES, Confidence: 0.95},
	"t-mobile": {Name: "T-Mobile", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES, Confidence: 0.95},
	"comcast":  {Name: "Comcast", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES, Confidence: 0.95},

	// Travel
	"airbnb":      {Name: "Airbnb", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRAVEL, Confidence: 0.95},
	"booking.com": {Name: "Booking.com", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRAVEL, Confidence: 0.95},
	"expedia":     {Name: "Expedia", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRAVEL, Confidence: 0.95},
	"qantas":      {Name: "Qantas", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRAVEL, Confidence: 0.95},
	"marriott":    {Name: "Marriott", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRAVEL, Confidence: 0.95},
	"hilton":      {Name: "Hilton", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRAVEL, Confidence: 0.95},
}

// categoryKeywords maps generic keywords to categories for fallback.
var categoryKeywords = map[string]pfinancev1.ExpenseCategory{
	"restaurant": pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
	"cafe":       pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
	"coffee":     pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
	"grocer":     pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
	"market":     pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
	"bakery":     pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
	"pizza":      pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
	"sushi":      pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,

	"fuel":    pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION,
	"petrol":  pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION,
	"parking": pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION,
	"toll":    pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION,
	"taxi":    pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION,
	"train":   pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION,
	"bus":     pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION,

	"cinema":  pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT,
	"movie":   pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT,
	"theatre": pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT,
	"concert": pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT,
	"gaming":  pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT,

	"store":       pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING,
	"shop":        pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING,
	"electronics": pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING,
	"clothing":    pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING,

	"pharmacy": pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HEALTHCARE,
	"chemist":  pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HEALTHCARE,
	"doctor":   pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HEALTHCARE,
	"medical":  pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HEALTHCARE,
	"dental":   pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HEALTHCARE,
	"hospital": pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HEALTHCARE,

	"electric":  pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES,
	"internet":  pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES,
	"phone":     pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES,
	"mobile":    pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES,
	"broadband": pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES,

	"hotel":   pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRAVEL,
	"flight":  pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRAVEL,
	"airline": pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRAVEL,
	"airport": pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRAVEL,

	"rent":     pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HOUSING,
	"mortgage": pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HOUSING,
	"lease":    pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HOUSING,

	"school":     pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_EDUCATION,
	"university": pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_EDUCATION,
	"college":    pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_EDUCATION,
	"tuition":    pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_EDUCATION,
	"course":     pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_EDUCATION,
}

var (
	// Patterns for cleaning merchant names
	prefixPattern = regexp.MustCompile(`(?i)^(pos |eftpos |visa |mastercard |amex |paypal \*)`)
	suffixPattern = regexp.MustCompile(`(?i)\s+(pty|ltd|inc|corp|llc|au|us|uk|nz|sg)\.?$`)
	longNumbers   = regexp.MustCompile(`\d{6,}`)
	specialChars  = regexp.MustCompile(`[*#]+`)
)

// NormalizeMerchant normalizes a merchant name and determines its category.
func NormalizeMerchant(rawMerchant string) MerchantInfo {
	lower := strings.ToLower(strings.TrimSpace(rawMerchant))

	// Clean the merchant name
	cleaned := prefixPattern.ReplaceAllString(lower, "")
	cleaned = suffixPattern.ReplaceAllString(cleaned, "")
	cleaned = longNumbers.ReplaceAllString(cleaned, "")
	cleaned = specialChars.ReplaceAllString(cleaned, "")
	cleaned = strings.TrimSpace(cleaned)

	// Check for direct mapping first
	for key, info := range merchantMappings {
		if strings.Contains(cleaned, key) || strings.Contains(key, cleaned) {
			return info
		}
	}

	// Check for partial word matches
	for key, info := range merchantMappings {
		words := strings.Fields(key)
		for _, word := range words {
			if len(word) > 3 && strings.Contains(cleaned, word) {
				return MerchantInfo{
					Name:       info.Name,
					Category:   info.Category,
					Confidence: 0.8, // Lower confidence for partial match
				}
			}
		}
	}

	// Fall back to keyword-based categorization
	for keyword, category := range categoryKeywords {
		if strings.Contains(cleaned, keyword) {
			return MerchantInfo{
				Name:       formatMerchantName(rawMerchant),
				Category:   category,
				Confidence: 0.6,
			}
		}
	}

	// Default: clean the name, mark as Other
	return MerchantInfo{
		Name:       formatMerchantName(rawMerchant),
		Category:   pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER,
		Confidence: 0.3,
	}
}

// formatMerchantName formats a raw merchant name for display.
func formatMerchantName(raw string) string {
	// Clean up the raw name
	cleaned := prefixPattern.ReplaceAllString(raw, "")
	cleaned = suffixPattern.ReplaceAllString(cleaned, "")
	cleaned = longNumbers.ReplaceAllString(cleaned, "")
	cleaned = specialChars.ReplaceAllString(cleaned, "")
	cleaned = strings.TrimSpace(cleaned)

	// Title case each word
	caser := cases.Title(language.English)
	words := strings.Fields(cleaned)
	for i, word := range words {
		if len(word) > 2 {
			words[i] = caser.String(strings.ToLower(word))
		} else {
			words[i] = strings.ToUpper(word)
		}
	}

	result := strings.Join(words, " ")
	if len(result) > 50 {
		result = result[:50]
	}

	return result
}

// CategoryToString converts a category enum to a display string.
func CategoryToString(cat pfinancev1.ExpenseCategory) string {
	switch cat {
	case pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD:
		return "Food"
	case pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HOUSING:
		return "Housing"
	case pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION:
		return "Transportation"
	case pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT:
		return "Entertainment"
	case pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HEALTHCARE:
		return "Healthcare"
	case pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES:
		return "Utilities"
	case pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING:
		return "Shopping"
	case pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_EDUCATION:
		return "Education"
	case pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRAVEL:
		return "Travel"
	default:
		return "Other"
	}
}
