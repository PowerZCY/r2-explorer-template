import { R2Explorer } from "r2-explorer";

// ================================
// 🪣 多桶配置管理
// ================================

/**
 * 桶配置接口
 */
interface BucketConfig {
  binding: keyof Env;        // R2Bucket绑定名称 
  bucketName: string;        // 存储桶名称
  apiToken?: string;         // 该桶的API访问令牌
  public?: boolean;         // 该桶是否公开
}

/**
 * 获取所有可用的桶配置
 */
function getBucketConfigs(env: Env): Record<string, BucketConfig> {
  return {
    // 默认桶 (向后兼容)
    'bucket': {
      binding: 'bucket',
      bucketName: 'r2-explorer-bucket',
      apiToken: env.BUCKET_DEFAULT_API_TOKEN || 'sk-dev-7C021EA0-386B-4908-BFDD-3ACC55B2BD6F',
      public: true
    },
    
    // 新闻网站资源桶 - 使用绑定名称作为键名
    'bucket_newspaper': {
      binding: 'bucket_newspaper',
      bucketName: 'newspaper-assets', 
      apiToken: env.BUCKET_NEWSPAPER_API_TOKEN,
      public: false
    },
    
    // Aspect网站资源桶 - 使用绑定名称作为键名
    'bucket_aspect': {
      binding: 'bucket_aspect',
      bucketName: 'aspect-assets',
      apiToken: env.BUCKET_ASPECT_API_TOKEN,
      public: false
    }
  };
}

/**
 * 从请求路径解析桶名称
 * 支持路径格式: /api/buckets/{bucketName}/operation
 */
function parseBucketFromPath(pathname: string): string | null {
  // 匹配 /api/buckets/{bucketName}/... 格式
  const apiMatch = pathname.match(/^\/api\/buckets\/([^\/]+)/);
  if (apiMatch) {
    return apiMatch[1];
  }
  
  // 对于向后兼容性，如果是 /api/buckets/bucket/... 格式，返回默认桶
  if (pathname.startsWith('/api/buckets/bucket/')) {
    return 'bucket';
  }
  
  return null;
}

/**
 * 根据桶名称获取桶配置
 */
function getBucketConfig(bucketName: string, env: Env): BucketConfig | null {
  const configs = getBucketConfigs(env);
  return configs[bucketName] || null;
}

/**
 * 根据桶配置获取R2Bucket实例
 */
function getBucketInstance(config: BucketConfig, env: Env): R2Bucket | null {
  const bucket = env[config.binding];
  // 确保返回的是R2Bucket类型
  if (bucket && typeof bucket === 'object' && 'get' in bucket && 'put' in bucket && 'delete' in bucket) {
    return bucket as R2Bucket;
  }
  return null;
}

// ================================
// 🔀 CORS 助手函数
// ================================

/**
 * 获取标准的CORS头部
 */
function getCORSHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Content-Length, Accept, Origin, X-Requested-With',
    'Access-Control-Allow-Credentials': 'false',
  };
}

/**
 * 为响应添加CORS头部
 */
function addCORSHeaders(headers: Record<string, string>): Record<string, string> {
  return {
    ...headers,
    ...getCORSHeaders()
  };
}

// ================================
// ⏰ 配置助手函数
// ================================

/**
 * 获取分享链接的有效期（秒）
 * 从环境变量 SHARE_LINK_EXPIRES_HOURS 读取配置（小时为单位）
 * 默认24小时
 */
function getShareLinkExpiresIn(env: Env): number {
  const hoursFromEnv = env.SHARE_LINK_EXPIRES_HOURS;
  
  if (hoursFromEnv) {
    const hours = parseInt(hoursFromEnv);
    if (!isNaN(hours) && hours > 0) {
      console.log(`📅 Using configured share link expiry: ${hours} hours`);
      return hours * 3600; // 转换为秒
    } else {
      console.log(`⚠️ Invalid SHARE_LINK_EXPIRES_HOURS value: ${hoursFromEnv}, using default 24 hours`);
    }
  }
  
  console.log(`📅 Using default share link expiry: 24 hours`);
  return 86400; // 默认24小时
}

/**
 * 获取公开链接的超长有效期（秒）
 * 从环境变量 PUBLIC_LINK_EXPIRES_HOURS 读取配置（小时为单位）
 * 默认365天（8760小时）
 */
function getPublicLinkExpiresIn(env: Env): number {
  const hoursFromEnv = env.PUBLIC_LINK_EXPIRES_HOURS;
  
  if (hoursFromEnv) {
    const hours = parseInt(hoursFromEnv);
    if (!isNaN(hours) && hours > 0) {
      console.log(`📅 Using configured public link expiry: ${hours} hours`);
      return hours * 3600; // 转换为秒
    } else {
      console.log(`⚠️ Invalid PUBLIC_LINK_EXPIRES_HOURS value: ${hoursFromEnv}, using default 365 days`);
    }
  }
  
  console.log(`📅 Using default public link expiry: 365 days (8760 hours)`);
  return 31536000; // 默认365天 = 365 * 24 * 3600秒
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    console.log(`🌐 Incoming request: ${request.method} ${url.pathname}`);
    
    // ================================
    // 🔀 全局 CORS 预检处理 (最高优先级)
    // ================================
    if (request.method === 'OPTIONS') {
      console.log(`🔀 CORS preflight request: ${url.pathname}`);
      return new Response(null, {
        status: 204,
        headers: {
          ...getCORSHeaders(),
          'Access-Control-Max-Age': '86400',
        }
      });
    }
    
    // ================================
    // 🌐 R2公开访问代理 (规避CORS问题) - 最高优先级
    // ================================
    if (url.pathname.startsWith('/proxy/')) {
      return handleR2Proxy(request, env, ctx);
    }
    
    // ================================
    // 🪣 桶路径解析
    // ================================
    
    const bucketName = parseBucketFromPath(url.pathname);
    let bucketConfig: BucketConfig | null = null;
    let targetBucket: R2Bucket | null = null;
    
    if (bucketName) {
      bucketConfig = getBucketConfig(bucketName, env);
      if (bucketConfig) {
        targetBucket = getBucketInstance(bucketConfig, env);
        console.log(`🪣 Bucket resolved: ${bucketName} -> ${bucketConfig.bucketName} (binding: ${bucketConfig.binding})`);
        
        if (!targetBucket) {
          console.error(`❌ Bucket instance not found for: ${bucketName}`);
          return new Response(JSON.stringify({
            error: 'Bucket Not Available',
            message: `Bucket '${bucketName}' is not properly configured or bound`,
            bucket: bucketName
          }), {
            status: 503,
            headers: addCORSHeaders({
              'Content-Type': 'application/json',
            })
          });
        }
      } else {
        console.error(`❌ Unknown bucket: ${bucketName}`);
        const configs = getBucketConfigs(env);
        const availableBuckets = Object.keys(configs);
        
        return new Response(JSON.stringify({
          error: 'Unknown Bucket',
          message: `Bucket '${bucketName}' is not configured`,
          bucket: bucketName,
          available_buckets: availableBuckets,
          hint: `Available buckets: ${availableBuckets.join(', ')}`
        }), {
          status: 404,
          headers: addCORSHeaders({
            'Content-Type': 'application/json',
          })
        });
      }
    }
    
    // ================================
    // 🎯 API 路由 (针对特定桶)
    // ================================
    
    if (bucketName && bucketConfig && targetBucket) {
      // 🎯 自定义API端点 (需要该桶的Bearer Token)
      const customAPIEndpoints = [
        `/api/buckets/${bucketName}/share`,
        `/api/buckets/${bucketName}/files`, 
        `/api/buckets/${bucketName}/metadata`
      ];
      
      // 🎯 文件上传API (需要该桶的Bearer Token)
      if (request.method === 'PUT' && url.pathname.startsWith(`/api/buckets/${bucketName}/`)) {
        console.log(`📤 API file upload detected for bucket ${bucketName}: ${url.pathname}`);
        return handleAPIRoutes(request, env, ctx, bucketConfig, targetBucket);
      }
      
      // 🎯 自定义API端点 (需要该桶的Bearer Token)
      if (customAPIEndpoints.some(endpoint => url.pathname === endpoint)) {
        console.log(`🔧 Custom API endpoint for bucket ${bucketName}: ${url.pathname}`);
        return handleAPIRoutes(request, env, ctx, bucketConfig, targetBucket);
      }
      
      // 🎯 文件下载API with download参数 (需要该桶的Bearer Token)
      if (request.method === 'GET' && 
          url.pathname.startsWith(`/api/buckets/${bucketName}/`) && 
          url.searchParams.get('download') === 'true') {
        console.log(`📥 API download request for bucket ${bucketName}: ${url.pathname}`);
        return handleAPIRoutes(request, env, ctx, bucketConfig, targetBucket);
      }
    }
    
    // ================================
    // 🎯 向后兼容的API路由 (使用默认桶)
    // ================================
    
    // 向后兼容：处理不带桶名的API请求，使用默认桶
    const legacyAPIEndpoints = [
      '/api/share',
      '/api/files', 
      '/api/metadata'
    ];
    
    // 向后兼容：文件上传API
    if (request.method === 'PUT' && url.pathname.startsWith('/api/buckets/') && !bucketName) {
      console.log(`📤 Legacy API file upload detected: ${url.pathname}`);
      const defaultConfig = getBucketConfig('bucket', env);
      const defaultBucket = defaultConfig ? getBucketInstance(defaultConfig, env) : null;
      if (defaultConfig && defaultBucket) {
        return handleAPIRoutes(request, env, ctx, defaultConfig, defaultBucket);
      }
    }
    
    // 向后兼容：自定义API端点
    if (legacyAPIEndpoints.some(endpoint => url.pathname === endpoint)) {
      console.log(`🔧 Legacy API endpoint: ${url.pathname}`);
      const defaultConfig = getBucketConfig('bucket', env);
      const defaultBucket = defaultConfig ? getBucketInstance(defaultConfig, env) : null;
      if (defaultConfig && defaultBucket) {
        return handleAPIRoutes(request, env, ctx, defaultConfig, defaultBucket);
      }
    }
    
    // 带签名的临时访问链接
    if (url.pathname.startsWith('/share/')) {
      return handleSignedFileAccess(request, env, ctx);
    }
    
    // ================================
    // 📤 页面文件上传拦截 (重要!)
    // ================================
    
    // 拦截R2Explorer页面的文件上传请求
    if ((request.method === 'PUT' && 
         url.pathname.includes('/buckets/') && 
         !url.pathname.startsWith('/api/')) ||
        (request.method === 'POST' && 
         url.pathname === '/api/buckets/bucket/upload')) {
      console.log(`🎯 Intercepted page file upload: ${request.method} ${url.pathname}`);
      return handlePageFileUpload(request, env, ctx);
    }
    
    // ================================
    // 🖥️ 页面管理路由 (R2Explorer)
    // ================================
    
    // 其他所有请求交给 R2Explorer 处理（页面界面）
    return R2Explorer({
      readonly: false,
      basicAuth: {
        username: env.ADMIN_USERNAME || "admin",
        password: env.ADMIN_PASSWORD || "admin"
      },
    }).fetch(request, env as any, ctx);
  }
};

// ================================
// 📤 页面文件上传处理器
// ================================
async function handlePageFileUpload(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  try {
    console.log(`🖥️ Processing page file upload request: ${request.method}`);
    
    // 🔍 详细诊断请求格式
    console.log(`📋 Request headers:`, Object.fromEntries(request.headers.entries()));
    console.log(`📋 Content-Type:`, request.headers.get('Content-Type'));
    console.log(`📋 Content-Length:`, request.headers.get('Content-Length'));
    console.log(`📋 URL:`, request.url);
    
    // Basic Auth 认证检查
    const authResult = authenticatePageRequest(request, env);
    if (!authResult.success) {
      return authResult.response;
    }
    
    // 🪣 桶选择逻辑 - 页面上传支持指定桶或使用默认桶
    const url = new URL(request.url);
    let bucketName: string | null = null;
    let bucketConfig: BucketConfig | null = null;
    let targetBucket: R2Bucket | null = null;
    
    // 尝试从URL路径解析桶名称 (比如 /api/buckets/{bucketName}/upload)
    const bucketFromPath = parseBucketFromPath(url.pathname);
    if (bucketFromPath) {
      bucketName = bucketFromPath;
      bucketConfig = getBucketConfig(bucketName, env);
      if (bucketConfig) {
        targetBucket = getBucketInstance(bucketConfig, env);
        console.log(`🪣 Page upload to specific bucket: ${bucketName}`);
      }
    }
    
    // 如果没有指定桶或桶不可用，使用默认桶
    if (!targetBucket) {
      bucketName = 'bucket';
      bucketConfig = getBucketConfig('bucket', env);
      if (bucketConfig) {
        targetBucket = getBucketInstance(bucketConfig, env);
        console.log(`🪣 Page upload using default bucket: ${bucketName}`);
      }
    }
    
    // 如果还是没有可用的桶，返回错误
    if (!targetBucket || !bucketConfig) {
      return new Response('No bucket available for upload', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
    
    if (request.method === 'POST') {
      // 📋 解析R2Explorer的POST上传请求
      console.log(`📋 Processing POST upload request...`);
      
      const url = new URL(request.url);
      
      // 🎯 从URL参数中提取文件信息（R2Explorer的方式）
      const keyParam = url.searchParams.get('key');
      const httpMetadataParam = url.searchParams.get('httpMetadata');
      
      if (keyParam) {
        console.log(`📋 Found key parameter in URL: ${keyParam}`);
        
        try {
          // 解码文件名
          const decodedKey = decodeURIComponent(keyParam);
          const originalFilename = atob(decodedKey);
          console.log(`📁 Decoded filename: ${originalFilename}`);
          
          // 解码元数据
          let fileContentType = 'application/octet-stream';
          if (httpMetadataParam) {
            try {
              const metadataJson = JSON.parse(atob(httpMetadataParam));
              fileContentType = metadataJson.contentType || fileContentType;
              console.log(`📋 Decoded metadata:`, metadataJson);
            } catch (e) {
              console.log(`⚠️ Failed to parse metadata, using default`);
            }
          }
          
          // 🔍 检查文件是否已存在（防覆盖逻辑）
          console.log(`🔍 Checking if file exists: ${originalFilename}`);
          const existingObject = await targetBucket.get(originalFilename);
          
          if (existingObject) {
            console.log(`⚠️ File ${originalFilename} already exists! Applying conflict prevention...`);
            
            // 生成唯一文件名
            const timestamp = Date.now();
            const randomId = Math.random().toString(36).substring(2, 15);
            const extension = originalFilename.includes('.') ? originalFilename.split('.').pop() : '';
            const uniqueFilename = extension ? 
              `${timestamp}-${randomId}.${extension}` : 
              `${timestamp}-${randomId}`;
            
            console.log(`📝 Generated unique filename: ${uniqueFilename}`);
            
            // 准备自定义元数据
            const customMetadata: Record<string, string> = {
              originalFilename: originalFilename,
              uploadTime: new Date().toISOString(),
              uniqueId: `${timestamp}-${randomId}`,
              authType: 'basic-page',
              uploadSource: 'web-interface',
              userAgent: request.headers.get('User-Agent') || 'unknown',
              isVersioned: 'true',
              conflictWith: originalFilename,
              originalFileSize: existingObject.size.toString(),
              originalFileEtag: existingObject.etag
            };
            
            console.log(`⬆️ Uploading with conflict prevention...`);
            
            // 直接使用R2 API上传到新文件名
            const uploadResult = await targetBucket.put(uniqueFilename, request.body, {
              httpMetadata: {
                contentType: fileContentType,
              },
              customMetadata: customMetadata
            });
            
            if (uploadResult) {
              console.log(`✅ Conflict-safe upload successful: ${originalFilename} → ${uniqueFilename}`);
              console.log(`📊 File size: ${uploadResult.size} bytes`);
              console.log(`🔖 ETag: ${uploadResult.etag}`);
              
              return new Response('File uploaded successfully (conflict prevented)', {
                status: 201,
                headers: {
                  'Content-Type': 'text/plain',
                  'X-Upload-Result': 'success',
                  'X-Original-Filename': originalFilename,
                  'X-Stored-Filename': uniqueFilename,
                  'X-Conflict-Prevented': 'true',
                  'X-File-Size': uploadResult.size.toString(),
                  'X-Unique-Id': customMetadata.uniqueId,
                  'X-Upload-Handler': 'conflict-prevention'
                }
              });
            } else {
              console.error(`❌ Conflict-safe upload failed`);
              return new Response('Upload failed', {
                status: 500,
                headers: { 'Content-Type': 'text/plain' }
              });
            }
            
          } else {
            console.log(`✅ File ${originalFilename} does not exist, proceeding with normal upload...`);
            
            // 文件不存在，使用原始文件名并添加元数据
            const customMetadata: Record<string, string> = {
              originalFilename: originalFilename,
              uploadTime: new Date().toISOString(),
              uniqueId: `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
              authType: 'basic-page',
              uploadSource: 'web-interface',
              userAgent: request.headers.get('User-Agent') || 'unknown'
            };
            
            const uploadResult = await targetBucket.put(originalFilename, request.body, {
              httpMetadata: {
                contentType: fileContentType,
              },
              customMetadata: customMetadata
            });
            
            if (uploadResult) {
              console.log(`✅ Normal upload successful: ${originalFilename}`);
              console.log(`📊 File size: ${uploadResult.size} bytes`);
              console.log(`🔖 ETag: ${uploadResult.etag}`);
              
              return new Response('File uploaded successfully', {
                status: 200,
                headers: {
                  'Content-Type': 'text/plain',
                  'X-Upload-Result': 'success',
                  'X-Original-Filename': originalFilename,
                  'X-Stored-Filename': originalFilename,
                  'X-Conflict-Prevented': 'false',
                  'X-File-Size': uploadResult.size.toString(),
                  'X-Unique-Id': customMetadata.uniqueId,
                  'X-Upload-Handler': 'normal-upload'
                }
              });
            } else {
              console.error(`❌ Normal upload failed`);
              return new Response('Upload failed', {
                status: 500,
                headers: { 'Content-Type': 'text/plain' }
              });
            }
          }
          
        } catch (error) {
          console.error(`❌ Failed to decode key parameter:`, error);
          console.log(`🔄 Falling back to R2Explorer...`);
        }
      }
      
      // 如果没有key参数或解码失败，直接转发给R2Explorer
      console.log(`🔄 No key parameter found, forwarding to R2Explorer...`);
      return R2Explorer({
        readonly: false,
        basicAuth: {
          username: env.ADMIN_USERNAME || "admin",
          password: env.ADMIN_PASSWORD || "admin"
        },
      }).fetch(request, env as any, ctx);
      
    } else {
      // PUT请求的处理（原来的逻辑）
      console.log(`📋 Processing PUT upload`);
      
      const url = new URL(request.url);
      const filename = url.pathname.split('/').pop();
      
      if (!filename) {
        console.error(`❌ Invalid filename from PUT path: ${url.pathname}`);
        return new Response('Bad Request: Invalid filename', {
          status: 400,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
      
      // 调用通用上传逻辑
      const uploadResult = await processFileUpload(request, env, {
        authType: 'basic-page',
        uploadSource: 'web-interface'
      }, targetBucket);
      
      if (uploadResult.success) {
        console.log(`✅ Page upload successful: ${uploadResult.originalFilename} → ${uploadResult.storedFilename}`);
        
        return new Response('File uploaded successfully', {
          status: uploadResult.wasRenamed ? 201 : 200,
          headers: {
            'Content-Type': 'text/plain',
            'X-Upload-Result': 'success',
            'X-Original-Filename': uploadResult.originalFilename,
            'X-Stored-Filename': uploadResult.storedFilename,
            'X-Conflict-Prevented': uploadResult.conflictPrevented ? 'true' : 'false',
            'X-File-Size': uploadResult.size.toString(),
            'X-Unique-Id': uploadResult.uniqueId
          }
        });
      } else {
        console.error(`❌ Page upload failed: ${uploadResult.error}`);
        return new Response(uploadResult.error || 'Upload failed', {
          status: uploadResult.status || 500,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Page file upload error:', error);
    return new Response('Internal Server Error', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// ================================
// 🔐 页面认证检查 (Basic Auth)
// ================================
function authenticatePageRequest(request: Request, env: Env): { success: boolean; response?: Response } {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return {
      success: false,
      response: new Response('Unauthorized', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="R2 Explorer"',
          'Content-Type': 'text/plain'
        }
      })
    };
  }
  
  try {
    const credentials = atob(authHeader.replace('Basic ', ''));
    const [username, password] = credentials.split(':');
    const expectedUsername = env.ADMIN_USERNAME || 'admin';
    const expectedPassword = env.ADMIN_PASSWORD || 'admin';
    
    if (username === expectedUsername && password === expectedPassword) {
      console.log(`✅ Page request authenticated successfully`);
      return { success: true };
    } else {
      console.log(`❌ Page authentication failed: invalid credentials`);
      return {
        success: false,
        response: new Response('Unauthorized', {
          status: 401,
          headers: {
            'WWW-Authenticate': 'Basic realm="R2 Explorer"',
            'Content-Type': 'text/plain'
          }
        })
      };
    }
  } catch (e) {
    console.log(`❌ Page authentication failed: malformed credentials`);
    return {
      success: false,
      response: new Response('Unauthorized', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="R2 Explorer"',
          'Content-Type': 'text/plain'
        }
      })
    };
  }
}

// ================================
// 📁 通用文件上传逻辑 (核心逻辑)
// ================================
interface UploadOptions {
  authType: string;
  uploadSource?: string;
}

interface UploadResult {
  success: boolean;
  originalFilename?: string;
  storedFilename?: string;
  uniqueId?: string;
  wasRenamed?: boolean;
  conflictPrevented?: boolean;
  size?: number;
  etag?: string;
  customMetadata?: Record<string, string>;
  shareUrls?: any;
  error?: string;
  status?: number;
}

async function processFileUpload(request: Request, env: Env, options: UploadOptions, targetBucket?: R2Bucket): Promise<UploadResult> {
  try {
    const url = new URL(request.url);
    const originalFilename = url.pathname.split('/').pop();
    
    if (!originalFilename) {
      return {
        success: false,
        error: 'Invalid filename',
        status: 400
      };
    }

    console.log(`📁 Processing upload for: ${originalFilename} (${options.authType})`);

    // 生成唯一文件名以防止覆盖
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    const extension = originalFilename.includes('.') ? originalFilename.split('.').pop() : '';
    const uniqueFilename = extension ? 
      `${timestamp}-${randomId}.${extension}` : 
      `${timestamp}-${randomId}`;

    // 使用传入的桶或默认桶
    const bucket = targetBucket || env.bucket;
    if (!bucket) {
      return {
        success: false,
        error: 'No bucket available',
        status: 503
      };
    }

    // 检查原始文件名是否已存在
    const existingObject = await bucket.get(originalFilename);
    const finalFilename = existingObject ? uniqueFilename : originalFilename;
    const wasRenamed = finalFilename !== originalFilename;
    
    console.log(`🔍 File exists check: ${existingObject ? 'EXISTS (will rename)' : 'NEW (use original name)'}`);
    console.log(`📝 Final filename: ${finalFilename}`);
    
    // 准备自定义元数据
    const customMetadata: Record<string, string> = {
      originalFilename: originalFilename,
      uploadTime: new Date().toISOString(),
      uniqueId: `${timestamp}-${randomId}`,
      authType: options.authType,
      userAgent: request.headers.get('User-Agent') || 'unknown'
    };

    if (options.uploadSource) {
      customMetadata.uploadSource = options.uploadSource;
    }

    // 如果是重名文件，标记为版本化文件
    if (existingObject) {
      customMetadata.isVersioned = 'true';
      customMetadata.conflictWith = originalFilename;
      customMetadata.originalFileSize = existingObject.size.toString();
      customMetadata.originalFileEtag = existingObject.etag;
      console.log(`⚠️ File conflict detected! Original file size: ${existingObject.size} bytes`);
    }

    // 获取Content-Type
    const contentType = request.headers.get('Content-Type') || 'application/octet-stream';

    console.log(`⬆️ Starting upload with metadata:`, customMetadata);

    // 直接使用R2 API上传，包含元数据
    const uploadResult = await bucket.put(finalFilename, request.body, {
      httpMetadata: {
        contentType: contentType,
      },
      customMetadata: customMetadata
    });
    
    if (uploadResult) {
      console.log(`✅ File uploaded successfully!`);
      console.log(`📂 Stored as: ${finalFilename}`);
      console.log(`📊 File size: ${uploadResult.size} bytes`);
      console.log(`🔖 ETag: ${uploadResult.etag}`);
      console.log(`🎯 Conflict resolution: ${wasRenamed ? 'RENAMED (prevented overwrite)' : 'ORIGINAL NAME (no conflict)'}`);
      
      return {
        success: true,
        originalFilename,
        storedFilename: finalFilename,
        uniqueId: customMetadata.uniqueId,
        wasRenamed,
        conflictPrevented: !!existingObject,
        size: uploadResult.size,
        etag: uploadResult.etag,
        customMetadata
      };
    } else {
      console.error(`❌ Upload failed: uploadResult is null`);
      return {
        success: false,
        error: 'Failed to store file in R2 bucket - uploadResult was null',
        status: 500
      };
    }
    
  } catch (error) {
    console.error('❌ File upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500
    };
  }
}

// ================================
// 🛠️ API 路由处理器
// ================================
async function handleAPIRoutes(request: Request, env: Env, ctx: ExecutionContext, bucketConfig: BucketConfig, targetBucket: R2Bucket): Promise<Response> {
  const url = new URL(request.url);
  console.log(`🔧 API Route: ${request.method} ${url.pathname}`);
  
  // 认证检查 (Bearer Token)
  const authResult = authenticateAPIRequest(request, env, bucketConfig.apiToken);
  if (!authResult.success) {
    return authResult.response;
  }
  
  // 🎯 文件上传处理 (PUT /api/buckets/...)
  if (request.method === 'PUT' && url.pathname.includes('/buckets/')) {
    console.log(`📤 File upload detected: ${url.pathname}`);
    return handleFileUpload(request, env, ctx, bucketConfig, targetBucket);
  }
  
  // 🔗 分享链接生成 (POST /api/share)
  if (url.pathname === '/api/share' && request.method === 'POST') {
    return handleShareRequest(request, env, bucketConfig);
  }
  
  // 📋 文件列表 (GET /api/files)
  if (url.pathname === '/api/files' && request.method === 'GET') {
    return handleFileListRequest(request, env, bucketConfig);
  }
  
  // 🔍 文件元数据 (POST /api/metadata)
  if (url.pathname === '/api/metadata' && request.method === 'POST') {
    return handleMetadataRequest(request, env, bucketConfig);
  }
  
  // 📥 文件下载 (GET /api/buckets/...?download=true)
  if (request.method === 'GET' && url.pathname.includes('/buckets/') && url.searchParams.get('download') === 'true') {
    return handleFileDownload(request, env, ctx, bucketConfig);
  }
  
  // CORS 预检请求 (这个已被全局处理，但保留以防万一)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...getCORSHeaders(),
        'Access-Control-Max-Age': '86400',
      }
    });
  }
  
  // 🔄 其他API请求转发给 R2Explorer (不需要Basic Auth)
  try {
    console.log(`🔄 Forwarding API request to R2Explorer: ${url.pathname}`);
    const r2Response = await R2Explorer({
      readonly: false,
      // API请求不需要Basic Auth，因为已经通过Bearer Token认证
    }).fetch(request, env as any, ctx);
    
    // 添加 CORS 头
    const response = new Response(r2Response.body, {
      status: r2Response.status,
      headers: addCORSHeaders({
        ...Object.fromEntries(r2Response.headers),
      })
    });
    
    return response;
  } catch (error) {
    console.error('R2Explorer API error:', error);
    return new Response(JSON.stringify({
      error: 'Internal Server Error',
      message: 'Failed to process API request'
    }), {
      status: 500,
      headers: addCORSHeaders({
        'Content-Type': 'application/json',
      })
    });
  }
}

// ================================
// 🔐 API 认证检查
// ================================
function authenticateAPIRequest(request: Request, env: Env, expectedToken: string): { success: boolean; response?: Response } {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      success: false,
      response: new Response(JSON.stringify({
        error: 'Unauthorized',
        message: 'Missing Bearer token for API access',
        required: 'Authorization: Bearer YOUR_TOKEN'
      }), {
        status: 401,
        headers: addCORSHeaders({
          'Content-Type': 'application/json',
        })
      })
    };
  }
  
  const token = authHeader.replace('Bearer ', '');
  console.log(`🔍 API token: ${token}, expectedToken: ${expectedToken}`);
  if (token !== expectedToken) {
    return {
      success: false,
      response: new Response(JSON.stringify({
        error: 'Unauthorized',
        message: 'Invalid Bearer token'
      }), {
        status: 401,
        headers: addCORSHeaders({
          'Content-Type': 'application/json',
        })
      })
    };
  }
  
  console.log(`✅ API request authenticated successfully`);
  return { success: true };
}

async function handleSignedFileAccess(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  
  // 解析签名链接：/share/{filename}?signature={sig}&expires={exp}&download={true/false}
  const filename = url.pathname.replace('/share/', '');
  const signature = url.searchParams.get('signature');
  const expires = url.searchParams.get('expires');
  const forceDownload = url.searchParams.get('download') === 'true';
  
  if (!filename || !signature || !expires) {
    return new Response(JSON.stringify({
      error: 'Invalid share link',
      message: 'Missing required parameters'
    }), {
      status: 400,
      headers: addCORSHeaders({
        'Content-Type': 'application/json',
      })
    });
  }
  
  // 验证有效期
  const expirationTime = parseInt(expires);
  if (Date.now() > expirationTime) {
    return new Response(JSON.stringify({
      error: 'Link expired',
      message: 'This share link has expired'
    }), {
      status: 410,
      headers: addCORSHeaders({
        'Content-Type': 'application/json',
      })
    });
  }
  
  // 验证签名
  const expectedSignature = await generateSignature(filename, expires, env.BUCKET_DEFAULT_API_TOKEN || 'sk-dev-7C021EA0-386B-4908-BFDD-3ACC55B2BD6F');
  if (signature !== expectedSignature) {
    return new Response(JSON.stringify({
      error: 'Invalid signature',
      message: 'This share link is invalid or tampered'
    }), {
      status: 403,
      headers: addCORSHeaders({
        'Content-Type': 'application/json',
      })
    });
  }
  
  try {
    // 验证通过，从 R2 获取文件
    // 对于签名链接，默认使用默认桶，也可以通过URL参数指定桶
    let targetBucket = env.bucket;
    const bucketParam = url.searchParams.get('bucket');
    if (bucketParam) {
      const bucketConfig = getBucketConfig(bucketParam, env);
      if (bucketConfig) {
        const bucket = getBucketInstance(bucketConfig, env);
        if (bucket) {
          targetBucket = bucket;
          console.log(`🪣 Signed access using specified bucket: ${bucketParam}`);
        }
      }
    }
    
    const object = await targetBucket.get(filename);
    
    if (!object) {
      return new Response(JSON.stringify({
        error: 'File not found',
        message: 'The requested file does not exist',
        filename
      }), {
        status: 404,
        headers: addCORSHeaders({
          'Content-Type': 'application/json',
        })
      });
    }
    
    // 构建响应头
    const headers: Record<string, string> = {
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      'Content-Length': object.size.toString(),
      'ETag': object.httpEtag,
      'Last-Modified': object.uploaded.toUTCString(),
      'Cache-Control': 'private, max-age=3600', 
    };
    
    // 如果要求强制下载，添加 Content-Disposition 头
    if (forceDownload) {
      const encodedFilename = encodeURIComponent(filename);
      headers['Content-Disposition'] = `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`;
    }
    
    // 返回文件内容 (添加CORS头)
    return new Response(object.body, {
      status: 200,
      headers: addCORSHeaders(headers)
    });
    
  } catch (error) {
    console.error('Signed file access error:', error);
    return new Response('Internal Server Error', {
      status: 500,
      headers: addCORSHeaders({
        'Content-Type': 'text/plain',
      })
    });
  }
}

async function generateSignature(filename: string, expires: string, secret: string): Promise<string> {
  const message = `${filename}:${expires}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const keyData = encoder.encode(secret);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, data);
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function handleFileUpload(request: Request, env: Env, ctx: ExecutionContext, bucketConfig: BucketConfig, targetBucket: R2Bucket): Promise<Response> {
  try {
    console.log(`🎯 Processing file upload request for bucket ${bucketConfig.bucketName}`);
    
    const url = new URL(request.url);
    const originalFilename = url.pathname.split('/').pop();
    
    if (!originalFilename) {
      return new Response(JSON.stringify({
        error: 'Bad Request',
        message: 'Invalid filename'
      }), {
        status: 400,
        headers: addCORSHeaders({
          'Content-Type': 'application/json',
        })
      });
    }

    console.log(`📁 Processing upload for: ${originalFilename}`);

    // 调用通用上传逻辑
    const uploadResult = await processFileUpload(request, env, {
      authType: 'bearer-api',
      uploadSource: 'api-interface'
    }, targetBucket);
    
    if (uploadResult.success) {
      // 生成分享链接
      const shareData = await generateShareUrls(uploadResult.storedFilename, env, request, getShareLinkExpiresIn(env), bucketConfig);
      
      // 返回详细的上传信息
      return new Response(JSON.stringify({
        success: true,
        message: 'File uploaded successfully',
        file: {
          originalFilename: uploadResult.originalFilename,
          storedFilename: uploadResult.storedFilename,
          uniqueId: uploadResult.uniqueId,
          wasRenamed: uploadResult.wasRenamed,
          conflictResolution: uploadResult.wasRenamed ? 'renamed_with_unique_id' : 'used_original_name',
          size: uploadResult.size,
          etag: uploadResult.etag,
          conflictPrevented: uploadResult.conflictPrevented
        },
        share_urls: shareData
      }), {
        status: 201,
        headers: addCORSHeaders({
          'Content-Type': 'application/json',
        })
      });
    } else {
      console.error(`❌ Upload failed: uploadResult is null`);
      return new Response(JSON.stringify({
        error: 'Upload failed',
        message: 'Failed to store file in R2 bucket - uploadResult was null'
      }), {
        status: 500,
        headers: addCORSHeaders({
          'Content-Type': 'application/json',
        })
      });
    }
    
  } catch (error) {
    console.error('❌ File upload error:', error);
    return new Response(JSON.stringify({
      error: 'Upload failed',
      message: 'Failed to upload file',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: addCORSHeaders({
        'Content-Type': 'application/json',
      })
    });
  }
}

async function handleFileDownload(request: Request, env: Env, ctx: ExecutionContext, bucketConfig: BucketConfig): Promise<Response> {
  try {
    // 先获取文件
    const r2Response = await R2Explorer({
      readonly: false,
    }).fetch(request, env as any, ctx);
    
    if (r2Response.status === 200) {
      const url = new URL(request.url);
      const filename = url.pathname.split('/').pop() || 'download';
      
      // 添加强制下载头
      const headers = new Headers(r2Response.headers);
      const encodedFilename = encodeURIComponent(filename);
      headers.set('Content-Disposition', `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`);
      headers.set('Access-Control-Allow-Origin', '*');
      
      return new Response(r2Response.body, {
        status: r2Response.status,
        headers
      });
    }
    
    // 如果文件不存在或其他错误，返回错误响应
    return new Response(JSON.stringify({
      error: 'Download failed',
      message: 'File not found or cannot be downloaded',
      status: r2Response.status
    }), {
      status: r2Response.status,
      headers: addCORSHeaders({
        'Content-Type': 'application/json',
      })
    });
    
  } catch (error) {
    console.error('File download error:', error);
    return new Response(JSON.stringify({
      error: 'Download failed',
      message: 'Failed to download file'
    }), {
      status: 500,
      headers: addCORSHeaders({
        'Content-Type': 'application/json',
      })
    });
  }
}

async function generateShareUrls(filename: string, env: Env, request: Request, expires_in?: number, bucketConfig?: BucketConfig): Promise<any> {
  const workerDomain = new URL(request.url).origin;
  const defaultExpiresIn = getShareLinkExpiresIn(env);
  const actualExpiresIn = expires_in || defaultExpiresIn;
  
  // 根据桶配置决定public链接的过期时间
  let publicExpiresIn: number;
  if (bucketConfig?.public) {
    // 如果桶是公开的，使用超长过期时间
    publicExpiresIn = getPublicLinkExpiresIn(env);
    console.log(`🔗 Generating URLs for public bucket - public expiry: ${publicExpiresIn} seconds (${publicExpiresIn / 3600} hours)`);
  } else {
    // 如果桶不是公开的，使用正常过期时间
    publicExpiresIn = actualExpiresIn;
    console.log(`🔗 Generating URLs for private bucket - normal expiry: ${publicExpiresIn} seconds (${publicExpiresIn / 3600} hours)`);
  }
  
  const publicExpirationTime = Date.now() + (publicExpiresIn * 1000);
  const publicExpirationDate = new Date(publicExpirationTime);
  
  // 检查文件是否存在并获取信息
  // 使用传入的桶配置或默认桶
  const bucket = bucketConfig ? getBucketInstance(bucketConfig, env) || env.bucket : env.bucket;
  const object = await bucket.get(filename);
  if (!object) {
    throw new Error('File not found');
  }
  
  // 生成签名用的token（根据桶配置使用对应的token）
  const signingToken = bucketConfig?.apiToken || env.BUCKET_DEFAULT_API_TOKEN || 'sk-dev-7C021EA0-386B-4908-BFDD-3ACC55B2BD6F';
  const signature = await generateSignature(filename, publicExpirationTime.toString(), signingToken);
  
  // 确定桶名称用于URL参数（如果不是默认桶，需要在URL中指定）
  const bucketKey = bucketConfig?.binding || 'bucket';
  const bucketParam = bucketKey !== 'bucket' ? `&bucket=${bucketKey}` : '';
  
  // 生成分享链接 - 统一结构
  const shareUrls: any = {
    // 受保护的 Worker API 链接（需要 Bearer Token）
    protected: {
      view: `${workerDomain}/api/buckets/${bucketKey}/${encodeURIComponent(filename)}`,
      download: `${workerDomain}/api/buckets/${bucketKey}/${encodeURIComponent(filename)}?download=true`
    },
    
    // 公开访问链接（带签名的临时访问链接，包含桶参数）
    public: {
      view: `${workerDomain}/share/${encodeURIComponent(filename)}?signature=${signature}&expires=${publicExpirationTime}${bucketParam}`,
      download: `${workerDomain}/share/${encodeURIComponent(filename)}?signature=${signature}&expires=${publicExpirationTime}&download=true${bucketParam}`,
      expires_at: publicExpirationDate.toISOString(),
      expires_in_hours: Math.round(publicExpiresIn / 3600),
      is_long_term: bucketConfig?.public || false
    }
  };
  
  return shareUrls;
}

async function handleShareRequest(request: Request, env: Env, bucketConfig: BucketConfig): Promise<Response> {
  try {
    const body = await request.json() as { 
      filename: string; 
      expires_in?: number; // 有效期（秒），如果不指定则使用环境变量配置
    };
    
    const defaultExpiresIn = getShareLinkExpiresIn(env);
    const { filename, expires_in = defaultExpiresIn } = body;
    
    console.log(`📋 Share request: filename=${filename}, expires_in=${expires_in}s (${expires_in / 3600}h), bucket_public=${bucketConfig.public}`);
    
    if (!filename) {
      return new Response(JSON.stringify({
        error: 'Bad Request',
        message: 'filename is required'
      }), {
        status: 400,
        headers: addCORSHeaders({
          'Content-Type': 'application/json',
        })
      });
    }
    
    // 检查文件是否存在
    const bucket = getBucketInstance(bucketConfig, env);
    if (!bucket) {
      return new Response(JSON.stringify({
        error: 'Bucket Not Available',
        message: 'The specified bucket is not available'
      }), {
        status: 503,
        headers: addCORSHeaders({
          'Content-Type': 'application/json',
        })
      });
    }
    
    const object = await bucket.get(filename);
    if (!object) {
      return new Response(JSON.stringify({
        error: 'File not found',
        message: 'The specified file does not exist',
        filename
      }), {
        status: 404,
        headers: addCORSHeaders({
          'Content-Type': 'application/json',
        })
      });
    }
    
    // 使用统一的generateShareUrls函数生成链接
    const shareUrls = await generateShareUrls(filename, env, request, expires_in, bucketConfig);
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Share URLs generated successfully',
      data: shareUrls
    }), {
      status: 200,
      headers: addCORSHeaders({
        'Content-Type': 'application/json',
      })
    });
    
  } catch (error) {
    console.error('Share request error:', error);
    return new Response(JSON.stringify({
      error: 'Internal Server Error',
      message: 'Failed to generate share URLs'
    }), {
      status: 500,
      headers: addCORSHeaders({
        'Content-Type': 'application/json',
      })
    });
  }
}

async function handleMetadataRequest(request: Request, env: Env, bucketConfig: BucketConfig): Promise<Response> {
  try {
    const body = await request.json() as { filename: string };
    const { filename } = body;

    if (!filename) {
      return new Response(JSON.stringify({
        error: 'Bad Request',
        message: 'filename is required'
      }), {
        status: 400,
        headers: addCORSHeaders({
          'Content-Type': 'application/json',
        })
      });
    }

    const bucket = getBucketInstance(bucketConfig, env);
    if (!bucket) {
      return new Response(JSON.stringify({
        error: 'Bucket Not Available',
        message: 'The specified bucket is not available'
      }), {
        status: 503,
        headers: addCORSHeaders({
          'Content-Type': 'application/json',
        })
      });
    }
    
    const object = await bucket.get(filename);
    if (!object) {
      return new Response(JSON.stringify({
        error: 'File not found',
        message: 'The specified file does not exist',
        filename
      }), {
        status: 404,
        headers: addCORSHeaders({
          'Content-Type': 'application/json',
        })
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'File metadata retrieved successfully',
      metadata: {
        filename: filename,
        size: object.size,
        contentType: object.httpMetadata?.contentType || 'application/octet-stream',
        lastModified: object.uploaded.toISOString(),
        etag: object.httpEtag,
        customMetadata: object.customMetadata
      }
    }), {
      status: 200,
      headers: addCORSHeaders({
        'Content-Type': 'application/json',
      })
    });
  } catch (error) {
    console.error('Metadata request error:', error);
    return new Response(JSON.stringify({
      error: 'Internal Server Error',
      message: 'Failed to retrieve file metadata'
    }), {
      status: 500,
      headers: addCORSHeaders({
        'Content-Type': 'application/json',
      })
    });
  }
}

async function handleFileListRequest(request: Request, env: Env, bucketConfig: BucketConfig): Promise<Response> {
  try {
    const url = new URL(request.url);
    
    // 获取查询参数
    const prefix = url.searchParams.get('prefix') || '';
    const limit = parseInt(url.searchParams.get('limit') || '100');
    
    const bucket = getBucketInstance(bucketConfig, env);
    if (!bucket) {
      return new Response(JSON.stringify({
        error: 'Bucket Not Available',
        message: 'The specified bucket is not available'
      }), {
        status: 503,
        headers: addCORSHeaders({
          'Content-Type': 'application/json',
        })
      });
    }
    
    const objects = await bucket.list({
      prefix: prefix,
      limit: Math.min(limit, 1000), // 最大1000个文件
    });

    const fileList = objects.objects.map(obj => ({
      name: obj.key,
      size: obj.size,
      lastModified: obj.uploaded.toISOString(),
      etag: obj.httpEtag,
      customMetadata: obj.customMetadata,
      // 如果有原始文件名，显示它
      displayName: obj.customMetadata?.originalFilename || obj.key,
      isVersioned: obj.customMetadata?.isVersioned === 'true'
    }));

    return new Response(JSON.stringify({
      success: true,
      message: 'File list retrieved successfully',
      files: fileList,
      total: objects.objects.length,
      truncated: objects.truncated,
      prefix: prefix || 'all files'
    }), {
      status: 200,
      headers: addCORSHeaders({
        'Content-Type': 'application/json',
      })
    });
  } catch (error) {
    console.error('File list request error:', error);
    return new Response(JSON.stringify({
      error: 'Internal Server Error',
      message: 'Failed to retrieve file list'
    }), {
      status: 500,
      headers: addCORSHeaders({
        'Content-Type': 'application/json',
      })
    });
  }
}

// ================================
// 🌐 R2公开访问代理处理器 (规避CORS问题)
// ================================
async function handleR2Proxy(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  try {
    console.log(`🌐 R2 Proxy request: ${request.method} ${request.url}`);
    
    // 检查代理功能是否启用
    const proxyEnabled = env.R2_PROXY_ENABLED === 'true';
    if (!proxyEnabled) {
      console.log(`❌ R2 Proxy is disabled`);
      return new Response(JSON.stringify({
        error: 'Proxy Disabled',
        message: 'R2 proxy functionality is not enabled'
      }), {
        status: 503,
        headers: addCORSHeaders({
          'Content-Type': 'application/json',
        })
      });
    }
    
    // 检查是否需要认证
    const requireAuth = env.R2_PROXY_REQUIRE_AUTH === 'true';
    if (requireAuth) {
      const authResult = authenticateAPIRequest(request, env, env.BUCKET_DEFAULT_API_TOKEN || 'sk-dev-7C021EA0-386B-4908-BFDD-3ACC55B2BD6F');
      if (!authResult.success) {
        return authResult.response;
      }
    }
    
    // 获取固定的R2域名
    const r2Domain = env.R2_PROXY_DOMAIN;
    if (!r2Domain) {
      console.error(`❌ R2_PROXY_DOMAIN not configured`);
      return new Response(JSON.stringify({
        error: 'Configuration Error',
        message: 'R2 proxy domain is not configured'
      }), {
        status: 500,
        headers: addCORSHeaders({
          'Content-Type': 'application/json',
        })
      });
    }
    
    // 解析代理路径: /proxy/{filename}
    const url = new URL(request.url);
    const filename = url.pathname.replace('/proxy/', '');
    
    if (!filename) {
      return new Response(JSON.stringify({
        error: 'Bad Request',
        message: 'Filename is required in proxy path'
      }), {
        status: 400,
        headers: addCORSHeaders({
          'Content-Type': 'application/json',
        })
      });
    }
    
    // 解码URL编码的文件名
    const decodedFilename = decodeURIComponent(filename);
    
    console.log(`🌐 Proxying request for: ${decodedFilename} to ${r2Domain}`);
    
    // 构建目标R2 URL - 使用解码后的文件名
    const targetUrl = `https://${r2Domain}/${decodedFilename}`;
    
    // 准备请求头
    const headers = new Headers();
    
    // 复制原始请求的重要头部
    const originalHeaders = request.headers;
    const allowedHeaders = [
      'Accept',
      'Accept-Encoding',
      'Accept-Language',
      'Cache-Control',
      'If-Modified-Since',
      'If-None-Match',
      'Range'
    ];
    
    for (const header of allowedHeaders) {
      const value = originalHeaders.get(header);
      if (value) {
        headers.set(header, value);
      }
    }
    
    // 设置User-Agent（避免被R2拒绝）
    headers.set('User-Agent', 'R2-Explorer-Proxy/1.0');
    
    // 检查是否要求强制下载
    const forceDownload = url.searchParams.get('download') === 'true';
    
    console.log(`🌐 Fetching from: ${targetUrl}`);
    
    // 发起代理请求
    const proxyResponse = await fetch(targetUrl, {
      method: request.method,
      headers: headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined
    });
    
    console.log(`🌐 Proxy response status: ${proxyResponse.status}`);
    
    // 构建响应头
    const responseHeaders = new Headers();
    
    // 复制原始响应头
    for (const [key, value] of proxyResponse.headers.entries()) {
      // 跳过一些不应该转发的头部
      if (!['server', 'cf-ray', 'cf-cache-status', 'cf-request-id'].includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    }
    
    // 添加CORS头
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Accept, Accept-Encoding, Accept-Language, Cache-Control, If-Modified-Since, If-None-Match, Range');
    responseHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type, ETag, Last-Modified');
    
    // 如果要求强制下载，添加Content-Disposition头
    if (forceDownload) {
      const encodedFilename = encodeURIComponent(decodedFilename);
      responseHeaders.set('Content-Disposition', `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`);
    }
    
    // 添加代理标识
    responseHeaders.set('X-Proxy-Source', 'R2-Explorer-Proxy');
    responseHeaders.set('X-Original-URL', targetUrl);
    
    // 检查响应状态
    if (!proxyResponse.ok) {
      console.log(`❌ R2 returned error status: ${proxyResponse.status}`);
      return new Response(JSON.stringify({
        error: 'File Not Found',
        message: `File not found on R2: ${decodedFilename}`,
        status: proxyResponse.status
      }), {
        status: proxyResponse.status,
        headers: addCORSHeaders({
          'Content-Type': 'application/json',
        })
      });
    }

    // 获取响应体
    const responseBody = proxyResponse.body;
    if (!responseBody) {
      console.error('❌ R2 response body is null');
      return new Response(JSON.stringify({
        error: 'Empty Response',
        message: 'R2 returned empty response'
      }), {
        status: 500,
        headers: addCORSHeaders({
          'Content-Type': 'application/json',
        })
      });
    }

    // 返回代理响应
    return new Response(responseBody, {
      status: proxyResponse.status,
      statusText: proxyResponse.statusText,
      headers: responseHeaders
    });
    
  } catch (error) {
    console.error('❌ R2 Proxy error:', error);
    return new Response(JSON.stringify({
      error: 'Proxy Error',
      message: 'Failed to proxy request to R2',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: addCORSHeaders({
        'Content-Type': 'application/json',
      })
    });
  }
}
