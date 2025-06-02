# GitHub Actions Deployment Setup

This workflow uses Workload Identity Federation to securely deploy to Google Cloud Run without storing service account keys.

## Prerequisites

1. Run the setup script to configure Workload Identity Federation:
   ```bash
   cd backend/scripts
   ./setup-workload-identity.sh
   ```

2. The script will output the values for:
   - `WORKLOAD_IDENTITY_PROVIDER`
   - `SERVICE_ACCOUNT`

3. Update the workflow file with these values or add them as GitHub repository variables.

## Manual Setup (if needed)

If you need to set up Workload Identity Federation manually:

1. Get your project number:
   ```bash
   gcloud projects describe pfinance-app-1748773335 --format="value(projectNumber)"
   ```

2. Update the `WORKLOAD_IDENTITY_PROVIDER` in the workflow file:
   ```
   projects/YOUR_PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider
   ```

## Workflow Features

- **Automatic deployment** on push to main branch
- **Test runs** on pull requests
- **Workload Identity Federation** for secure authentication
- **Cloud Run deployment** with health checks
- **Docker image versioning** using git SHA

## Troubleshooting

If the deployment fails with authentication errors:

1. Ensure the Workload Identity Federation is properly configured
2. Check that the service account has the necessary permissions
3. Verify the repository attribute condition matches your repo