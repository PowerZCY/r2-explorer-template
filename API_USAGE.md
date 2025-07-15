# R2 存储服务 API 使用文档

## 概述

本文档说明如何通过 API 接口对 Cloudflare R2 存储服务进行文件操作。

## 认证

所有 API 请求都需要基础认证（Basic Authentication）。

### 认证方式
使用 HTTP Basic Authentication，用户名和密码在部署时通过环境变量配置：
- `ADMIN_USERNAME`: 管理员用户名
- `ADMIN_PASSWORD`: 管理员密码

### 认证示例
```bash
# 使用 curl 带认证
curl -u admin:your-password https://your-domain.workers.dev/api/files
```

## API 端点

### 1. 文件上传

**POST** `/api/upload`

上传文件到 R2 存储桶。

#### 请求
- **Method**: POST
- **Content-Type**: multipart/form-data
- **Body**: 包含文件的表单数据

#### 示例
```bash
# 上传文件
curl -u admin:your-password \
  -X POST \
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
    'Authorization': 'Basic ' + btoa('admin:your-password')
  },
  body: formData
});
```

#### 响应
```json
{
  "success": true,
  "key": "uploaded-file.jpg",
  "size": 1024,
  "etag": "d41d8cd98f00b204e9800998ecf8427e"
}
```

### 2. 文件下载

**GET** `/api/files/{key}`

下载指定的文件。

#### 示例
```bash
# 下载文件
curl -u admin:your-password \
  https://your-domain.workers.dev/api/files/my-file.jpg \
  --output downloaded-file.jpg
```

### 3. 文件列表

**GET** `/api/files`

获取存储桶中的文件列表。

#### 查询参数
- `prefix` (可选): 文件名前缀过滤
- `limit` (可选): 返回结果数量限制，默认 100
- `cursor` (可选): 分页游标

#### 示例
```bash
# 获取所有文件
curl -u admin:your-password \
  https://your-domain.workers.dev/api/files

# 获取特定前缀的文件
curl -u admin:your-password \
  "https://your-domain.workers.dev/api/files?prefix=images/"
```

#### 响应
```json
{
  "objects": [
    {
      "key": "file1.jpg",
      "size": 1024,
      "lastModified": "2024-01-01T00:00:00.000Z",
      "etag": "d41d8cd98f00b204e9800998ecf8427e"
    }
  ],
  "truncated": false,
  "cursor": null
}
```

### 4. 文件删除

**DELETE** `/api/files/{key}`

删除指定的文件。

#### 示例
```bash
# 删除文件
curl -u admin:your-password \
  -X DELETE \
  https://your-domain.workers.dev/api/files/my-file.jpg
```

#### 响应
```json
{
  "success": true,
  "message": "File deleted successfully"
}
```

### 5. 文件信息

**HEAD** `/api/files/{key}`

获取文件元数据信息（不下载文件内容）。

#### 示例
```bash
# 获取文件信息
curl -u admin:your-password \
  -I \
  https://your-domain.workers.dev/api/files/my-file.jpg
```

## 错误处理

API 使用标准 HTTP 状态码：

- `200` - 请求成功
- `401` - 认证失败
- `403` - 权限不足
- `404` - 文件不存在
- `413` - 文件过大
- `500` - 服务器内部错误

### 错误响应格式
```json
{
  "error": true,
  "message": "File not found",
  "code": 404
}
```

## SDK 示例

### JavaScript/TypeScript
```javascript
class R2StorageClient {
  constructor(baseUrl, username, password) {
    this.baseUrl = baseUrl;
    this.auth = btoa(`${username}:${password}`);
  }

  async uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${this.baseUrl}/api/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${this.auth}`
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
        'Authorization': `Basic ${this.auth}`
      }
    });

    return response.json();
  }

  async deleteFile(key) {
    const response = await fetch(`${this.baseUrl}/api/files/${encodeURIComponent(key)}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Basic ${this.auth}`
      }
    });

    return response.json();
  }

  getDownloadUrl(key) {
    return `${this.baseUrl}/api/files/${encodeURIComponent(key)}`;
  }
}

// 使用示例
const client = new R2StorageClient(
  'https://your-domain.workers.dev',
  'admin',
  'your-password'
);

// 上传文件
const file = document.getElementById('fileInput').files[0];
const result = await client.uploadFile(file);
console.log('Upload result:', result);
```

### Python
```python
import requests
import base64

class R2StorageClient:
    def __init__(self, base_url, username, password):
        self.base_url = base_url
        self.auth = base64.b64encode(f"{username}:{password}".encode()).decode()
        self.headers = {"Authorization": f"Basic {self.auth}"}

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

    def download_file(self, key, local_path):
        response = requests.get(
            f"{self.base_url}/api/files/{key}",
            headers=self.headers
        )
        with open(local_path, 'wb') as f:
            f.write(response.content)

# 使用示例
client = R2StorageClient(
    "https://your-domain.workers.dev",
    "admin",
    "your-password"
)

# 上传文件
result = client.upload_file("./my-file.jpg")
print("Upload result:", result)
```

## 部署说明

### 环境变量配置

1. **开发环境**：在 `wrangler.json` 中配置
```json
{
  "vars": {
    "ADMIN_USERNAME": "admin",
    "ADMIN_PASSWORD": "your-secure-password"
  }
}
```

2. **生产环境**：使用 Wrangler 设置环境变量（更安全）
```bash
# 设置生产环境变量
wrangler secret put ADMIN_USERNAME
wrangler secret put ADMIN_PASSWORD
```

### 部署命令
```bash
# 部署到 Cloudflare Workers
npm run deploy
```

## 安全建议

1. **使用强密码**: 确保 `ADMIN_PASSWORD` 是强密码
2. **使用 Secrets**: 生产环境中使用 `wrangler secret` 而不是 `vars`
3. **HTTPS**: 始终使用 HTTPS 访问 API
4. **IP 限制**: 考虑在 Cloudflare 控制台配置 IP 访问限制
5. **定期轮换**: 定期更换认证凭据

## 限制说明

- 单个文件大小限制：100MB
- 请求频率限制：根据 Cloudflare Workers 限制
- 存储空间：根据您的 R2 计划限制 