import { R2Explorer } from "r2-explorer";

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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    console.log(`🌐 Incoming request: ${request.method} ${url.pathname}`);
    
    // ================================
    // 🎯 API 路由 (优先级最高)
    // ================================
    
    // 🎯 自定义API端点 (需要Bearer Token)
    const customAPIEndpoints = [
      '/api/share',
      '/api/files', 
      '/api/metadata'
    ];
    
    // 🎯 文件上传API (需要Bearer Token)
    if (request.method === 'PUT' && url.pathname.startsWith('/api/buckets/')) {
      console.log(`📤 API file upload detected: ${url.pathname}`);
      return handleAPIRoutes(request, env, ctx);
    }
    
    // 🎯 自定义API端点 (需要Bearer Token)
    if (customAPIEndpoints.some(endpoint => url.pathname === endpoint)) {
      console.log(`🔧 Custom API endpoint: ${url.pathname}`);
      return handleAPIRoutes(request, env, ctx);
    }
    
    // 🎯 文件下载API with download参数 (需要Bearer Token)
    if (request.method === 'GET' && 
        url.pathname.startsWith('/api/buckets/') && 
        url.searchParams.get('download') === 'true') {
      console.log(`📥 API download request: ${url.pathname}`);
      return handleAPIRoutes(request, env, ctx);
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
          const existingObject = await env.bucket.get(originalFilename);
          
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
            const uploadResult = await env.bucket.put(uniqueFilename, request.body, {
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
            
            const uploadResult = await env.bucket.put(originalFilename, request.body, {
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
      });
      
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

async function processFileUpload(request: Request, env: Env, options: UploadOptions): Promise<UploadResult> {
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

    // 检查原始文件名是否已存在
    const existingObject = await env.bucket.get(originalFilename);
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
    const uploadResult = await env.bucket.put(finalFilename, request.body, {
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
async function handleAPIRoutes(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  console.log(`🔧 API Route: ${request.method} ${url.pathname}`);
  
  // 认证检查 (Bearer Token)
  const authResult = authenticateAPIRequest(request, env);
  if (!authResult.success) {
    return authResult.response;
  }
  
  // 🎯 文件上传处理 (PUT /api/buckets/...)
  if (request.method === 'PUT' && url.pathname.includes('/buckets/')) {
    console.log(`📤 File upload detected: ${url.pathname}`);
    return handleFileUpload(request, env, ctx);
  }
  
  // 🔗 分享链接生成 (POST /api/share)
  if (url.pathname === '/api/share' && request.method === 'POST') {
    return handleShareRequest(request, env);
  }
  
  // 📋 文件列表 (GET /api/files)
  if (url.pathname === '/api/files' && request.method === 'GET') {
    return handleFileListRequest(request, env);
  }
  
  // 🔍 文件元数据 (POST /api/metadata)
  if (url.pathname === '/api/metadata' && request.method === 'POST') {
    return handleMetadataRequest(request, env);
  }
  
  // 📥 文件下载 (GET /api/buckets/...?download=true)
  if (request.method === 'GET' && url.pathname.includes('/buckets/') && url.searchParams.get('download') === 'true') {
    return handleFileDownload(request, env, ctx);
  }
  
  // CORS 预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
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
      headers: {
        ...Object.fromEntries(r2Response.headers),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      }
    });
    
    return response;
  } catch (error) {
    console.error('R2Explorer API error:', error);
    return new Response(JSON.stringify({
      error: 'Internal Server Error',
      message: 'Failed to process API request'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
}

// ================================
// 🔐 API 认证检查
// ================================
function authenticateAPIRequest(request: Request, env: Env): { success: boolean; response?: Response } {
  const authHeader = request.headers.get('Authorization');
  const expectedToken = env.API_TOKEN || 'sk-dev-7C021EA0-386B-4908-BFDD-3ACC55B2BD6F';
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      success: false,
      response: new Response(JSON.stringify({
        error: 'Unauthorized',
        message: 'Missing Bearer token for API access',
        required: 'Authorization: Bearer YOUR_TOKEN'
      }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        }
      })
    };
  }
  
  const token = authHeader.replace('Bearer ', '');
  if (token !== expectedToken) {
    return {
      success: false,
      response: new Response(JSON.stringify({
        error: 'Unauthorized',
        message: 'Invalid Bearer token'
      }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
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
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
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
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
  
  // 验证签名
  const expectedSignature = await generateSignature(filename, expires, env.API_TOKEN || 'sk-dev-7C021EA0-386B-4908-BFDD-3ACC55B2BD6F');
  if (signature !== expectedSignature) {
    return new Response(JSON.stringify({
      error: 'Invalid signature',
      message: 'This share link is invalid or tampered'
    }), {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
  
  try {
    // 验证通过，从 R2 获取文件
    const object = await env.bucket.get(filename);
    
    if (!object) {
      return new Response(JSON.stringify({
        error: 'File not found',
        message: 'The requested file does not exist',
        filename
      }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }
    
    // 构建响应头
    const headers: Record<string, string> = {
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      'Content-Length': object.size.toString(),
      'ETag': object.httpEtag,
      'Last-Modified': object.uploaded.toUTCString(),
      'Cache-Control': 'private, max-age=3600', // 1小时缓存，因为有有效期
      'Access-Control-Allow-Origin': '*',
    };
    
    // 如果要求强制下载，添加 Content-Disposition 头
    if (forceDownload) {
      const encodedFilename = encodeURIComponent(filename);
      headers['Content-Disposition'] = `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`;
    }
    
    // 返回文件内容
    return new Response(object.body, {
      status: 200,
      headers
    });
    
  } catch (error) {
    console.error('Signed file access error:', error);
    return new Response('Internal Server Error', {
      status: 500,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
      }
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

async function handleFileUpload(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  try {
    console.log(`🎯 Processing file upload request`);
    
    const url = new URL(request.url);
    const originalFilename = url.pathname.split('/').pop();
    
    if (!originalFilename) {
      return new Response(JSON.stringify({
        error: 'Bad Request',
        message: 'Invalid filename'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    console.log(`📁 Processing upload for: ${originalFilename}`);

    // 调用通用上传逻辑
    const uploadResult = await processFileUpload(request, env, {
      authType: 'bearer-api',
      uploadSource: 'api-interface'
    });
    
    if (uploadResult.success) {
      // 生成分享链接
      const shareData = await generateShareUrls(uploadResult.storedFilename, env, request, getShareLinkExpiresIn(env));
      
      // 返回详细的上传信息
      return new Response(JSON.stringify({
        success: true,
        message: 'File uploaded successfully with conflict prevention',
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
        share_urls: shareData,
        metadata: uploadResult.customMetadata,
        upload_info: {
          method: 'PUT',
          originalUrl: url.href,
          finalUrl: url.href.replace(uploadResult.originalFilename, uploadResult.storedFilename),
          timestamp: Date.now(),
          authType: 'bearer-api'
        }
      }), {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        }
      });
    } else {
      console.error(`❌ Upload failed: uploadResult is null`);
      return new Response(JSON.stringify({
        error: 'Upload failed',
        message: 'Failed to store file in R2 bucket - uploadResult was null'
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
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
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
}

async function handleFileDownload(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
    
  } catch (error) {
    console.error('File download error:', error);
    return new Response(JSON.stringify({
      error: 'Download failed',
      message: 'Failed to download file'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
}

async function generateShareUrls(filename: string, env: Env, request: Request, expires_in?: number): Promise<any> {
  const workerDomain = new URL(request.url).origin;
  const defaultExpiresIn = getShareLinkExpiresIn(env);
  const actualExpiresIn = expires_in || defaultExpiresIn;
  const expirationTime = Date.now() + (actualExpiresIn * 1000);
  const expirationDate = new Date(expirationTime);
  
  console.log(`🔗 Generating share URLs with expiry: ${actualExpiresIn} seconds (${actualExpiresIn / 3600} hours)`);
  
  // 检查文件是否存在并获取信息
  const object = await env.bucket.get(filename);
  if (!object) {
    throw new Error('File not found');
  }
  
  // 生成分享链接
  const shareUrls: any = {
    // 受保护的 Worker API 链接（需要 Bearer Token）
    protected: {
      view: `${workerDomain}/api/buckets/bucket/${encodeURIComponent(filename)}`,
      download: `${workerDomain}/api/buckets/bucket/${encodeURIComponent(filename)}?download=true`
    },
    
    // 文件信息
    file: {
      name: filename,
      size: object.size,
      lastModified: object.uploaded.toISOString(),
      contentType: object.httpMetadata?.contentType || 'application/octet-stream'
    }
  };
  
  // 根据配置决定公开访问方式
  if (env.R2_CUSTOM_DOMAIN) {
    // 如果配置了 R2 自定义域名，提供公开链接选项
    shareUrls.public = {
      view: `https://${env.R2_CUSTOM_DOMAIN}/${encodeURIComponent(filename)}`
    };
  } else {
    // 生成带签名的临时访问链接
    const signature = await generateSignature(filename, expirationTime.toString(), env.API_TOKEN || 'sk-dev-7C021EA0-386B-4908-BFDD-3ACC55B2BD6F');
    shareUrls.signed = {
      view: `${workerDomain}/share/${encodeURIComponent(filename)}?signature=${signature}&expires=${expirationTime}`,
      download: `${workerDomain}/share/${encodeURIComponent(filename)}?signature=${signature}&expires=${expirationTime}&download=true`,
      expires_at: expirationDate.toISOString(),
      expires_in_hours: Math.round(actualExpiresIn / 3600)
    };
  }
  
  return shareUrls;
}

async function handleShareRequest(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as { 
      filename: string; 
      expires_in?: number; // 有效期（秒），如果不指定则使用环境变量配置
      public?: boolean;    // 是否生成公开链接
    };
    
    const defaultExpiresIn = getShareLinkExpiresIn(env);
    const { filename, expires_in = defaultExpiresIn, public: usePublicAccess = false } = body;
    
    console.log(`📋 Share request: filename=${filename}, expires_in=${expires_in}s (${expires_in / 3600}h), public=${usePublicAccess}`);
    
    if (!filename) {
      return new Response(JSON.stringify({
        error: 'Bad Request',
        message: 'filename is required'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }
    
    // 检查文件是否存在
    const object = await env.bucket.get(filename);
    if (!object) {
      return new Response(JSON.stringify({
        error: 'File not found',
        message: 'The specified file does not exist',
        filename
      }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }
    
    const workerDomain = new URL(request.url).origin;
    const expirationTime = Date.now() + (expires_in * 1000);
    const expirationDate = new Date(expirationTime);
    
    // 生成分享链接
    const shareUrls: any = {
      // 受保护的 Worker API 链接（需要 Bearer Token）
      protected: {
        view: `${workerDomain}/api/buckets/bucket/${encodeURIComponent(filename)}`,
        download: `${workerDomain}/api/buckets/bucket/${encodeURIComponent(filename)}?download=true`
      },
      
      // 文件信息
      file: {
        name: filename,
        size: object.size,
        lastModified: object.uploaded.toISOString(),
        contentType: object.httpMetadata?.contentType || 'application/octet-stream'
      }
    };
    
    // 根据配置决定公开访问方式
    if (env.R2_CUSTOM_DOMAIN && usePublicAccess) {
      // 如果配置了 R2 自定义域名，直接返回公开链接
      shareUrls.public = {
        view: `https://${env.R2_CUSTOM_DOMAIN}/${encodeURIComponent(filename)}`
      };
    } else {
      // 生成带签名的临时访问链接
      const signature = await generateSignature(filename, expirationTime.toString(), env.API_TOKEN || 'sk-dev-7C021EA0-386B-4908-BFDD-3ACC55B2BD6F');
      shareUrls.signed = {
        view: `${workerDomain}/share/${encodeURIComponent(filename)}?signature=${signature}&expires=${expirationTime}`,
        download: `${workerDomain}/share/${encodeURIComponent(filename)}?signature=${signature}&expires=${expirationTime}&download=true`,
        expires_at: expirationDate.toISOString(),
        expires_in_hours: Math.round(expires_in / 3600)
      };
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Share URLs generated successfully',
      data: shareUrls
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      }
    });
    
  } catch (error) {
    console.error('Share request error:', error);
    return new Response(JSON.stringify({
      error: 'Internal Server Error',
      message: 'Failed to generate share URLs'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
}

async function handleMetadataRequest(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as { filename: string };
    const { filename } = body;

    if (!filename) {
      return new Response(JSON.stringify({
        error: 'Bad Request',
        message: 'filename is required'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    const object = await env.bucket.get(filename);
    if (!object) {
      return new Response(JSON.stringify({
        error: 'File not found',
        message: 'The specified file does not exist',
        filename
      }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
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
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  } catch (error) {
    console.error('Metadata request error:', error);
    return new Response(JSON.stringify({
      error: 'Internal Server Error',
      message: 'Failed to retrieve file metadata'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
}

async function handleFileListRequest(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    
    // 获取查询参数
    const prefix = url.searchParams.get('prefix') || '';
    const limit = parseInt(url.searchParams.get('limit') || '100');
    
    const objects = await env.bucket.list({
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
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  } catch (error) {
    console.error('File list request error:', error);
    return new Response(JSON.stringify({
      error: 'Internal Server Error',
      message: 'Failed to retrieve file list'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
}
