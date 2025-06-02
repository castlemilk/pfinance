#!/bin/bash

set -e

PROJECT_ID="pfinance-app-1748773335"

echo "🔐 Setting up Firebase secrets in Secret Manager"
echo "=============================================="
echo ""

# Function to create or update a secret
create_or_update_secret() {
  SECRET_NAME=$1
  SECRET_VALUE=$2
  
  # Check if secret exists
  if gcloud secrets describe $SECRET_NAME --project=$PROJECT_ID >/dev/null 2>&1; then
    echo "Updating existing secret: $SECRET_NAME"
    echo -n "$SECRET_VALUE" | gcloud secrets versions add $SECRET_NAME --data-file=- --project=$PROJECT_ID
  else
    echo "Creating new secret: $SECRET_NAME"
    echo -n "$SECRET_VALUE" | gcloud secrets create $SECRET_NAME --data-file=- --replication-policy="automatic" --project=$PROJECT_ID
  fi
}

# Prompt for Firebase configuration values
echo "Please enter your Firebase configuration values:"
echo "(You can find these in the Firebase Console > Project Settings)"
echo ""

read -p "Firebase API Key: " FIREBASE_API_KEY
read -p "Firebase Messaging Sender ID: " FIREBASE_MESSAGING_SENDER_ID
read -p "Firebase App ID: " FIREBASE_APP_ID

# Create secrets
echo ""
echo "📝 Creating secrets in Secret Manager..."

create_or_update_secret "firebase-api-key" "$FIREBASE_API_KEY"
create_or_update_secret "firebase-messaging-sender-id" "$FIREBASE_MESSAGING_SENDER_ID"
create_or_update_secret "firebase-app-id" "$FIREBASE_APP_ID"

# Grant the service account access to read secrets
echo ""
echo "🔑 Granting service account access to secrets..."

for SECRET in "firebase-api-key" "firebase-messaging-sender-id" "firebase-app-id"; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:github-actions@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" \
    --project=$PROJECT_ID
done

# Also grant the App Engine/Cloud Run service account access
DEFAULT_SERVICE_ACCOUNT="$PROJECT_ID@appspot.gserviceaccount.com"

for SECRET in "firebase-api-key" "firebase-messaging-sender-id" "firebase-app-id"; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:$DEFAULT_SERVICE_ACCOUNT" \
    --role="roles/secretmanager.secretAccessor" \
    --project=$PROJECT_ID
done

echo ""
echo "✅ Secrets setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Add these secrets to your GitHub repository:"
echo "   - FIREBASE_API_KEY"
echo "   - FIREBASE_MESSAGING_SENDER_ID"
echo "   - FIREBASE_APP_ID"
echo ""
echo "2. The secrets are also available in Google Secret Manager for Firebase App Hosting"