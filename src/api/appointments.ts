import express, { Express, Request, Response } from "express";
import prisma from "../lib/prisma";
import { checkIfCustomerExistById } from "../utils/customer";
import { io } from "../server";
import { encryptSocketData } from "../utils/cryptr";
import { bookingStatus, NotificationType } from "@prisma/client";
import jobCardRoute from "./jobcard";
import eventHandler from "../lib/EventHandler";
const app: Express = express();
// Create appointment
app.post("/create", async (req: Request, res: Response) => {
  try {
    const {
      vehicleId,
      serviceType,
      serviceCenterId,
      serviceDeadline,
      userId,
      isAccidental,
      photos,
    } = req.body;

    if (!vehicleId || !userId || !serviceType || !serviceCenterId) {
      return res.send(400).send("Missing Fields");
    }

    if (!(await checkIfCustomerExistById(userId))) {
      return res.status(404).send("User Not found");
    }
    const appointment = await prisma.appointment.create({
      data: {
        vehicleId,
        userId,
        serviceType,
        serviceCenterId,
        status: "PENDING",
        slaDeadline: serviceDeadline,
        isAccidental: isAccidental || false,
        photos: photos || [],
      },
      include: {
        Vehicle: {
          select: {
            vehicleMake: true,
            vehicleName: true,
            vehicleModel: true,
          },
        },
        owner: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });
    // Todo add socket for real time update to the service center staff
    eventHandler.emit(`appointment-created`, { appointment, serviceCenterId });

    return res.status(201).send("Appointment Created");
  } catch (error) {
    return res.status(400).json({ error: "Invalid input" });
  }
});

app.patch(
  "/:appointmentId/decision",
  async function (request: Request, response: Response) {
    try {
      const { appointmentId } = request.params;
      const { priority, slaDeadline, status } = request.body;

      if (!appointmentId) {
        return response.status(400).send("Appointment Id is required");
      }
      if (!status) {
        return response.status(400).send("Status is required");
      }

      const checkIfAppointmentExist = await prisma.appointment.findUnique({
        where: {
          id: appointmentId,
        },
      });
      if (!checkIfAppointmentExist) {
        return response.status(404).send("Appointment Not Found");
      }
      const appointment = await prisma.$transaction(async (tx) => {
        if (status === "APPROVED") {
          // create triage
          await prisma.triage.create({
            data: {
              appointmentId,
              decidedPriority: priority,
              source: "MANUAL",
              reason: "MANUAL_OVERRIDE",
            },
            select: { id: true },
          });
        }

        return await tx.appointment.update({
          where: { id: appointmentId },
          data: {
            priority,
            status: status,
            slaDeadline,
          },
          select: {
            userId: true,
            id: true,
            serviceCenterId: true,
            status: true,
            priority: true,
            slaDeadline: true,
            serviceType: true,
            Vehicle: {
              select: {
                vehicleName: true,
                vehicleMake: true,
              },
            },
          },
        });
      });

      io.emit(
        `${appointment.serviceCenterId}-appointment-decision-update`,
        await encryptSocketData(
          JSON.stringify({
            appointmentId: appointment.id,
            status: appointment.status,
            priority: appointment.priority,
            deadline: appointment.slaDeadline,
          })
        )
      );

      let message;
      let type;

      if (status === bookingStatus.APPROVED) {
        message = `Your appointment for ${appointment.serviceType} on ${appointment.Vehicle.vehicleName} (${appointment.Vehicle.vehicleMake}) has been approved.`;
        type = NotificationType.APPOINTMENT_APPROVED;
      } else {
        message = `Your appointment for ${appointment.serviceType} on ${appointment.Vehicle.vehicleName} (${appointment.Vehicle.vehicleMake}) has been rejected.`;
        type = NotificationType.APPOINTMENT_REJECTED;
      }
      const customerNotification = await prisma.customerNotification.create({
        data: {
          customerId: appointment.userId,
          type: type,
          message: message,
        },
      });
      io.emit(
        `notification-customer-${appointment.userId}`,
        await encryptSocketData(JSON.stringify(customerNotification))
      );
      return response.status(200).send("Appointment Status Updated");
    } catch (error) {
      return response.status(500).send("Internal Server Error");
    }
  }
);

// Update appointment status
app.patch(
  "/:appointmentId/status/update",
  async function (request: Request, response: Response) {
    try {
      const { appointmentId } = request.params;
      const { status } = request.body;

      if (!appointmentId) {
        return response.status(400).send("Appointment Id is required");
      }
      if (!status) {
        return response.status(400).send("Missing Status");
      }
      // Validate status
      if (!Object.values(bookingStatus).includes(status)) {
        return response.status(400).send("Invalid Status");
      }
      const checkIfAppointmentExist = await prisma.appointment.findUnique({
        where: {
          id: appointmentId,
        },
        select: {
          slaDeadline: true,
          serviceCenterId: true,
        },
      });
      if (!checkIfAppointmentExist || !checkIfAppointmentExist.slaDeadline) {
        return response.status(404).send("Appointment Not found");
      }

      let isBreached = false;
      let completionDate = null;
      if (status === bookingStatus.COMPLETED) {
        isBreached = checkIfAppointmentExist.slaDeadline < new Date();
        completionDate = new Date();
      }

      const appointment = await prisma.$transaction(async (tx) => {
        let appointment;
        // update the appointment status
        if (status === bookingStatus.COMPLETED) {
          appointment = await tx.appointment.update({
            where: { id: appointmentId },
            data: {
              status,
              slaBreached: isBreached,
              actualCompletionDate: completionDate,
            },
            select: {
              userId: true,
              serviceType: true,
              serviceCenterId: true,
              Mechanic: {
                select: {
                  id: true,
                },
              },
              Vehicle: {
                select: {
                  vehicleMake: true,
                  vehicleName: true,
                },
              },
            },
          });

          await Promise.all(
            appointment.Mechanic.map((assign) =>
              tx.mechanic.update({
                where: { id: assign.id },
                data: { unassignedAt: new Date() },
                select: {
                  id: true,
                },
              })
            )
          );
        } else {
          appointment = await tx.appointment.update({
            where: { id: appointmentId },
            data: {
              status,
              slaBreached: isBreached,
              actualCompletionDate: completionDate,
            },
            select: {
              userId: true,
              serviceType: true,
              serviceCenterId: true,
              Vehicle: {
                select: {
                  vehicleMake: true,
                  vehicleName: true,
                },
              },
            },
          });
        }
        return appointment;
      });

      let message = "";
      let type;
      if (status === bookingStatus.InService) {
        message = `Your appointment for ${appointment.serviceType} on ${appointment.Vehicle.vehicleName} (${appointment.Vehicle.vehicleMake}) is now in service.`;
        type = NotificationType.APPOINTMENT_IN_SERVICE;
      } else {
        message = `Your appointment for ${appointment.serviceType} on ${appointment.Vehicle.vehicleName} (${appointment.Vehicle.vehicleMake}) is completed.`;
        type = NotificationType.APPOINTMENT_COMPLETED;
      }

      eventHandler.emit(`appointment-status-update`, {
        appointment,
        appointmentId,
        message,
        type,
        status,
      });
      return response.status(200).send("Status Updated Successfully");
    } catch (error) {
      return response.status(500).send("Internal Server Error");
    }
  }
);

app.use("/job-card/", jobCardRoute);

/*
  Assign Mechanic API
*/
app.post(
  "/:appointmentId/assign-mechanic",
  async function (request: Request, response: Response) {
    try {
      const { appointmentId } = request.params;
      const { mechanicId } = request.body;

      if (!appointmentId) {
        return response.status(400).send("Appointment Id is required");
      }

      if (!mechanicId) {
        return response.status(400).send("Mechanic Id is required");
      }

      const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        select: {
          serviceCenterId: true,
          Mechanic: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!appointment) {
        return response.status(404).send("Appointment Not Found");
      }

      // Check if mechanic exists and is active
      const mechanic = await prisma.mechanic.findUnique({
        where: { id: mechanicId },
        select: { id: true, status: true, serviceCenterId: true },
      });

      if (
        !mechanic ||
        mechanic.status !== "ACTIVE" ||
        mechanic.serviceCenterId !== appointment.serviceCenterId
      ) {
        return response.status(400).send("Invalid Mechanic");
      }

      // assign the mechanic to the appointment

      const updatedMechanic = await prisma.mechanic.update({
        where: {
          id: mechanicId,
        },
        data: {
          assignedAt: new Date(),
          appointmentId,
        },
        select: { id: true, name: true },
      });

      io.emit(
        `mechanic-assignment-${mechanic.serviceCenterId}`,
        await encryptSocketData(
          JSON.stringify({
            id: updatedMechanic.id,
            name: updatedMechanic.name,
          })
        )
      );
      return response.status(200).send("Mechanic Assigned Successfully");
    } catch (error) {
      return response.status(500).send("Internal Server Error");
    }
  }
);

/*
  Invoice Generation API
*/
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
