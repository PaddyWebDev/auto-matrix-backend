import express, { Express, Request, Response } from "express";
import prisma from "../lib/prisma";
import eventHandler from "../lib/EventHandler";
const app: Express = express();

app.post(
  "/:appointmentId/invoice/create",
  async function (request: Request, response: Response) {
    try {
      const { appointmentId } = request.params;
      const { totalAmount } = request.body;

      if (!appointmentId) {
        return response.status(400).send("Appointment Id is required");
      }

      if (!totalAmount) {
        return response.status(400).send("Total Amount is required");
      }

      const checkIfAppointmentExist = await prisma.appointment.findUnique({
        where: {
          id: appointmentId,
        },
        select: {
          serviceType: true,
          userId: true,
          Invoice: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!checkIfAppointmentExist) {
        return response.status(404).send("Appointment Not Found");
      }

      if (checkIfAppointmentExist.Invoice?.id) {
        return response.status(409).send("Invoice is already generated");
      }

      const newInVoiceId = await prisma.$transaction(async (tx) => {
        // Step 1: Create invoice to get invoiceCount
        const created = await tx.invoice.create({
          data: {
            totalAmount,
            appointmentId,
            invoiceNumber: "TEMP", // placeholder, will overwrite
          },
          select: {
            invoiceCount: true,
            id: true,
          },
        });

        // Step 2: Update the invoiceNumber with formatted value
        await tx.invoice.update({
          where: { id: created.id },
          data: {
            invoiceNumber: `INV-${String(created.invoiceCount).padStart(
              6,
              "0"
            )}`,
          },
          select: { id: true },
        });

        return created.id;
      });

      const updatedInvoice = await prisma.invoice.findUnique({
        where: { id: newInVoiceId },
        select: {
          id: true,
          invoiceNumber: true,
          totalAmount: true,
          billingDate: true,
          dueDate: true,
          status: true,
          appointmentId: true,
          appointment: {
            select: {
              Payment: {
                select: {
                  status: true,
                  method: true,
                  amount: true,
                  paidAt: true,
                  transactionId: true,
                },
              },
              Vehicle: {
                select: {
                  vehicleName: true,
                  vehicleMake: true,
                  vehicleModel: true,
                },
              },
              id: true,
              status: true,
              userId: true,
              serviceType: true,
              requestedDate: true,
              slaDeadline: true,
              actualCompletionDate: true,
              serviceCenterId: true,
              serviceCenter: {
                select: {
                  name: true,
                  email: true,
                  phoneNumber: true,
                },
              },
              JobCards: {
                select: {
                  jobName: true,
                  jobDescription: true,
                  JobCardParts: {
                    select: {
                      quantity: true,
                      partUsed: {
                        select: {
                          unitPrice: true,
                          name: true,
                        },
                      },
                    },
                  },
                  price: true,
                },
              },
            },
          },
        },
      });

      if (!updatedInvoice) {
        return response.json();
      }
      eventHandler.emit(`appointment-invoice-created`, {
        appointment: checkIfAppointmentExist,
        updatedInvoice,
        appointmentId,
      });
      return response.status(201).json({
        message: "Invoice Generated Successfully",
        billing_date: updatedInvoice.billingDate,
      });
    } catch (error) {
      console.log(error);
      return response.status(500).send("Internal Server Error");
    }
  }
);

export default app;
