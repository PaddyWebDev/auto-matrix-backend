import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import appointmentRoute from "./api/appointments";
import inventoryRoute from "./api/inventory";
import vehicleRoute from "./api/vehicles";
import express, { Request, Express, Response } from "express";
dotenv.config();
import http from "http";
import { Server } from "socket.io";

const app: Express = express();
const prisma = new PrismaClient();
const PORT = 9000;
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONT_END_URL,
  },
});
// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/appointments/", appointmentRoute);
app.use("/api/inventory/", inventoryRoute);
app.use("/api/vehicles/", vehicleRoute);

io.on("connection", (socket) => {
  console.log("a user connected", socket.id);
});
io.on("disconnect", (socket) => {
  console.log("user disconnected", socket.id);
});
// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export { io };
