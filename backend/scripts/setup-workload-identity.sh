#!/bin/bash

set -e

# Configuration
PROJECT_ID="pfinance-app-1748773335"
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
POOL_NAME="github-pool"
PROVIDER_NAME="github-provider"
SERVICE_ACCOUNT_NAME="github-actions"
REPO_OWNER="castlemilk"  # Replace with your GitHub username/org
REPO_NAME="pfinance"

echo "🔐 Setting up Workload Identity Federation for GitHub Actions"
echo "============================================================="
echo ""
echo "Project ID: $PROJECT_ID"
echo "Project Number: $PROJECT_NUMBER"
echo ""

# Enable required APIs
echo "📡 Enabling required APIs..."
gcloud services enable iamcredentials.googleapis.com --project $PROJECT_ID
gcloud services enable cloudresourcemanager.googleapis.com --project $PROJECT_ID
gcloud services enable iam.googleapis.com --project $PROJECT_ID
gcloud services enable run.googleapis.com --project $PROJECT_ID
gcloud services enable containerregistry.googleapis.com --project $PROJECT_ID

# Create service account
echo ""
echo "👤 Creating service account..."
gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \
  --display-name="GitHub Actions Service Account" \
  --project $PROJECT_ID || echo "Service account already exists"

SERVICE_ACCOUNT_EMAIL="$SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com"
echo "Service Account: $SERVICE_ACCOUNT_EMAIL"

# Grant necessary permissions to the service account
echo ""
echo "🔑 Granting permissions to service account..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
  --role="roles/storage.admin"

# Create workload identity pool
echo ""
echo "🏊 Creating Workload Identity Pool..."
gcloud iam workload-identity-pools create $POOL_NAME \
  --location="global" \
  --display-name="GitHub Actions Pool" \
  --project $PROJECT_ID || echo "Pool already exists"

# Create workload identity provider
echo ""
echo "🔗 Creating Workload Identity Provider..."
gcloud iam workload-identity-pools providers create-oidc $PROVIDER_NAME \
  --location="global" \
  --workload-identity-pool=$POOL_NAME \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository=='$REPO_OWNER/$REPO_NAME'" \
  --project $PROJECT_ID || echo "Provider already exists"

# Get the workload identity provider resource name
WORKLOAD_IDENTITY_PROVIDER="projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL_NAME/providers/$PROVIDER_NAME"

# Grant the service account permissions to be impersonated by the workload identity
echo ""
echo "🔐 Configuring service account impersonation..."
gcloud iam service-accounts add-iam-policy-binding $SERVICE_ACCOUNT_EMAIL \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL_NAME/attribute.repository/$REPO_OWNER/$REPO_NAME" \
  --role="roles/iam.workloadIdentityUser" \
  --project $PROJECT_ID

echo ""
echo "✅ Workload Identity Federation setup complete!"
echo ""
echo "📋 Add these to your GitHub repository secrets/variables:"
echo "WORKLOAD_IDENTITY_PROVIDER: $WORKLOAD_IDENTITY_PROVIDER"
echo "SERVICE_ACCOUNT: $SERVICE_ACCOUNT_EMAIL"
echo ""
echo "🔧 Update your workflow file with:"
echo "env:"
echo "  WORKLOAD_IDENTITY_PROVIDER: $WORKLOAD_IDENTITY_PROVIDER"
echo "  SERVICE_ACCOUNT: $SERVICE_ACCOUNT_EMAIL"