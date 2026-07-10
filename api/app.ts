/**
 * This is a API server
 */

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
import bilibiliRoutes from './routes/bilibili.js'
import douyinRoutes from './routes/douyin.js'
import asrRoutes from './routes/asr.js'

// load env
dotenv.config()

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

/**
 * API Routes
 */
app.use('/api/bilibili', bilibiliRoutes)
app.use('/api/douyin', douyinRoutes)
app.use('/api/asr', asrRoutes)

/**
 * health
 */
app.use(
  '/api/health',
  (req: Request, res: Response, next: NextFunction): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    })
  },
)

/**
 * 生产环境：serve 前端构建产物（dist 目录）
 */
const distPath = path.resolve(process.cwd(), 'dist')
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
  // SPA 回退：所有非 /api 请求都返回 index.html
  app.get('*', (req: Request, res: Response) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ success: false, error: 'API not found' })
      return
    }
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

/**
 * error handler middleware
 */
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  res.status(500).json({
    success: false,
    error: 'Server internal error',
  })
})

/**
 * 404 handler（开发环境，无 dist 目录时）
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

export default app
