// 自定义环境变量类型定义
// 此文件补充 worker-configuration.d.ts 中缺失的环境变量
declare namespace Cloudflare {
  interface Env {
    // 管理员认证
    ADMIN_USERNAME?: string;
    ADMIN_PASSWORD?: string;
    
    // API 访问令牌
    API_TOKEN?: string;
    
    // R2 自定义域名配置
    R2_CUSTOM_DOMAIN?: string;
  }
} 