// src/app.ts

import express, { Express, Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import connectDB from "./config/database";
import intentClassificationRoutes from "./routes/intentClassificationRoutes";
import informationExtractionRoutes from "./routes/informationExtractionRoutes";
import questionnaireRoutes from "./routes/questionnaireRoutes";
import surveyRoutes from "./routes/surveyRoutes";
import authRoutes from "./routes/authRoutes";
import evaluationRoutes from "./routes/evaluationRoutes";
import geographicRoutes from "./routes/geographicRoutes";
import uniqueSurveyCodeRoutes from "./routes/uniqueSurveyCodeRoutes";
import apiKeyRoutes from "./routes/apiKeyRoutes";

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

// Increase payload limits
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Set timeout for all requests
app.use((req: Request, res: Response, next: NextFunction) => {
  // Set timeout to 10 minutes
  req.setTimeout(600000);
  res.setTimeout(600000);
  next();
});

// Middleware
app.use(
  cors({
    origin: [
      'http://localhost:3000',
      'https://wisnus-web-survey.vercel.app',
      'https://wisnus-chatbot-survey.vercel.app'
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

app.use(helmet());
app.use(morgan("dev"));

// Error handling middleware
interface CustomError extends Error {
  statusCode?: number;
}

app.use((err: CustomError, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);

  if (err.message === "ECONNRESET") {
    res.status(408).json({
      success: false,
      error: "Connection timeout - request took too long",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  res.status(err.statusCode || 500).json({
    success: false,
    error: err.message || "Internal Server Error",
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/intent", intentClassificationRoutes);
app.use("/api/information", informationExtractionRoutes);
app.use("/api/questionnaire", questionnaireRoutes);
app.use("/api/survey", surveyRoutes);
app.use("/api/evaluation", evaluationRoutes); 
app.use("/api/geographic", geographicRoutes);
app.use("/api/unique-codes", uniqueSurveyCodeRoutes);
app.use("/api/keys", apiKeyRoutes);

// Basic route
app.get("/", (req: Request, res: Response) => {
  res.send("API is running");
});

// Create server
const server = app.listen(port, async () => {
  console.log(`Server is running on port ${port}`);
});

// Configure server timeout
server.timeout = 600000; // 10 minutes

// Handle server errors
server.on("error", (error: any) => {
  if (error.code === "ECONNRESET") {
    console.log("Connection reset by client");
  } else {
    console.error("Server error:", error);
  }
});

// Handle process termination
process.on("SIGTERM", () => {
  console.log("SIGTERM received - shutting down server gracefully");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  server.close(() => {
    process.exit(1);
  });
});

export default app;