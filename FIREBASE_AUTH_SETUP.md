# Firebase Authentication Setup

## Fix Authentication Issues

The error shows that Firebase is trying to use an iframe with a malformed URL (contains newline characters). To fix this:

### 1. Update Firebase Authorized Domains

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `pfinance-app-1748773335`
3. Go to **Authentication** → **Settings** → **Authorized domains**
4. Add these domains:
   - `pfinance.vercel.app`
   - `pfinance-*.vercel.app` (for preview deployments)
   - `*.vercel.app` (if needed for all Vercel deployments)
   - `localhost` (for local development)

### 2. Check OAuth Redirect URIs

1. In Firebase Console, go to **Authentication** → **Sign-in method**
2. Click on **Google** provider
3. Ensure it's enabled
4. Check the **Web SDK configuration**
5. Make sure the Web client ID is correct

### 3. Update Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Go to **APIs & Services** → **Credentials**
4. Find your OAuth 2.0 Client ID for web
5. Add authorized JavaScript origins:
   - `https://pfinance.vercel.app`
   - `https://pfinance-*.vercel.app`
   - `http://localhost:1234` (for local dev)
6. Add authorized redirect URIs:
   - `https://pfinance.vercel.app/__/auth/handler`
   - `https://pfinance-*.vercel.app/__/auth/handler`

### 4. Environment Variable Issues

The newline character in the URL suggests the environment variable might have extra whitespace. Check in Vercel:

```bash
cd web
vercel env pull .env.local
```

Then check `.env.local` for any extra whitespace or newlines in the values.

### Modern Authentication Best Practices

The updated code now:
- Uses `signInWithPopup` instead of iframe-based auth
- Adds proper error handling
- Sets persistence to browserLocalPersistence
- Checks if Firebase is initialized before using
- Adds proper scopes for Google auth

### Testing

After making these changes:
1. Clear your browser cache and cookies
2. Try signing in again
3. Check the browser console for any errors