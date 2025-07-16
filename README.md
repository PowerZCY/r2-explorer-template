# R2-Explorer App

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/r2-explorer-template)

![R2 Explorer Template Preview](https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/e3c4ab7e-43f2-49df-6317-437f4ae8ce00/public)

<!-- dash-content-start -->

R2-Explorer brings a familiar Google Drive-like interface to your Cloudflare R2 storage buckets, making file management simple and intuitive.

## Key Features

- **🔒 Security**
  - Basic Authentication support
  - Cloudflare Access integration
  - Self-hosted on your Cloudflare account

- **📁 File Management**
  - Drag-and-drop file upload
  - Folder creation and organization
  - Multi-part upload for large files
  - Right-click context menu for advanced options
  - HTTP/Custom metadata editing

- **👀 File Handling**
  - In-browser file preview
    - PDF documents
    - Images
    - Text files
    - Markdown
    - CSV
    - Logpush files
  - In-browser file editing
  - Folder upload support

- **📧 Email Integration**
  - Receive and process emails via Cloudflare Email Routing
  - View email attachments directly in the interface

<!-- dash-content-end -->

> [!IMPORTANT]
> When using C3 to create this project, select "no" when it asks if you want to deploy. You need to follow this project's [setup steps](https://github.com/cloudflare/templates/tree/main/r2-explorer-template#setup-steps) before deploying.

## Getting Started

Outside of this repo, you can start a new project with this template using [C3](https://developers.cloudflare.com/pages/get-started/c3/) (the `create-cloudflare` CLI):

```
npm create cloudflare@latest -- --template=cloudflare/templates/r2-explorer-template
```

A live public deployment of this template is available at [https://demo.r2explorer.com](https://demo.r2explorer.com)

## Setup Steps

1. Install the project dependencies with a package manager of your choice:
   ```bash
   npm install
   ```
2. Create a [R2 Bucket](https://developers.cloudflare.com/r2/get-started/) with the name "r2-explorer-bucket":
   ```bash
   npx wrangler r2 bucket create r2-explorer-bucket
   ```
3. Deploy the project!
   ```bash
   npx wrangler deploy
   ```

## Next steps

By default this template is **readonly**.

in order for you to enable editing, just update the `readonly` flag in your `src/index.ts` file.

Its highly recommended that you setup security first, [learn more here](https://r2explorer.com/getting-started/security/).


# 自定义类型定义

## 问题说明

Cloudflare Workers 的类型生成存在一个两难问题：

1. **在 `wrangler.json` 中定义环境变量**：
   - ✅ `wrangler types` 会自动生成正确的类型
   - ❌ 安全风险：明文暴露敏感信息
   - ❌ 生产环境：会覆盖 Cloudflare Dashboard 中的配置

2. **不在 `wrangler.json` 中定义环境变量**：
   - ✅ 安全：敏感信息通过 Cloudflare Dashboard 配置
   - ✅ 生产环境：Dashboard 配置生效
   - ❌ `wrangler types` 不会生成环境变量类型定义

## 解决方案

我们采用**分离式类型定义**的方案：

### 文件结构
```
├── worker-configuration.d.ts  # 自动生成（bucket, ASSETS 等）
├── types/
│   ├── env.d.ts               # 手动维护（环境变量）
│   └── README.md              # 说明文档
└── tsconfig.json              # 包含两个类型文件
```

### 工作流程

1. **修改 `wrangler.json` 后运行**：
   ```bash
   npm run types
   ```

2. **添加新环境变量时**：
   - 在 `types/env.d.ts` 中添加类型定义
   - 在 Cloudflare Dashboard 中配置实际值

3. **类型合并**：
   TypeScript 会自动合并两个文件中的 `Cloudflare.Env` 接口

## 当前环境变量

在 `types/env.d.ts` 中定义的环境变量：

- `ADMIN_USERNAME?: string` - 管理员用户名
- `ADMIN_PASSWORD?: string` - 管理员密码  
- `API_TOKEN?: string` - API 访问令牌

## 使用方式

在代码中正常使用：

```typescript
export default {
  async fetch(request: Request, env: Env) {
    const username = env.ADMIN_USERNAME || "admin";
    const token = env.API_TOKEN || "default-token";
    // TypeScript 会正确识别这些类型
  }
}
```

## 维护说明

- **切勿**在 `wrangler.json` 中添加敏感环境变量
- **新增环境变量时**请同时更新 `types/env.d.ts`
- **生产部署前**确保在 Cloudflare Dashboard 中配置了所有必需的环境变量

这样既保证了类型安全，又确保了生产环境的安全性！ 


┌─────────────────┐    ┌──────────────┐    ┌─────────────────┐
│   第三方应用    │───▶│ Worker API   │───▶│   R2 存储桶     │
│                 │    │ (认证+代理)  │    │                 │
└─────────────────┘    └──────────────┘    └─────────────────┘
                              │                     ▲
                              │                     │
                              ▼                     │
                       ┌──────────────┐             │
                       │ 分享链接生成 │             │
                       └──────────────┘             │
                              │                     │
                              ▼                     │
                       ┌──────────────────────────────┴─┐
                       │    R2 自定义域名                │
                       │ https://files.yourdomain.com   │
                       │ (公开访问，CDN 加速)           │
                       └────────────────────────────────┘