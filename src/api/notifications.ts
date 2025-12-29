import express, { Express, Request, Response } from "express";
import prisma from "../lib/prisma";

const app: Express = express();

// Mark all read functionality

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
  `/customer/:customerId/mark-all-read`,
  async function (request: Request, response: Response) {
    try {
      const { customerId } = request.params;
      if (!customerId) {
        return response.status(400).send("Service Center Id is required");
      }

      const existingNotifications = await prisma.customerNotification.findMany({
        where: {
          customerId,
          isRead: false,
        },
        select: {
          id: true,
        },
      });

      await prisma.$transaction(async (tx) => {
        await Promise.all(
          existingNotifications.map((notification) => {
            return tx.customerNotification.update({
              where: {
                id: notification.id,
              },
              data: {
                isRead: true,
              },
              select: {
                id: true,
              },
            });
          })
        );
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

app.patch(
  `/service-center/:serviceCenterId/mark-all-read`,
  async function (request: Request, response: Response) {
    try {
      const { serviceCenterId } = request.params;
      if (!serviceCenterId) {
        return response.status(400).send("Service Center Id is required");
      }

      const existingNotifications =
        await prisma.serviceCenterNotification.findMany({
          where: {
            serviceCenterId,
            isRead: false,
          },
          select: {
            id: true,
          },
        });

      await prisma.$transaction(async (tx) => {
        await Promise.all(
          existingNotifications.map((notification) => {
            return tx.serviceCenterNotification.update({
              where: {
                id: notification.id,
              },
              data: {
                isRead: true,
              },
              select: {
                id: true,
              },
            });
          })
        );
      });

      return response.status(200).send("Success");
    } catch (error) {
      return response.status(500).send("Internal Server Error");
    }
  }
);

export default app;
