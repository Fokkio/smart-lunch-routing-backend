import cors from "cors";
import express from "express";

import { config } from "./config/env";
import { errorHandler } from "./middleware/error-handler";

import { customerRoutes } from "./routes/customer.routes";
import { orderRoutes } from "./routes/order.routes";
import { riderRoutes } from "./routes/rider.routes";
import { routePlanRoutes } from "./routes/route-plan.routes";
import { settingsRoutes } from "./routes/settings.routes";

export function createApp(): express.Express {
  const app = express();

  // CORS
  app.use(
    cors({
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
  app.get("/", (_req, res) => {
    res.json({
      status: "ok",
      service: "smart-lunch-routing-backend",
    });
  });

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
    });
  });

  // API routes
  app.use("/api/customers", customerRoutes);
  app.use("/api/orders", orderRoutes);
  app.use("/api/riders", riderRoutes);
  app.use("/api/route-plans", routePlanRoutes);
  app.use("/api/settings", settingsRoutes);

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
