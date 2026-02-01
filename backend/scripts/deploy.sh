#!/bin/bash

set -e

# Configuration
PROJECT_ID="pfinance-app-1748773335"
REGION="us-central1"
SERVICE_NAME="pfinance-backend"
IMAGE_NAME="gcr.io/$PROJECT_ID/$SERVICE_NAME"

echo "🚀 Deploying PFinance Backend to Cloud Run"
echo "==========================================="

echo ""
echo "☁️  Building and deploying to Cloud Run..."

# Deploy directly from source (handles building automatically)
gcloud run deploy $SERVICE_NAME \
  --source . \
  --region $REGION \
  --project $PROJECT_ID \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --max-instances 10 \
  --set-env-vars GOOGLE_CLOUD_PROJECT=$PROJECT_ID \
  --quiet

echo ""
echo "🔗 Getting service URL..."

# Get service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
  --region $REGION \
  --project $PROJECT_ID \
  --format 'value(status.url)')

echo ""
echo "✅ Deployment successful!"
echo "🌐 Service URL: $SERVICE_URL"
echo "🚀 API Endpoint: $SERVICE_URL/v1"
echo ""
echo "🧪 Testing deployment..."

# Wait for deployment to be ready
sleep 10

# Test health endpoint
if curl -f $SERVICE_URL/health > /dev/null 2>&1; then
  echo "✅ Health check passed"
else
  echo "❌ Health check failed"
  exit 1
fi

echo ""
echo "🎉 Backend is live and ready!"
echo "📍 API Base URL: $SERVICE_URL"