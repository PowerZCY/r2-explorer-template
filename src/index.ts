import { R2Explorer } from "r2-explorer";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    console.log(`Request: ${request.method} ${url.pathname}`);
    
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
