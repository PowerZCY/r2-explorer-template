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
| `SHARE_LINK_EXPIRES_HOURS` | Text | Share link expiry time in hours | `24` (default), `72`, `168` |

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

**⏰ Share Link Expiry Configuration:**
- **Default**: 24 hours
- **Environment Variable**: `SHARE_LINK_EXPIRES_HOURS` (in hours)
- **API Override**: Use `expires_in` parameter (in seconds) to override default
- **Examples**: 
  - `SHARE_LINK_EXPIRES_HOURS=72` for 3 days
  - `SHARE_LINK_EXPIRES_HOURS=168` for 1 week
  - API: `{"expires_in": 7200}` for 2 hours

#### 3. Public R2 Access (Optional CDN)
Configure R2 custom domain for public files:
1. Set up custom domain in Cloudflare Dashboard
2. Add `R2_CUSTOM_DOMAIN` environment variable
3. Enable public bucket access

## 🪣 多存储桶支持

### 配置多个存储桶

在 `wrangler.json` 中配置多个R2存储桶绑定：

```json
{
  "r2_buckets": [
    {
      "binding": "bucket",
      "bucket_name": "r2-explorer-bucket",
      "preview_bucket_name": "r2-explorer-bucket"
    },
    {
      "binding": "bucket_newspaper",
      "bucket_name": "newspaper-assets",
      "preview_bucket_name": "newspaper-assets-preview"
    },
    {
      "binding": "bucket_aspect", 
      "bucket_name": "aspect-assets",
      "preview_bucket_name": "aspect-assets-preview"
    }
  ]
}
```

### 环境变量配置

为每个存储桶配置独立的API访问令牌和自定义域名，实现安全隔离：

```bash
# 默认桶的API令牌 (向后兼容)
BUCKET_DEFAULT_API_TOKEN=sk-bucket-default-xxxx
BUCKET_DEFAULT_CUSTOM_DOMAIN=files.example.com

# 各个桶的独立API令牌和自定义域名
BUCKET_NEWSPAPER_API_TOKEN=sk-newspaper-xxxx
BUCKET_NEWSPAPER_CUSTOM_DOMAIN=assets.newspaper.com

BUCKET_ASPECT_API_TOKEN=sk-aspect-xxxx
BUCKET_ASPECT_CUSTOM_DOMAIN=cdn.aspect.dev

# 页面管理员认证 (对所有桶通用)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password

# 全局R2自定义域名 (向后兼容，建议使用桶级别配置)
R2_CUSTOM_DOMAIN=legacy.example.com
```

### API路由格式

使用新的桶特定路由格式：

```
/api/buckets/{bucketName}/upload          # 文件上传
/api/buckets/{bucketName}/files           # 文件列表  
/api/buckets/{bucketName}/share           # 生成分享链接
/api/buckets/{bucketName}/metadata        # 文件元数据
/api/buckets/{bucketName}/{filename}      # 文件访问
```

**可用的桶名称：**

- `bucket` - 默认桶 (r2-explorer-bucket)
- `bucket_newspaper` - 新闻网站资源桶 (newspaper-assets)
- `bucket_aspect` - Aspect网站资源桶 (aspect-assets)

**示例：**
```bash
# 使用绑定名称访问不同的桶
curl "/api/buckets/bucket/files"               # 默认桶
curl "/api/buckets/bucket_newspaper/files"     # 新闻桶  
curl "/api/buckets/bucket_aspect/files"        # Aspect桶
```

### 使用示例

#### 1. 上传文件到特定桶

```bash
# 上传到 newspaper 桶
curl -X PUT "https://your-worker.dev/api/buckets/bucket_newspaper/news-image.jpg" \
  -H "Authorization: Bearer sk-newspaper-xxxx" \
  -H "Content-Type: image/jpeg" \
  --data-binary @news-image.jpg

# 上传到 aspect 桶
curl -X PUT "https://your-worker.dev/api/buckets/bucket_aspect/banner.png" \
  -H "Authorization: Bearer sk-aspect-xxxx" \
  -H "Content-Type: image/png" \
  --data-binary @banner.png
```

#### 2. 列出特定桶的文件

```bash
# 列出 newspaper 桶的文件
curl "https://your-worker.dev/api/buckets/bucket_newspaper/files" \
  -H "Authorization: Bearer sk-newspaper-xxxx"

# 列出 aspect 桶的文件
curl "https://your-worker.dev/api/buckets/bucket_aspect/files" \
  -H "Authorization: Bearer sk-aspect-xxxx"
```

#### 3. 生成特定桶的分享链接

```bash
# 为 newspaper 桶中的文件生成分享链接
curl -X POST "https://your-worker.dev/api/buckets/bucket_newspaper/share" \
  -H "Authorization: Bearer sk-newspaper-xxxx" \
  -H "Content-Type: application/json" \
  -d '{"filename": "breaking-news.jpg", "expires_in": 3600}'

# 使用自定义域名生成公开链接
curl -X POST "https://your-worker.dev/api/buckets/bucket_newspaper/share" \
  -H "Authorization: Bearer sk-newspaper-xxxx" \
  -H "Content-Type: application/json" \
  -d '{"filename": "article-image.jpg", "public": true}'
```

### 安全隔离

每个存储桶使用独立的API令牌，确保：

- **访问隔离**: 持有 `newspaper` 令牌的用户无法访问 `aspect` 的文件
- **操作隔离**: 不同桶的文件操作完全分离  
- **域名隔离**: 每个桶可配置独立的自定义域名
- **审计追踪**: 每个桶的操作都有独立的日志和元数据

### 向后兼容

系统完全向后兼容现有的API：

```bash
# 这些旧的API路由仍然有效，会使用默认桶
curl -X PUT "https://your-worker.dev/api/buckets/bucket/file.txt" \
  -H "Authorization: Bearer sk-bucket-default-xxxx"

curl "https://your-worker.dev/api/files" \
  -H "Authorization: Bearer sk-bucket-default-xxxx"
```

### 页面管理界面

页面管理界面支持多桶访问：

- 默认显示默认桶 (`bucket`) 的内容
- 可以通过URL路径访问特定桶: `/api/buckets/{bucketName}/...`
- 使用统一的Basic Auth认证 (ADMIN_USERNAME/ADMIN_PASSWORD)

## 🚀 多桶部署指南

### 1. 创建R2存储桶

首先在Cloudflare Dashboard或使用wrangler创建所需的存储桶：

```bash
# 创建存储桶
wrangler r2 bucket create newspaper-assets
wrangler r2 bucket create aspect-assets

# 查看已创建的存储桶
wrangler r2 bucket list
```

### 2. 配置环境变量

在Cloudflare Dashboard的Worker设置中添加环境变量，或使用wrangler命令：

```bash
# 设置各个桶的API令牌
wrangler secret put BUCKET_DEFAULT_API_TOKEN
wrangler secret put BUCKET_NEWSPAPER_API_TOKEN
wrangler secret put BUCKET_ASPECT_API_TOKEN

# 设置各个桶的自定义域名 (可选)
wrangler secret put BUCKET_DEFAULT_CUSTOM_DOMAIN
wrangler secret put BUCKET_NEWSPAPER_CUSTOM_DOMAIN
wrangler secret put BUCKET_ASPECT_CUSTOM_DOMAIN

# 设置管理员认证
wrangler secret put ADMIN_USERNAME
wrangler secret put ADMIN_PASSWORD

# 可选：设置分享链接有效期
wrangler secret put SHARE_LINK_EXPIRES_HOURS
```

### 3. 部署Worker

```bash
npm run deploy
```

### 4. 测试多桶功能

#### 测试桶访问隔离

```bash
# 测试1: 使用正确的令牌访问对应的桶
curl "https://your-worker.dev/api/buckets/bucket_newspaper/files" \
  -H "Authorization: Bearer YOUR_NEWSPAPER_TOKEN"

# 测试2: 使用错误的令牌访问桶（应该返回401）
curl "https://your-worker.dev/api/buckets/bucket_newspaper/files" \
  -H "Authorization: Bearer YOUR_ASPECT_TOKEN"

# 测试3: 访问不存在的桶（应该返回404）
curl "https://your-worker.dev/api/buckets/nonexistent-bucket/files" \
  -H "Authorization: Bearer YOUR_NEWSPAPER_TOKEN"
```

#### 测试文件上传到不同桶

```bash
# 上传到不同的桶
echo "Newspaper content" > news-test.txt
curl -X PUT "https://your-worker.dev/api/buckets/bucket_newspaper/news-test.txt" \
  -H "Authorization: Bearer YOUR_NEWSPAPER_TOKEN" \
  -H "Content-Type: text/plain" \
  --data-binary @news-test.txt

echo "Aspect content" > aspect-test.txt  
curl -X PUT "https://your-worker.dev/api/buckets/bucket_aspect/aspect-test.txt" \
  -H "Authorization: Bearer YOUR_ASPECT_TOKEN" \
  -H "Content-Type: text/plain" \
  --data-binary @aspect-test.txt
```

#### 测试文件冲突预防

```bash
# 上传同名文件到同一个桶，验证自动重命名功能
echo "First version" > duplicate.txt
curl -X PUT "https://your-worker.dev/api/buckets/bucket_newspaper/duplicate.txt" \
  -H "Authorization: Bearer YOUR_NEWSPAPER_TOKEN" \
  -H "Content-Type: text/plain" \
  --data-binary @duplicate.txt

echo "Second version" > duplicate.txt
curl -X PUT "https://your-worker.dev/api/buckets/bucket_newspaper/duplicate.txt" \
  -H "Authorization: Bearer YOUR_NEWSPAPER_TOKEN" \
  -H "Content-Type: text/plain" \
  --data-binary @duplicate.txt
```

### 5. 验证结果

检查每个桶的文件列表：

```bash
# 查看各个桶的文件
curl "https://your-worker.dev/api/buckets/bucket_newspaper/files" \
  -H "Authorization: Bearer YOUR_NEWSPAPER_TOKEN"

curl "https://your-worker.dev/api/buckets/bucket_aspect/files" \
  -H "Authorization: Bearer YOUR_ASPECT_TOKEN"

# 测试自定义域名访问 (如果已配置)
curl "https://assets.newspaper.com/breaking-news.jpg"
curl "https://cdn.aspect.dev/banner.png"
```

### 可用的桶配置

当前配置了以下桶（可根据需要修改 `src/index.ts` 中的 `getBucketConfigs` 函数）：

- `bucket` - 默认桶 (r2-explorer-bucket)
- `bucket_newspaper` - 新闻网站资源桶 (newspaper-assets)
- `bucket_aspect` - Aspect网站资源桶 (aspect-assets)

每个桶都有独立的API访问令牌和自定义域名配置，确保完全的安全隔离和域名隔离。

### 自定义域名配置优势

- **域名级别隔离**: 不同桶可以使用完全不同的域名，实现品牌分离
- **CDN优化**: 每个域名可以配置独立的CDN策略
- **SSL证书管理**: 支持每个域名的独立SSL配置
- **访问控制**: 结合API令牌和域名实现双重访问控制

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
wrangler vars set SHARE_LINK_EXPIRES_HOURS 48

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
          wrangler vars set SHARE_LINK_EXPIRES_HOURS 24
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