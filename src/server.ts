import cors from "cors";
import dotenv from "dotenv";
import appointmentRoute from "./api/appointments";
import inventoryRoute from "./api/inventory";
import vehicleRoute from "./api/vehicles";
import notificationRoute from "./api/notifications";
import serviceCenterRoute from "./api/service-center";
import PaymentRoute from "./api/payment";
import express, { Request, Express, Response } from "express";
import "./lib/cron-jobs";
import "./listeners/appointment.listener";
import http from "http";
import { Server } from "socket.io";

dotenv.config();
const app: Express = express();
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
app.use("/api/notifications/", notificationRoute);
app.use("/api/service-center/", serviceCenterRoute);
app.use("/api/payment/", PaymentRoute);

io.on("connection", (socket) => {
  console.log("a user connected", socket.id);
});
io.on("disconnect", (socket) => {
  console.log("user disconnected", socket.id);
});

app.get("/", (req, response: Response) => {
  return response.json({
    message: "Backend for Auto Matrix",
  });
});
// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

server.listen(PORT, () => {
  console.log(`Server running on port: ${PORT}`);
});

export { io };
