# R2 Explorer Template 部署指南

## 安全配置要求

**⚠️ 重要：** 绝不要在 `wrangler.json` 中硬编码敏感信息！本项目已移除所有明文环境变量配置。

## 部署方式

### 方式一：使用 Cloudflare Dashboard（推荐）

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 **Workers & Pages**
3. 选择您的 Worker
4. 进入 **Settings** > **Variables and secrets**
5. 添加以下环境变量：

| 变量名 | 类型 | 描述 | 示例值 |
|--------|------|------|--------|
| `ADMIN_USERNAME` | Text | 管理员用户名 | `admin` |
| `ADMIN_PASSWORD` | Secret | 管理员密码 | `your-secure-password` |
| `API_TOKEN` | Secret | API访问令牌 | `sk-prod-YOUR-SECURE-TOKEN` |

**注意：** 密码和API令牌务必设置为 **Secret** 类型，而非 Text 类型。

### 方式二：使用 Wrangler 命令行

首先确保已安装并登录 Wrangler：

```bash
npm install -g wrangler
wrangler auth login
```

然后使用 `wrangler secret put` 命令设置敏感信息：

```bash
# 设置管理员用户名（可以用变量形式）
wrangler vars set ADMIN_USERNAME admin

# 设置管理员密码（密钥形式）
wrangler secret put ADMIN_PASSWORD
# 系统会提示输入密码值

# 设置API令牌（密钥形式）
wrangler secret put API_TOKEN
# 系统会提示输入令牌值
```

### 方式三：GitHub Actions 自动部署

如果使用 GitHub Actions，需要在仓库的 **Settings** > **Secrets and variables** > **Actions** 中配置：

#### Repository Secrets:
- `CLOUDFLARE_API_TOKEN`: Cloudflare API 令牌（用于 wrangler 认证）
- `ADMIN_PASSWORD`: 管理员密码
- `API_TOKEN`: R2 Explorer API 令牌

#### Workflow 示例:

```yaml
name: Deploy to Cloudflare Workers

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Set secrets
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        run: |
          echo "${{ secrets.ADMIN_PASSWORD }}" | wrangler secret put ADMIN_PASSWORD
          echo "${{ secrets.API_TOKEN }}" | wrangler secret put API_TOKEN
          wrangler vars set ADMIN_USERNAME admin
          
      - name: Deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        run: wrangler deploy
```

## 验证部署

部署完成后，访问您的 Worker URL：

1. **Web界面**: 使用管理员用户名和密码登录
2. **API测试**: 
   ```bash
   curl -H "Authorization: Bearer YOUR-API-TOKEN" \
        https://your-worker.your-subdomain.workers.dev/api/list
   ```

## 安全最佳实践

1. **永远不要**在代码仓库中提交明文密码或 API 令牌
2. **定期轮换** API 令牌和密码
3. **使用强密码**生成器创建安全的凭据
4. **监控访问日志**检查异常活动
5. **限制 API 令牌权限**仅授予必要的访问权限

## 环境区分

### 开发环境
```bash
# 设置开发环境的密钥
wrangler secret put ADMIN_PASSWORD --env development
wrangler secret put API_TOKEN --env development
```

### 生产环境
```bash
# 设置生产环境的密钥（默认）
wrangler secret put ADMIN_PASSWORD
wrangler secret put API_TOKEN
```

## 故障排除

### 1. 环境变量未找到
如果遇到 "Environment variable not found" 错误：
- 检查 Cloudflare Dashboard 中的 Variables and secrets 配置
- 确认变量名称拼写正确
- 验证密钥是否已正确设置

### 2. GitHub Actions 部署失败
- 确认 `CLOUDFLARE_API_TOKEN` 具有足够权限
- 检查 workflow 文件中的密钥引用是否正确
- 查看 Actions 日志获取详细错误信息

### 3. API 认证失败
- 验证 API_TOKEN 格式正确（建议以 `sk-` 开头）
- 确认令牌未过期
- 检查请求头格式：`Authorization: Bearer YOUR-TOKEN`

## 获取帮助

如遇问题，请检查：
1. [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
2. [Wrangler 命令参考](https://developers.cloudflare.com/workers/wrangler/commands/)
3. 项目 Issues 页面

---

**提醒：** 本模板遵循安全最佳实践，所有敏感配置都通过 Cloudflare 的安全机制管理，确保生产环境的安全性。 