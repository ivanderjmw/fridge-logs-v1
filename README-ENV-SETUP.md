# Environment Variables Setup

## ✅ What Was Configured

Your sensitive Firebase configuration has been moved to environment variables:

1. **`.env.local`** - Contains your actual Firebase credentials (already configured)
2. **`.env.example`** - Template for other developers
3. **`src/firebase.js`** - Updated to use environment variables via `import.meta.env`
4. **`vite.config.js`** - Configured to expose environment variables during build
5. **Build scripts** - PowerShell and Bash scripts for easy deployment

## 🚀 Quick Start

### Local Development

Just run:
```bash
npm run dev
```

Your `.env.local` file is already set up and will be automatically loaded by Vite.

### Deploy to Firebase

**Windows:**
```bash
npm run deploy
```

**Linux/Mac:**
```bash
npm run deploy:bash
```

Or manually:
```bash
# Windows PowerShell
.\build-and-deploy.ps1

# Linux/Mac
chmod +x build-and-deploy.sh
./build-and-deploy.sh
```

## 📋 Environment Variables

All variables use the `VITE_` prefix so they're accessible in your client-side code:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID`

## 🔒 Security

- ✅ `.env.local` is in `.gitignore` - your credentials won't be committed
- ✅ Firebase API keys are safe for client-side use (protected by Firebase Security Rules)
- ✅ `.env.example` provides a template without actual credentials

## 🔧 CI/CD Setup (Optional)

### GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Firebase Hosting

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - run: npm ci
      
      - name: Build
        env:
          VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.VITE_FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_PROJECT_ID: ${{ secrets.VITE_FIREBASE_PROJECT_ID }}
          VITE_FIREBASE_STORAGE_BUCKET: ${{ secrets.VITE_FIREBASE_STORAGE_BUCKET }}
          VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.VITE_FIREBASE_MESSAGING_SENDER_ID }}
          VITE_FIREBASE_APP_ID: ${{ secrets.VITE_FIREBASE_APP_ID }}
          VITE_FIREBASE_MEASUREMENT_ID: ${{ secrets.VITE_FIREBASE_MEASUREMENT_ID }}
        run: npm run build
      
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: ${{ secrets.GITHUB_TOKEN }}
          firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          channelId: live
          projectId: fridge-logs
```

Add your environment variables as secrets in GitHub:
- Go to Repository Settings → Secrets and variables → Actions
- Add each `VITE_*` variable from your `.env.local`

## 🧪 Verification

Test that environment variables are loading:

```javascript
// In browser console after running `npm run dev`
console.log(import.meta.env.VITE_FIREBASE_PROJECT_ID); 
// Should output: "fridge-logs"
```

## 📚 Additional Resources

- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)
- [Firebase Hosting](https://firebase.google.com/docs/hosting)
- [SvelteKit Environment Variables](https://kit.svelte.dev/docs/modules#$env-static-public)
