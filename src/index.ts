import { R2Explorer } from "r2-explorer";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // 如果是 API 路径，使用 Token 认证
    if (url.pathname.startsWith('/api/')) {
      return handleAPIRequest(request, env, ctx);
    }
    
    // Web 界面使用 Basic Auth
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
  const expectedToken = env.API_TOKEN || 'sk-dev-1234567890abcdef';
  
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
  
  // 处理实际的 R2 API 请求
  const r2Response = await R2Explorer({
    readonly: false,
    // 为 API 请求跳过 Basic Auth
  }).fetch(request, env as any, ctx);
  
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
}
