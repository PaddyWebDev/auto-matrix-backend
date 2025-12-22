import express, { Express, Request, Response } from "express";
import prisma from "../lib/prisma";
import { io } from "../server";
import { encryptSocketData } from "../utils/cryptr";
import { bookingStatus, NotificationType } from "@prisma/client";
import { format } from "date-fns";

const app: Express = express();

app.patch(
  "/customer/:notificationId",
  async function (request: Request, response: Response) {
    try {
      const { notificationId } = request.params;
      if (!notificationId) {
        return response.status(400).send("Notification Id is required");
      }

      const checkIfNotificationExist =
        await prisma.customerNotification.findUnique({
          where: {
            id: notificationId,
          },
          select: {
            message: true,
          },
        });

      if (!checkIfNotificationExist) {
        return response.status(404).send("Notification Not found");
      }

      await prisma.customerNotification.update({
        where: {
          id: notificationId,
        },
        data: {
          isRead: true,
        },
      });
      return response.status(200).send("Success");
    } catch (error) {
      return response.status(500).send("Internal Server Error");
    }
  }
);

app.patch(
  "/service-center/:notificationId",
  async function (request: Request, response: Response) {
    try {
      const { notificationId } = request.params;
      if (!notificationId) {
        return response.status(400).send("Notification Id is required");
      }

      const checkIfNotificationExist =
        await prisma.serviceCenterNotification.findUnique({
          where: {
            id: notificationId,
          },
          select: {
            message: true,
          },
        });

      if (!checkIfNotificationExist) {
        return response.status(404).send("Notification Not found");
      }

      await prisma.serviceCenterNotification.update({
        where: {
          id: notificationId,
        },
        data: {
          isRead: true,
        },
      });
      return response.status(200).send("Success");
    } catch (error) {
      return response.status(500).send("Internal Server Error");
    }
  }
);

export default app;
