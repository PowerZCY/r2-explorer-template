# R2 存储服务部署说明

## 🔒 重要安全更新

本版本引入了**双重认证系统**，提升了安全性：

- **Web 界面**：继续使用 Basic Authentication
- **API 接口**：使用 Bearer Token 认证（替代明文密码）

## 部署步骤

### 1. 配置环境变量

#### 开发环境
在 `wrangler.json` 中配置必需的环境变量：
```json
{
  "vars": {
    "ADMIN_USERNAME": "admin",
    "ADMIN_PASSWORD": "your-secure-password",
    "API_TOKEN": "sk-dev-1234567890abcdef"
  }
}
```

#### 生产环境（强烈推荐）
使用 Wrangler secrets 安全地设置环境变量：
```bash
# Web 界面认证
wrangler secret put ADMIN_USERNAME
# 输入: admin (或您选择的用户名)

wrangler secret put ADMIN_PASSWORD  
# 输入: 强密码（用于Web界面登录）

# API Token（用于API调用认证）
wrangler secret put API_TOKEN
# 输入: 至少32位的随机字符串，如: sk-prod-abc123def456...
```

### 2. 部署到 Cloudflare Workers

```bash
# 安装依赖
npm install

# 生成类型定义
npm run cf-typegen

# 部署到生产环境
npm run deploy
```

### 3. 测试部署

#### Web 界面测试
访问：https://your-domain.workers.dev
使用凭据：
- 开发环境：`admin` / `your-secure-password`
- 生产环境：您设置的用户名和密码

#### API 接口测试
```bash
# 测试 API Token 认证
curl -H "Authorization: Bearer your-api-token" \
     https://your-domain.workers.dev/api/files
```

### 4. 本地开发测试

```bash
# 启动开发服务器
npm run dev
# 或
wrangler dev
```

- **Web 界面**：http://localhost:8787
- **API 接口**：http://localhost:8787/api/files

## 🔑 认证系统说明

### 双重认证架构
```
┌─────────────────┐    ┌──────────────────┐
│   Web 界面      │    │    API 接口      │
│                 │    │                  │
│ Basic Auth      │    │ Bearer Token     │
│ 用户名/密码     │    │ API Token        │
│                 │    │                  │
│ 人工操作        │    │ 程序调用         │
└─────────────────┘    └──────────────────┘
```

### 访问路径区分
- `https://your-domain.workers.dev/` → Web 界面（Basic Auth）
- `https://your-domain.workers.dev/api/*` → API 接口（Bearer Token）

## 🌐 跨域访问处理

### 为什么在 Worker 层处理 CORS？

```
第三方网站 → 我们的Worker API → R2Explorer → R2存储桶
           ↑
         CORS检查发生在这里
```

- 第三方应用的跨域请求是针对我们的 Worker 域名
- 浏览器需要我们返回正确的 CORS 头
- R2 存储桶的 CORS 策略不影响通过 Worker 的 API 调用

### 当前策略
- **API 层面**：允许所有域名跨域访问（通过 `Access-Control-Allow-Origin: *`）
- **安全控制**：通过 API Token 认证实现访问控制

### 高级安全控制（可选）
如需更严格的访问控制，建议：
1. **Cloudflare Access**：企业级身份验证
2. **IP 白名单**：在 Cloudflare 控制台配置
3. **自定义域名限制**：修改代码实现特定域名控制

## 🛡️ 安全特性

### ✅ 已实现的安全措施

1. **API Token 认证**
   - 替代明文密码传输
   - 支持独立的 Token 轮换
   - 长度和复杂度要求

2. **认证分离**
   - Web 界面和 API 使用不同认证
   - 降低凭据泄露风险
   - 便于权限管理

3. **环境变量安全**
   - 生产环境使用 Secrets
   - 敏感信息不在代码中暴露

### 🔒 安全建议

1. **API Token 管理**
   ```bash
   # 生成强随机 Token（推荐）
   openssl rand -hex 32
   # 示例: sk-prod-a1b2c3d4e5f6...
   ```

2. **定期轮换**
   - 每月更换 API Token
   - 记录 Token 更换日期
   - 监控异常访问

3. **监控告警**
   - 设置认证失败告警
   - 监控异常 IP 访问
   - 记录 API 使用情况

## 📊 功能对比

| 功能 | 旧版本 | 新版本 |
|------|--------|--------|
| Web 界面认证 | Basic Auth | ✅ Basic Auth |
| API 认证 | ❌ Basic Auth（不安全） | ✅ Bearer Token |
| 跨域访问 | ❌ 可能受限 | ✅ 完全支持 |
| 密码传输 | ❌ 每次请求传输 | ✅ Token 一次验证 |
| 认证分离 | ❌ 统一认证 | ✅ 分离认证 |

## 🔧 故障排除

### 认证问题
- **Web 界面无法登录**：检查 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD`
- **API 返回 401**：验证 `Authorization: Bearer token` 格式
- **Token 无效**：检查 `API_TOKEN` 环境变量配置

### 跨域问题
- **浏览器阻止请求**：确认使用了正确的 API Token
- **预检请求失败**：检查请求的 headers 和 methods
- **控制台错误**：查看具体的错误信息

### 环境变量问题
```bash
# 检查当前配置的 secrets
wrangler secret list

# 删除错误的 secret
wrangler secret delete SECRET_NAME

# 重新设置
wrangler secret put SECRET_NAME
```

## 🚀 升级现有部署

如果您已有运行中的 R2 存储服务，请按以下步骤升级：

### 步骤 1：准备新配置
```bash
# 生成强随机 API Token
API_TOKEN=$(openssl rand -hex 32)
echo "Generated API Token: sk-prod-$API_TOKEN"
```

### 步骤 2：设置环境变量
```bash
wrangler secret put API_TOKEN
```

### 步骤 3：部署新代码
```bash
npm run deploy
```

### 步骤 4：更新客户端
更新所有使用 API 的客户端代码，将认证方式从 Basic Auth 改为 Bearer Token。

### 步骤 5：验证功能
- 测试 Web 界面登录
- 测试 API Token 认证
- 验证跨域访问正常

## 注意事项

1. **向后兼容性**：Web 界面访问保持不变
2. **API 破坏性变更**：API 认证方式已更改，需要更新客户端
3. **跨域访问**：现在允许所有域名访问API，通过Token控制安全
4. **简化架构**：专注于API认证，不在Worker层限制域名 