# R2 Explorer Template

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/r2-explorer-template)

![R2 Explorer Template Preview](https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/e3c4ab7e-43f2-49df-6317-437f4ae8ce00/public)

A **Google Drive-like interface** for Cloudflare R2 storage with secure file sharing and comprehensive API access.

## ✨ Features

### 🔒 **Dual Authentication System**
- **Web Interface**: Basic Auth for human users
- **API Access**: Bearer Token for applications
- Secure file sharing with signed temporary URLs

### 📁 **File Management**
- Drag-and-drop uploads with auto-generated share links
- Multi-part upload for large files
- Folder creation and organization
- In-browser preview (PDF, images, text, markdown, CSV)
- Right-click context menu with advanced options

### 🔗 **Smart File Sharing**
- **Protected API**: Requires Bearer token, full access control
- **Signed URLs**: Temporary links with expiration and signature validation
- **Public R2**: Optional CDN-accelerated public access
- Separate preview and download URLs for all sharing methods

### 📧 **Email Integration**
- Process emails via Cloudflare Email Routing
- View email attachments in the interface

## 🚀 Quick Start

### 1. Create Project
```bash
npm create cloudflare@latest -- --template=cloudflare/templates/r2-explorer-template
cd your-project-name
npm install
```

### 2. Setup R2 Bucket
```bash
npx wrangler r2 bucket create r2-explorer-bucket
```

### 3. Configure Security (Required)
Set up environment variables in [Cloudflare Dashboard](https://dash.cloudflare.com):

Go to **Workers & Pages** → Your Worker → **Settings** → **Variables & Secrets**:

| Variable | Type | Description | Example |
|----------|------|-------------|---------|
| `ADMIN_USERNAME` | Text | Web interface username | `admin` |
| `ADMIN_PASSWORD` | **Secret** | Web interface password | `your-secure-password` |
| `API_TOKEN` | **Secret** | API access token | `sk-prod-your-secure-token` |

**⚠️ Important**: Use **Secret** type for passwords and tokens, never hardcode them in `wrangler.json`.

### 4. Deploy
```bash
npx wrangler deploy
```

### 5. Enable File Operations
Edit `src/index.ts` and change `readonly: false` to enable uploads, deletions, and modifications.

## 🔑 API Usage

### Authentication
- **Web Interface**: Basic Auth with username/password
- **API Calls**: `Authorization: Bearer YOUR_API_TOKEN`

### File Upload (Auto-generates Share Links)
```bash
curl -X PUT \
     -H "Authorization: Bearer YOUR_API_TOKEN" \
     -H "Content-Type: application/octet-stream" \
     --data-binary @your-file.jpg \
     https://your-worker.workers.dev/api/buckets/bucket/your-file.jpg
```

**Response includes share links:**
```json
{
  "success": true,
  "filename": "your-file.jpg",
  "share_urls": {
    "protected": {
      "view": "https://your-worker.workers.dev/api/buckets/bucket/your-file.jpg",
      "download": "https://your-worker.workers.dev/api/buckets/bucket/your-file.jpg?download=true"
    },
    "signed": {
      "view": "https://your-worker.workers.dev/share/your-file.jpg?signature=...&expires=...",
      "download": "https://your-worker.workers.dev/share/your-file.jpg?signature=...&expires=...&download=true",
      "expires_at": "2024-01-01T12:00:00.000Z"
    }
  }
}
```

### File Access Methods

#### 1. Protected API (Requires Token)
```bash
# Preview file
curl -H "Authorization: Bearer TOKEN" \
     https://your-worker.workers.dev/api/buckets/bucket/file.jpg

# Force download
curl -H "Authorization: Bearer TOKEN" \
     https://your-worker.workers.dev/api/buckets/bucket/file.jpg?download=true
```

#### 2. Signed Temporary URLs (Secure Sharing)
```bash
# Generate share links
curl -X POST \
     -H "Authorization: Bearer TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"filename": "file.jpg", "expires_in": 3600}' \
     https://your-worker.workers.dev/api/share
```

**Access without authentication:**
- Preview: `https://your-worker.workers.dev/share/file.jpg?signature=...&expires=...`
- Download: `https://your-worker.workers.dev/share/file.jpg?signature=...&expires=...&download=true`

#### 3. Public R2 Access (Optional CDN)
Configure R2 custom domain for public files:
1. Set up custom domain in Cloudflare Dashboard
2. Add `R2_CUSTOM_DOMAIN` environment variable
3. Enable public bucket access

## 🏗️ Architecture

### File Sharing Flow
```
┌─────────────────┐    ┌──────────────┐    ┌─────────────────┐
│   Client App    │───▶│ Worker API   │───▶│   R2 Bucket     │
│                 │    │ (Auth+Proxy) │    │                 │
└─────────────────┘    └──────────────┘    └─────────────────┘
                              │                     ▲
                              │                     │
                              ▼                     │
                       ┌──────────────┐             │
                       │ Share Links  │             │
                       └──────────────┘             │
                              │                     │
                              ▼                     │
                       ┌──────────────────────────────┴─┐
                       │    R2 Custom Domain            │
                       │ https://files.yourdomain.com   │
                       │ (Public, CDN-accelerated)      │
                       └────────────────────────────────┘
```

### Security Layers
1. **Protected API**: Bearer token authentication, full logging
2. **Signed URLs**: HMAC-SHA256 signatures, time-limited access  
3. **Public R2**: Optional direct R2 access with CDN performance

## 📚 Complete API Reference

### File Operations
```bash
# List files
curl -H "Authorization: Bearer TOKEN" \
     https://your-worker.workers.dev/api/buckets/bucket/

# Delete file
curl -X DELETE \
     -H "Authorization: Bearer TOKEN" \
     https://your-worker.workers.dev/api/buckets/bucket/file.jpg
```

### JavaScript Integration
```javascript
const API_TOKEN = 'your-api-token';
const API_BASE = 'https://your-worker.workers.dev';

// Upload file and get share links automatically
async function uploadFile(file, filename) {
  const response = await fetch(`${API_BASE}/api/buckets/bucket/${filename}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': file.type
    },
    body: file
  });
  
  const result = await response.json();
  return result.share_urls; // All sharing options included
}

// Use the share links
const shareUrls = await uploadFile(file, 'document.pdf');
console.log('Preview:', shareUrls.signed.view);
console.log('Download:', shareUrls.signed.download);
```

## 🔧 Advanced Deployment

### Using Wrangler CLI
```bash
# Set secrets securely
wrangler secret put ADMIN_PASSWORD
wrangler secret put API_TOKEN

# Set public variables
wrangler vars set ADMIN_USERNAME admin

# Deploy
wrangler deploy
```

### GitHub Actions
Add secrets to your repository and use this workflow:

```yaml
name: Deploy
on: [push]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: |
          echo "${{ secrets.ADMIN_PASSWORD }}" | wrangler secret put ADMIN_PASSWORD
          echo "${{ secrets.API_TOKEN }}" | wrangler secret put API_TOKEN
          wrangler vars set ADMIN_USERNAME admin
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      - run: wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

## 🛡️ Security Best Practices

### For Web Interface
- Use strong passwords for admin accounts
- Enable Cloudflare Access for additional protection
- Monitor access logs regularly

### For API Integration  
- Rotate API tokens regularly
- Use different tokens for different environments
- Implement rate limiting in production
- Monitor API usage and set up alerts

### For File Sharing
- **Sensitive files**: Use protected API with token authentication
- **Temporary sharing**: Use signed URLs with appropriate expiration
- **Public content**: Only use R2 public access for truly public files

## 🎯 Use Cases

### 1. Private Document Sharing
Upload documents and generate time-limited share links for external users.

### 2. API-First File Storage
Integrate with your applications using the comprehensive REST API.

### 3. Media Asset Management
Store and serve images, videos with CDN acceleration via R2 public access.

### 4. Backup and Archive
Secure file storage with multiple access methods and granular permissions.

## 🔍 Troubleshooting

### Environment Variables Not Found
- Check Cloudflare Dashboard → Workers → Settings → Variables & Secrets
- Ensure secrets are marked as "Secret" type, not "Text"
- Verify variable names match exactly

### Authentication Failures
- Confirm API token format (recommend `sk-` prefix)
- Check Authorization header: `Bearer YOUR-TOKEN`
- Verify token has not expired

### File Access Issues  
- Signed URLs: Check signature and expiration parameters
- Protected API: Verify Bearer token in request headers
- Public R2: Ensure bucket public access is enabled

## 📖 Documentation

- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Live Demo](https://demo.r2explorer.com)

---

**Ready to use?** Deploy with one click or follow the quick start guide above!