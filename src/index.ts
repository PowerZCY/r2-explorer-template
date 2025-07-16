import { R2Explorer } from "r2-explorer";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    console.log(`Request: ${request.method} ${url.pathname}`);
    
    // 处理带签名的临时访问链接
    if (url.pathname.startsWith('/share/')) {
      return handleSignedFileAccess(request, env, ctx);
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
  
  // 检查是否为文件上传请求
  if (request.method === 'PUT' && url.pathname.includes('/api/buckets/')) {
    return handleFileUpload(request, env, ctx);
  }
  
  // 检查是否为文件下载请求（添加download参数）
  if (request.method === 'GET' && url.pathname.includes('/api/buckets/') && url.searchParams.get('download') === 'true') {
    return handleFileDownload(request, env, ctx);
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

async function handleFileUpload(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  try {
    // 先执行原有的上传逻辑
    const r2Response = await R2Explorer({
      readonly: false,
    }).fetch(request, env as any, ctx);
    
    // 如果上传成功，自动生成分享链接
    if (r2Response.status === 200 || r2Response.status === 201) {
      const url = new URL(request.url);
      const filename = url.pathname.split('/').pop();
      
      if (filename) {
        // 生成分享链接
        const shareData = await generateShareUrls(filename, env, request, 86400); // 默认24小时有效期
        
        // 返回上传成功响应，包含分享链接
        return new Response(JSON.stringify({
          success: true,
          message: 'File uploaded successfully',
          filename: filename,
          share_urls: shareData,
          upload_info: {
            method: 'PUT',
            url: url.href,
            status: r2Response.status
          }
        }), {
          status: r2Response.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          }
        });
      }
    }
    
    // 如果上传失败或无法获取文件名，返回原始响应
    return new Response(r2Response.body, {
      status: r2Response.status,
      headers: {
        ...Object.fromEntries(r2Response.headers),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      }
    });
    
  } catch (error) {
    console.error('File upload error:', error);
    return new Response(JSON.stringify({
      error: 'Upload failed',
      message: 'Failed to upload file'
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

async function generateShareUrls(filename: string, env: Env, request: Request, expires_in: number = 86400): Promise<any> {
  const workerDomain = new URL(request.url).origin;
  const expirationTime = Date.now() + (expires_in * 1000);
  const expirationDate = new Date(expirationTime);
  
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
      view: `https://${env.R2_CUSTOM_DOMAIN}/${encodeURIComponent(filename)}`,
      note: '此链接使用 R2 公开访问，需要在 Cloudflare Dashboard 中启用存储桶的公开访问'
    };
  } else {
    // 生成带签名的临时访问链接
    const signature = await generateSignature(filename, expirationTime.toString(), env.API_TOKEN || 'sk-dev-7C021EA0-386B-4908-BFDD-3ACC55B2BD6F');
    shareUrls.signed = {
      view: `${workerDomain}/share/${encodeURIComponent(filename)}?signature=${signature}&expires=${expirationTime}`,
      download: `${workerDomain}/share/${encodeURIComponent(filename)}?signature=${signature}&expires=${expirationTime}&download=true`,
      expires_at: expirationDate.toISOString(),
      note: '此链接带有签名和有效期，无需额外认证'
    };
  }
  
  return shareUrls;
}

async function handleShareRequest(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as { 
      filename: string; 
      expires_in?: number; // 有效期（秒），默认24小时
      public?: boolean;    // 是否生成公开链接
    };
    const { filename, expires_in = 86400, public: usePublicAccess = false } = body;
    
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
        view: `https://${env.R2_CUSTOM_DOMAIN}/${encodeURIComponent(filename)}`,
        note: '此链接使用 R2 公开访问，需要在 Cloudflare Dashboard 中启用存储桶的公开访问'
      };
    } else {
      // 生成带签名的临时访问链接
      const signature = await generateSignature(filename, expirationTime.toString(), env.API_TOKEN || 'sk-dev-7C021EA0-386B-4908-BFDD-3ACC55B2BD6F');
      shareUrls.signed = {
        view: `${workerDomain}/share/${encodeURIComponent(filename)}?signature=${signature}&expires=${expirationTime}`,
        download: `${workerDomain}/share/${encodeURIComponent(filename)}?signature=${signature}&expires=${expirationTime}&download=true`,
        expires_at: expirationDate.toISOString(),
        note: '此链接带有签名和有效期，无需额外认证'
      };
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Share URLs generated successfully',
      data: shareUrls,
      usage: {
        protected: '需要在请求头中包含 Authorization: Bearer YOUR_TOKEN',
        signed: shareUrls.signed ? `临时链接，有效期至 ${expirationDate.toLocaleString()}` : undefined,
        public: shareUrls.public ? 'R2 公开访问链接，需要在 Cloudflare Dashboard 启用公开访问' : undefined
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
