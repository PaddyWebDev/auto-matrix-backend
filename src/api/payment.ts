import express, { Express, Request, Response } from "express";
import prisma from "../lib/prisma";
import { randomUUID } from "crypto";
import { PaymentStatus } from "@prisma/client";
import eventHandler from "../lib/EventHandler";

const app: Express = express();

app.post(
  `/create/:appointmentId`,
  async function (request: Request, response: Response) {
    try {
      const { appointmentId } = request.params;
      const { invoiceId } = request.query;
      if (!appointmentId || !invoiceId) {
        return response
          .status(400)
          .send("Appointment & Invoice Id is required");
      }

      const { amount, method } = request.body;
      if (!amount || !method) {
        return response.status(400).send("Amount & Payment Method is required");
      }

      const checkIfAppointmentExist = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        select: {
          serviceCenterId: true,
          Invoice: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!checkIfAppointmentExist || !checkIfAppointmentExist.Invoice) {
        return response.status(404).send("Appointment Not Found");
      }

      if (checkIfAppointmentExist.Invoice?.id !== invoiceId) {
        return response.status(404).send("Invoice Not Found");
      }

      await prisma.$transaction(async (tx) => {
        const transactionId = randomUUID();

        await tx.payment.create({
          data: {
            amount,
            appointmentId,
            invoiceId,
            transactionId: transactionId,
            status: PaymentStatus.SUCCESS,
            method: method,
            paidAt: new Date(),
          },
        });

        await tx.invoice.update({
          where: {
            id: invoiceId,
          },
          data: {
            status: "PAID",
          },
        });
      });
      eventHandler.emit(`appointment-payment-completed`, {
        serviceCenterId: checkIfAppointmentExist.serviceCenterId,
        appointmentId,
      });
      return response.status(201).send("Payment Successful");
    } catch (error) {
      return response.status(500).send("Internal Server Error");
    }
  }
);

export default app;
