# R2 存储服务 API 使用文档

## 🔒 安全更新说明

本服务使用**双重认证系统**提供安全保护：

- **Web 界面访问**：使用 Basic Authentication（用户名/密码）
- **API 接口访问**：使用 Bearer Token 认证（安全的API访问）

## 🔑 认证方式

### 1. Web 界面认证（Basic Auth）
访问 Web 管理界面时使用：
- 用户名：通过 `ADMIN_USERNAME` 环境变量配置
- 密码：通过 `ADMIN_PASSWORD` 环境变量配置

### 2. API 接口认证（Bearer Token）
所有 `/api/*` 路径的请求都需要使用 Bearer Token：

```bash
# 使用 Bearer Token 访问 API
curl -H "Authorization: Bearer your-api-token" \
     https://your-domain.workers.dev/api/files
```

#### 获取 API Token
API Token 通过 `API_TOKEN` 环境变量配置。

## 🌐 跨域访问说明

API 支持跨域访问，允许任何域名的网站调用。如果您需要更严格的域名限制，建议：

1. **使用 Cloudflare Access** 进行高级访问控制
2. **在 R2 存储桶层面配置 CORS**（如果需要直接访问文件）
3. **在应用层实现 IP 白名单**

## API 端点

### 1. 文件上传

**POST** `/api/upload`

#### 请求示例
```bash
# 使用 Bearer Token 上传文件
curl -X POST \
  -H "Authorization: Bearer your-api-token" \
  -F "file=@/path/to/your/file.jpg" \
  https://your-domain.workers.dev/api/upload
```

```javascript
// JavaScript 示例
const formData = new FormData();
formData.append('file', file);

fetch('https://your-domain.workers.dev/api/upload', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer your-api-token'
  },
  body: formData
});
```

### 2. 文件下载

**GET** `/api/files/{key}`

```bash
curl -H "Authorization: Bearer your-api-token" \
  https://your-domain.workers.dev/api/files/my-file.jpg \
  --output downloaded-file.jpg
```

### 3. 文件列表

**GET** `/api/files`

```bash
curl -H "Authorization: Bearer your-api-token" \
  https://your-domain.workers.dev/api/files
```

### 4. 文件删除

**DELETE** `/api/files/{key}`

```bash
curl -X DELETE \
  -H "Authorization: Bearer your-api-token" \
  https://your-domain.workers.dev/api/files/my-file.jpg
```

## 错误处理

### 认证相关错误

- `401 Unauthorized: Missing Bearer token` - 缺少 Authorization 头
- `401 Unauthorized: Invalid token` - Token 无效

## SDK 示例

### JavaScript/TypeScript
```javascript
class R2StorageClient {
  constructor(baseUrl, apiToken) {
    this.baseUrl = baseUrl;
    this.apiToken = apiToken;
  }

  async uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${this.baseUrl}/api/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`
      },
      body: formData
    });

    return response.json();
  }

  async listFiles(prefix = '') {
    const url = new URL(`${this.baseUrl}/api/files`);
    if (prefix) url.searchParams.set('prefix', prefix);

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.apiToken}`
      }
    });

    return response.json();
  }

  async deleteFile(key) {
    const response = await fetch(`${this.baseUrl}/api/files/${encodeURIComponent(key)}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`
      }
    });

    return response.json();
  }
}

// 使用示例
const client = new R2StorageClient(
  'https://your-domain.workers.dev',
  'your-api-token'
);

// 上传文件
const file = document.getElementById('fileInput').files[0];
const result = await client.uploadFile(file);
console.log('Upload result:', result);
```

### Python
```python
import requests

class R2StorageClient:
    def __init__(self, base_url, api_token):
        self.base_url = base_url
        self.headers = {"Authorization": f"Bearer {api_token}"}

    def upload_file(self, file_path):
        with open(file_path, 'rb') as f:
            files = {'file': f}
            response = requests.post(
                f"{self.base_url}/api/upload",
                headers=self.headers,
                files=files
            )
        return response.json()

    def list_files(self, prefix=""):
        params = {"prefix": prefix} if prefix else {}
        response = requests.get(
            f"{self.base_url}/api/files",
            headers=self.headers,
            params=params
        )
        return response.json()

    def delete_file(self, key):
        response = requests.delete(
            f"{self.base_url}/api/files/{key}",
            headers=self.headers
        )
        return response.json()

# 使用示例
client = R2StorageClient(
    "https://your-domain.workers.dev",
    "your-api-token"
)

# 上传文件
result = client.upload_file("./my-file.jpg")
print("Upload result:", result)
```

## 🔧 环境变量配置

### 开发环境
在 `wrangler.json` 中配置：
```json
{
  "vars": {
    "ADMIN_USERNAME": "admin",
    "ADMIN_PASSWORD": "your-secure-password",
    "API_TOKEN": "sk-dev-1234567890abcdef"
  }
}
```

### 生产环境（推荐）
使用 Wrangler secrets：
```bash
# 设置 Web 界面认证
wrangler secret put ADMIN_USERNAME
wrangler secret put ADMIN_PASSWORD

# 设置 API Token（强烈推荐使用复杂的随机字符串）
wrangler secret put API_TOKEN
```

## 🛡️ 安全建议

1. **API Token 管理**
   - 使用长度至少 32 位的随机字符串
   - 定期轮换 API Token
   - 不要在客户端代码中硬编码 Token

2. **HTTPS**
   - 始终使用 HTTPS 访问 API
   - 生产环境部署使用自定义域名

3. **高级安全控制**
   - 启用 Cloudflare Access 进行额外保护
   - 配置 IP 访问限制
   - 设置访问频率限制

4. **监控和日志**
   - 监控异常的 API 访问
   - 记录认证失败的请求
   - 定期审查访问日志

## 🚀 升级说明

如果您之前使用的是 Basic Auth API，请按以下步骤升级：

1. **生成 API Token**：在环境变量中设置 `API_TOKEN`
2. **更新客户端代码**：将 `Authorization: Basic xxx` 改为 `Authorization: Bearer your-api-token`
3. **测试新配置**：确保所有 API 调用正常工作

Web 界面访问保持不变，仍使用原来的用户名密码。 