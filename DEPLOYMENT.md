# R2 存储服务部署说明

## 部署步骤

### 1. 配置环境变量

#### 开发环境
在 `wrangler.json` 中已经配置了示例环境变量：
```json
{
  "vars": {
    "ADMIN_USERNAME": "admin",
    "ADMIN_PASSWORD": "your-secure-password"
  }
}
```

**注意**：开发环境已验证可以使用以下凭据正常登录：
- 用户名：`admin`
- 密码：`your-secure-password`

#### 生产环境（推荐）
```bash
# 使用 Wrangler 安全地设置环境变量
wrangler secret put ADMIN_USERNAME
# 输入: admin (或您选择的用户名)

wrangler secret put ADMIN_PASSWORD  
# 输入: 您的安全密码（不要使用开发环境密码）
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

部署完成后，您可以：

1. **访问 Web 界面**：https://your-domain.workers.dev
2. **使用设置的用户名和密码登录**
   - 开发环境：`admin` / `your-secure-password`
   - 生产环境：您在 secrets 中设置的凭据
3. **测试 API**：
   ```bash
   curl -u admin:your-password https://your-domain.workers.dev/api/files
   ```

### 4. 本地开发测试

启动开发服务器：
```bash
npm run dev
# 或者
wrangler dev
```

然后访问 http://localhost:8787 并使用凭据：
- 用户名：`admin`
- 密码：`your-secure-password`

## 配置说明

### R2 存储桶
- 确保您已创建 R2 存储桶
- 在 `wrangler.json` 中更新 `bucket_name` 为您的实际存储桶名称

### 安全配置
- ✅ 已配置基础认证保护
- ✅ 生产环境务必使用强密码
- ✅ 使用 Wrangler secrets 而不是 vars 存储生产密码
- ✅ 定期轮换认证凭据
- 考虑启用 Cloudflare Access 进行额外保护

## 功能特性

✅ **已完成并验证的配置**：
- ✅ 基础认证保护（已测试）
- ✅ 文件上传/下载
- ✅ 文件列表查看
- ✅ 文件删除
- ✅ Web 界面操作
- ✅ RESTful API 接口

## 环境变量优先级

1. **开发环境**：`wrangler.json` 中的 `vars`
2. **生产环境**：`wrangler secret` 设置的密钥

## 注意事项

1. **环境变量优先级**：生产环境使用 `wrangler secret`，开发环境使用 `vars`
2. **文件大小限制**：单个文件最大 100MB
3. **访问权限**：只有通过认证的用户才能访问和操作文件
4. **开发测试**：当前配置已验证可以正常工作
5. **密码安全**：生产环境请更换为强密码

## 故障排除

### 认证问题
- 确保用户名和密码与配置的环境变量一致
- 开发环境默认凭据：`admin` / `your-secure-password`
- 清除浏览器缓存或使用隐私窗口重试

### 部署问题
- 检查 R2 存储桶是否正确创建和配置
- 验证 `wrangler.json` 中的 bucket 绑定配置
- 确保所有必需的环境变量都已设置 