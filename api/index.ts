/**
 * 通用部署入口，导出 Express 应用
 * 适用于 Vercel / 其他 Serverless 平台 / 本地开发
 */
import app from './app.js'

export default app
export { app }
