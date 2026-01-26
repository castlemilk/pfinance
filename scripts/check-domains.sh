#!/bin/bash

# Domain Availability Checker for PFinance App
# Uses whois to check domain availability

echo "🌐 Domain Availability Checker for Personal Finance App"
echo "========================================================"
echo ""

# List of domain suggestions
domains=(
    # pfinance variants
    "pfinance.app"
    "pfinance.io"
    "pfinance.co"
    "pfinance.dev"
    "getpfinance.com"
    "mypfinance.com"
    
    # picofinance variants
    "picofinance.app"
    "picofinance.io"
    "picofinance.co"
    
    # Simple/catchy names
    "finpico.app"
    "finpico.io"
    "myfinpico.com"
    
    # Money/budget themed
    "pennypilot.app"
    "pennypilot.io"
    "budgetpico.app"
    "budgetpico.io"
    
    # Tracker themed
    "fintrack.app"
    "fintracker.io"
    "trackpenny.app"
    
    # Short/catchy
    "centsible.app"
    "centsible.io"
    "wealthpico.app"
    "splitly.app"
    "splitcents.app"
)

# Function to check domain availability
check_domain() {
    local domain=$1
    
    # Extract TLD
    local tld="${domain##*.}"
    
    # Use whois to check - different TLDs have different responses
    local result=$(whois "$domain" 2>/dev/null)
    
    # Common "not found" patterns across registrars
    if echo "$result" | grep -qi "No match\|NOT FOUND\|No Data Found\|AVAILABLE\|No entries found\|Domain not found\|Status: free"; then
        echo "✅ AVAILABLE: $domain"
        return 0
    elif echo "$result" | grep -qi "Domain Status:\|Registrant\|Creation Date\|Domain Name:.*$domain"; then
        echo "❌ TAKEN:     $domain"
        return 1
    else
        # For some TLDs, whois might not work well - try dig as backup
        local dig_result=$(dig +short "$domain" 2>/dev/null)
        if [ -z "$dig_result" ]; then
            echo "❓ UNKNOWN:   $domain (check manually)"
        else
            echo "❌ TAKEN:     $domain"
        fi
        return 2
    fi
}

# Check all domains
echo "Checking ${#domains[@]} domain suggestions..."
echo ""

available=()
taken=()
unknown=()

for domain in "${domains[@]}"; do
    result=$(check_domain "$domain")
    echo "$result"
    
    if [[ "$result" == *"AVAILABLE"* ]]; then
        available+=("$domain")
    elif [[ "$result" == *"TAKEN"* ]]; then
        taken+=("$domain")
    else
        unknown+=("$domain")
    fi
    
    # Small delay to avoid rate limiting
    sleep 0.5
done

# Summary
echo ""
echo "========================================================"
echo "📊 Summary"
echo "========================================================"
echo ""
echo "✅ Available (${#available[@]}):"
for d in "${available[@]}"; do
    echo "   - $d"
done

echo ""
echo "❌ Taken (${#taken[@]}):"
for d in "${taken[@]}"; do
    echo "   - $d"
done

echo ""
echo "❓ Unknown - check manually (${#unknown[@]}):"
for d in "${unknown[@]}"; do
    echo "   - $d"
done

echo ""
echo "💡 Tip: For .app and .dev domains, check at https://get.app or https://get.dev"
echo "💡 For registration: Namecheap, Google Domains (now Squarespace), or Cloudflare Registrar"
