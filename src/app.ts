// ไฟล์นี้: ประกอบแอป Express ทั้งหมด ตั้ง CORS อ่าน JSON ผูก route และวางตัวจัดการ error ไว้ท้ายสุด
import cors from "cors";
import express from "express";

import { config } from "./config/env";
import { errorHandler } from "./middleware/error-handler";

import { customerRoutes } from "./routes/customer.routes";
import { orderRoutes } from "./routes/order.routes";
import { riderRoutes } from "./routes/rider.routes";
import { routePlanRoutes } from "./routes/route-plan.routes";
import { settingsRoutes } from "./routes/settings.routes";
import { authRoutes } from "./routes/auth.routes";
import { riderJobRoutes } from "./routes/rider-job.routes";
import { requireAuth, requireOwner, requireRider } from "./middleware/auth";

// สร้างแอป Express: ตั้ง CORS อ่าน JSON ผูกทุก route แล้วคืนแอปให้ server ใช้
export function createApp(): express.Express {
  const app = express();

  // CORS
  app.use(
    cors({
// ตรวจ origin ของผู้เรียก: ไม่มี origin หรืออยู่ในรายการที่อนุญาตถึงจะผ่าน ไม่งั้นตอบ 403
      origin(origin, callback) {
        if (!origin || config.corsOrigins.length === 0 || config.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(Object.assign(new Error('Origin is not allowed by CORS'), { statusCode: 403 }));
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // Parse JSON body
  app.use(express.json());

  // Root endpoint
// หน้าแรก: ตอบสถานะว่าบริการนี้ทำงานอยู่
  app.get("/", (_req, res) => {
    res.json({
      status: "ok",
      service: "smart-lunch-routing-backend",
    });
  });

  // Health check
// ตรวจสุขภาพ: ตอบสถานะ ok ใช้เช็กว่าเซิร์ฟเวอร์ยังทำงานอยู่
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
    });
  });

  // API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/my-jobs', requireAuth, requireRider, riderJobRoutes);
  app.use("/api/customers", requireAuth, requireOwner, customerRoutes);
  app.use("/api/orders", requireAuth, requireOwner, orderRoutes);
  app.use("/api/riders", requireAuth, requireOwner, riderRoutes);
  app.use("/api/route-plans", requireAuth, requireOwner, routePlanRoutes);
  app.use("/api/settings", requireAuth, requireOwner, settingsRoutes);

// ทางที่ไม่รู้จัก: ตอบ 404 ว่า Route not found (วางก่อน error handler)
  app.use((_req, res) => {
    res.status(404).json({ message: 'Route not found' });
  });

  // Error handler ต้องอยู่ท้ายสุด
  app.use(errorHandler);

  return app;
}

// Vercel ต้องการ default export
const app = createApp();

export default app;
