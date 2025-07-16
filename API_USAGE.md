# R2 Explorer API 使用指南

本指南详细说明如何通过 API 接口与 R2 存储服务进行交互。

## 🔐 认证方式

### Web 界面认证
- **方式**：Basic Authentication
- **用户名**：`ADMIN_USERNAME` 环境变量值
- **密码**：`ADMIN_PASSWORD` 环境变量值

### API 接口认证
- **方式**：Bearer Token
- **Token**：`API_TOKEN` 环境变量值
- **Header格式**：`Authorization: Bearer YOUR_API_TOKEN`

---

## 📁 文件操作 API

### 1. 文件列表
获取存储桶中的文件列表。

```bash
curl -H "Authorization: Bearer YOUR_API_TOKEN" \
     https://your-domain.workers.dev/api/buckets/bucket/
```

### 2. 文件上传
上传文件到 R2 存储桶。

```bash
curl -X PUT \
     -H "Authorization: Bearer YOUR_API_TOKEN" \
     -H "Content-Type: application/octet-stream" \
     --data-binary @your-file.jpg \
     https://your-domain.workers.dev/api/buckets/bucket/your-file.jpg
```

### 3. 文件下载
下载指定文件。

```bash
curl -H "Authorization: Bearer YOUR_API_TOKEN" \
     -o downloaded-file.jpg \
     https://your-domain.workers.dev/api/buckets/bucket/your-file.jpg
```

### 4. 文件删除
删除指定文件。

```bash
curl -X DELETE \
     -H "Authorization: Bearer YOUR_API_TOKEN" \
     https://your-domain.workers.dev/api/buckets/bucket/your-file.jpg
```

### 5. 文件分享链接生成 🆕
为上传的文件生成分享链接。

```bash
curl -X POST \
     -H "Authorization: Bearer YOUR_API_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"filename": "your-file.jpg", "public": true}' \
     https://your-domain.workers.dev/api/share
```

**响应示例**：
```json
{
  "success": true,
  "message": "Share URLs generated successfully",
  "data": {
    "protected": "https://your-domain.workers.dev/api/buckets/bucket/your-file.jpg",
    "public": "https://your-r2-domain.com/your-file.jpg",
    "file": {
      "name": "your-file.jpg",
      "size": 1024000,
      "lastModified": "2024-01-01T12:00:00.000Z",
      "contentType": "image/jpeg"
    }
  },
  "usage": {
    "protected": "需要在请求头中包含 Authorization: Bearer YOUR_TOKEN",
    "public": "可直接访问，无需认证（如果 R2 bucket 配置为公开）"
  }
}
```

---

## 🌐 文件访问方式

### 1. 受保护访问（推荐用于私密文件）
通过 Worker API 访问，需要 Bearer Token 认证：
```
https://your-domain.workers.dev/api/buckets/bucket/filename.jpg
```

**特点**：
- ✅ 完全访问控制
- ✅ 访问日志记录  
- ✅ 灵活的权限管理
- ❌ 每次请求需要认证

### 2. 公开访问（推荐用于公共文件）
通过 R2 自定义域名直接访问：
```
https://your-r2-domain.com/filename.jpg
```

**特点**：
- ✅ 高性能（Cloudflare CDN 加速）
- ✅ 无需认证，直接访问
- ✅ 适合图片、视频等媒体文件
- ❌ 需要配置自定义域名

---

## ⚙️ R2 自定义域名配置

### 1. 在 Cloudflare Dashboard 配置

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 **R2 Object Storage**
3. 选择您的存储桶
4. 进入 **Settings** > **Custom Domains**
5. 点击 **Connect Domain**
6. 输入域名（如：`files.yourdomain.com`）
7. 选择访问级别：
   - **Public**: 允许公开访问所有文件
   - **Private**: 仅允许授权访问

### 2. 配置环境变量

在 Cloudflare Dashboard 的 **Workers & Pages** > **Your Worker** > **Settings** > **Variables & Secrets** 中添加：

| 变量名 | 类型 | 值 | 说明 |
|--------|------|-----|------|
| `R2_CUSTOM_DOMAIN` | Text | `files.yourdomain.com` | R2 自定义域名 |

### 3. DNS 配置（如果域名不在 Cloudflare）

如果您的域名不在 Cloudflare 管理，需要添加 CNAME 记录：
```
files.yourdomain.com CNAME your-bucket.r2.cloudflarestorage.com
```

---

## 🎯 推荐使用场景

### 场景 1：私密文件分享
```bash
# 上传私密文档
curl -X PUT \
     -H "Authorization: Bearer YOUR_API_TOKEN" \
     -H "Content-Type: application/pdf" \
     --data-binary @document.pdf \
     https://your-domain.workers.dev/api/buckets/bucket/private/document.pdf

# 生成受保护的分享链接
curl -X POST \
     -H "Authorization: Bearer YOUR_API_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"filename": "private/document.pdf"}' \
     https://your-domain.workers.dev/api/share
```

### 场景 2：公开媒体文件
```bash
# 上传公开图片
curl -X PUT \
     -H "Authorization: Bearer YOUR_API_TOKEN" \
     -H "Content-Type: image/jpeg" \
     --data-binary @photo.jpg \
     https://your-domain.workers.dev/api/buckets/bucket/public/photo.jpg

# 生成公开访问链接
curl -X POST \
     -H "Authorization: Bearer YOUR_API_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"filename": "public/photo.jpg", "public": true}' \
     https://your-domain.workers.dev/api/share
```

### 场景 3：第三方应用集成
```javascript
// JavaScript 示例
const API_TOKEN = 'YOUR_API_TOKEN';
const API_BASE = 'https://your-domain.workers.dev';

// 上传文件
async function uploadFile(file, filename) {
  const response = await fetch(`${API_BASE}/api/buckets/bucket/${filename}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': file.type
    },
    body: file
  });
  return response.ok;
}

// 生成分享链接
async function generateShareUrl(filename, isPublic = false) {
  const response = await fetch(`${API_BASE}/api/share`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ filename, public: isPublic })
  });
  const data = await response.json();
  return data.data;
}
```

---

## 🔒 安全最佳实践

### 1. API Token 管理
- 使用强随机 Token（建议 32+ 字符）
- 定期轮换 Token
- 不要在客户端代码中硬编码 Token
- 监控 Token 使用情况

### 2. 文件访问控制
- **私密文件**：使用受保护的 Worker API 访问
- **公开文件**：使用 R2 自定义域名访问
- 根据业务需求选择合适的访问方式

### 3. 存储桶安全
- 配置适当的 R2 bucket 访问策略
- 使用文件夹结构组织不同权限级别的文件
- 定期审查访问日志

---

## 📊 API 状态码参考

| 状态码 | 含义 | 说明 |
|--------|------|------|
| 200 | 成功 | 请求处理成功 |
| 400 | 请求错误 | 请求参数有误 |
| 401 | 未授权 | Token 无效或缺失 |
| 404 | 未找到 | 文件不存在 |
| 500 | 服务器错误 | 内部错误 |

---

## 🚀 快速开始

1. **获取 API Token**：从环境变量 `API_TOKEN` 或联系管理员
2. **选择访问方式**：根据文件类型选择受保护或公开访问
3. **配置自定义域名**：按照上述步骤配置 R2 自定义域名
4. **集成到应用**：使用提供的 API 接口进行文件操作

如有问题，请查看错误响应中的详细信息或联系技术支持。 