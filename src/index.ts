import { R2Explorer } from "r2-explorer";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return R2Explorer({
      // 允许用户上传和操作文件
      readonly: false,

      // 基础认证配置 - 从环境变量读取
      basicAuth: {
        username: env.ADMIN_USERNAME || "admin",
        password: env.ADMIN_PASSWORD || "your-secure-password"
      },

      // 可选：其他安全配置
      // Learn more how to secure your R2 Explorer instance:
      // https://r2explorer.com/getting-started/security/
      // cfAccessTeamName: "my-team-name",
    }).fetch(request, env as any, ctx);
  }
};
