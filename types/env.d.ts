// 自定义环境变量类型定义
// 此文件补充 worker-configuration.d.ts 中缺失的环境变量
declare namespace Cloudflare {
  interface Env {
    // 管理员认证 (用于页面Basic Auth，对所有桶通用)
    ADMIN_USERNAME?: string;
    ADMIN_PASSWORD?: string;
    
    // 默认API访问令牌 (用于向后兼容)
    API_TOKEN?: string;
    
    // 每个桶的独立API访问令牌 (安全隔离)
    // 格式: BUCKET_{桶名称大写}_API_TOKEN
    BUCKET_DEFAULT_API_TOKEN?: string;        // 默认桶(bucket)的API令牌
    BUCKET_NEWSPAPER_API_TOKEN?: string;      // newspaper-assets桶的API令牌
    BUCKET_ASPECT_API_TOKEN?: string;         // aspect-assets桶的API令牌  
    
    // 分享链接有效期配置（小时为单位，默认24小时）
    SHARE_LINK_EXPIRES_HOURS?: string;
    
    // 公开链接有效期配置（小时为单位，默认8760小时=365天）
    PUBLIC_LINK_EXPIRES_HOURS?: string;
    
    // R2存储桶绑定 (由wrangler自动注入)
    bucket: R2Bucket;              // 默认桶: r2-explorer-bucket
    bucket_newspaper: R2Bucket;    // newspaper-assets
    bucket_aspect: R2Bucket;       // aspect-assets
  }
} 