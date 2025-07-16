import { R2Explorer } from "r2-explorer";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    console.log(`Request: ${request.method} ${url.pathname}`);
    
    // 处理公开文件访问路径 /public/*
    if (url.pathname.startsWith('/public/')) {
      return handlePublicFileAccess(request, env, ctx);
    }
    
    // 检查是否有 Bearer Token - 如果有，使用 Token 认证
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return handleAPIRequest(request, env, ctx);
    }
    
    // Web 界面使用 Basic Auth（包括没有 Bearer Token 的请求）
    return R2Explorer({
      readonly: false,
      basicAuth: {
        username: env.ADMIN_USERNAME || "admin",
        password: env.ADMIN_PASSWORD || "admin"
      },
    }).fetch(request, env as any, ctx);
  }
};

async function handlePublicFileAccess(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  
  // 提取文件名 /public/filename.ext -> filename.ext
  const filename = url.pathname.replace('/public/', '');
  
  if (!filename) {
    return new Response('Bad Request: No filename specified', {
      status: 400,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
  
  try {
    // 直接从 R2 获取文件
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
    
    // 返回文件内容
    return new Response(object.body, {
      status: 200,
      headers: {
        'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
        'Content-Length': object.size.toString(),
        'ETag': object.httpEtag,
        'Last-Modified': object.uploaded.toUTCString(),
        'Cache-Control': 'public, max-age=31536000', // 1年缓存
        'Access-Control-Allow-Origin': '*',
      }
    });
    
  } catch (error) {
    console.error('Public file access error:', error);
    return new Response('Internal Server Error', {
      status: 500,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
}

async function handleAPIRequest(request: Request, env: Env, ctx: ExecutionContext) {
  // API Token 认证
  const authHeader = request.headers.get('Authorization');
  const expectedToken = env.API_TOKEN || 'sk-dev-7C021EA0-386B-4908-BFDD-3ACC55B2BD6F';
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response('Unauthorized: Missing Bearer token', {
      status: 401,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      }
    });
  }
  
  const token = authHeader.replace('Bearer ', '');
  if (token !== expectedToken) {
    return new Response('Unauthorized: Invalid token', {
      status: 401,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }

  const url = new URL(request.url);
  
  // 处理文件分享链接生成
  if (url.pathname === '/api/share' && request.method === 'POST') {
    return handleShareRequest(request, env);
  }
  
  // CORS 预检请求处理
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
  
  try {
    // 处理实际的 R2 API 请求
    const r2Response = await R2Explorer({
      readonly: false,
      // 为 API 请求跳过 Basic Auth
    }).fetch(request, env as any, ctx);
    
    // 检查响应状态，如果是错误状态则处理
    if (r2Response.status >= 400) {
      const url = new URL(request.url);
      const isFileRequest = url.pathname.includes('/api/buckets/') && !url.pathname.endsWith('/');
      
      if (r2Response.status === 404 || (isFileRequest && r2Response.status === 500)) {
        return new Response(JSON.stringify({
          error: 'File not found',
          message: 'The requested file does not exist',
          path: url.pathname,
          status: 404
        }), {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          }
        });
      }
    }
    
    // 添加 CORS 头到响应
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
    console.error('R2Explorer error:', error);
    
    // 其他错误返回通用的服务器错误
    return new Response(JSON.stringify({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      }
    });
  }
}

async function handleShareRequest(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as { filename: string; public?: boolean };
    const { filename, public: isPublic = false } = body;
    
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
    
    // 生成分享链接
    const shareUrls = {
      // 受保护的 Worker API 链接（需要 Bearer Token）
      protected: `${workerDomain}/api/buckets/bucket/${encodeURIComponent(filename)}`,
      
      // 公开访问链接
      public: env.R2_CUSTOM_DOMAIN 
        ? `https://${env.R2_CUSTOM_DOMAIN}/${encodeURIComponent(filename)}`
        : isPublic 
          ? `${workerDomain}/public/${encodeURIComponent(filename)}`
          : null,
      
      // 文件信息
      file: {
        name: filename,
        size: object.size,
        lastModified: object.uploaded.toISOString(),
        contentType: object.httpMetadata?.contentType || 'application/octet-stream'
      }
    };
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Share URLs generated successfully',
      data: shareUrls,
      usage: {
        protected: '需要在请求头中包含 Authorization: Bearer YOUR_TOKEN',
        public: env.R2_CUSTOM_DOMAIN 
          ? '可直接访问，无需认证（R2 自定义域名）'
          : isPublic
            ? '可直接访问，无需认证（Worker 公开路径）'
            : '需要先配置 R2 自定义域名或设置 public: true'
      }
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
