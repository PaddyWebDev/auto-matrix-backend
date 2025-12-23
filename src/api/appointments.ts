import express, { Express, Request, Response } from "express";
import prisma from "../lib/prisma";
import { checkIfCustomerExistById } from "../utils/customer";
import { io } from "../server";
import { encryptSocketData } from "../utils/cryptr";
import {
  bookingStatus,
  MechanicStatus,
  NotificationType,
} from "@prisma/client";
import { format } from "date-fns";
import jobCardRoute from "./jobcard";

const app: Express = express();

// Create appointment
app.post("/create", async (req: Request, res: Response) => {
  try {
    const {
      vehicleId,
      serviceType,
      serviceCenterId,
      priority,
      serviceDeadline,
      userId,
    } = req.body;

    if (
      !vehicleId ||
      !userId ||
      !serviceType ||
      !serviceCenterId ||
      !priority ||
      !serviceDeadline
    ) {
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
        userUrgency: priority,
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
    io.emit(
      `new-appointment-${appointment.serviceCenterId}`,
      await encryptSocketData(JSON.stringify(appointment))
    );

    const serviceCenterData = await prisma.serviceCenter.findUnique({
      where: {
        id: serviceCenterId,
      },
      select: {
        name: true,
        phoneNumber: true,
      },
    });
    io.emit(
      `new-appointment-${appointment.userId}`,
      await encryptSocketData(
        JSON.stringify({
          id: appointment.id,
          serviceType: appointment.serviceType,
          status: appointment.status,
          requestedDate: appointment.requestedDate,
          Vehicle: {
            select: {
              vehicleName: appointment.Vehicle.vehicleName,
              vehicleMake: appointment.Vehicle.vehicleMake,
              vehicleModel: appointment.Vehicle.vehicleModel,
            },
          },
          serviceCenter: {
            select: {
              name: serviceCenterData?.name,
              phoneNumber: serviceCenterData?.phoneNumber,
            },
          },
        })
      )
    );

    const formattedDate = format(
      new Date(appointment.requestedDate),
      "dd MMM yyyy, hh:mm a"
    );

    const new_serviceCenter_notification =
      await prisma.serviceCenterNotification.create({
        data: {
          serviceCenterId,
          type: NotificationType.APPOINTMENT_CREATED,
          message: `New appointment received: ${appointment.owner.name} has requested ${serviceType} for ${appointment.Vehicle.vehicleMake} ${appointment.Vehicle.vehicleModel} on ${formattedDate}.`,
          appointmentId: appointment.id,
        },
      });

    io.emit(
      `notification-service-center-${serviceCenterId}`,
      await encryptSocketData(JSON.stringify(new_serviceCenter_notification))
    );

    return res.status(201).send("Appointment Created");
  } catch (error) {
    return res.status(400).json({ error: "Invalid input" });
  }
});

// Update appointment status
app.patch(
  "/:appointmentId/status/update",
  async function (request: Request, response: Response) {
    try {
      const { appointmentId } = request.params;
      const { status, priority } = request.body;
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
        // update the appointment status
        const appointment = await tx.appointment.update({
          where: { id: appointmentId },
          data: {
            status,
            slaBreached: isBreached,
            actualCompletionDate: completionDate,
          },
          select: {
            userId: true,
            serviceType: true,
            Vehicle: {
              select: {
                vehicleName: true,
                vehicleMake: true,
              },
            },
            MechanicAssignment: true,
          },
        });

        if (status === bookingStatus.COMPLETED) {
          await Promise.all(
            appointment.MechanicAssignment.map((assign) =>
              tx.mechanicAssignment.update({
                where: { id: assign.id },
                data: { unassignedAt: new Date() },
              })
            )
          );
        }

        if (status === bookingStatus.InService) {
          if (!priority) {
            throw new Error("Priority is required for triage");
          }

          // create triage
          await tx.triage.create({
            data: {
              appointmentId,
              decidedPriority: priority,
              source: "MANUAL",
              reason: "MANUAL_OVERRIDE",
            },
          });

          // Check if only 1 manager is available
          const availableMechanics = await tx.mechanic.findMany({
            where: {
              serviceCenterId: checkIfAppointmentExist.serviceCenterId,
              status: "ACTIVE",
            },
            select: { id: true },
          });

          // Auto-assign if only one mechanic available
          if (availableMechanics.length === 1 && availableMechanics[0]?.id) {
            await tx.mechanicAssignment.create({
              data: {
                appointmentId,
                mechanicId: availableMechanics[0].id,
              },
            });
          }
        }

        return appointment;
      });

      let message = "";
      let type;
      if (status === bookingStatus.APPROVED) {
        message = `Your appointment for ${appointment.serviceType} on ${appointment.Vehicle.vehicleName} (${appointment.Vehicle.vehicleMake}) has been approved.`;
        type = NotificationType.APPOINTMENT_APPROVED;
      } else if (status === bookingStatus.REJECTED) {
        message = `Your appointment for ${appointment.serviceType} on ${appointment.Vehicle.vehicleName} (${appointment.Vehicle.vehicleMake}) has been rejected.`;
        type = NotificationType.APPOINTMENT_REJECTED;
      } else if (status === bookingStatus.InService) {
        message = `Your appointment for ${appointment.serviceType} on ${appointment.Vehicle.vehicleName} (${appointment.Vehicle.vehicleMake}) is now in service.`;
        type = NotificationType.APPOINTMENT_IN_SERVICE;
      } else {
        message = `Your appointment for ${appointment.serviceType} on ${appointment.Vehicle.vehicleName} (${appointment.Vehicle.vehicleMake}) is completed.`;
        type = NotificationType.APPOINTMENT_COMPLETED;
      }

      // Create notification in DB
      const notification = await prisma.customerNotification.create({
        data: {
          customerId: appointment.userId,
          message,
          appointmentId: appointmentId,
          type: type,
        },
      });

      // Emit socket event
      io.emit(
        `notification-customer-${appointment.userId}`,
        await encryptSocketData(JSON.stringify(notification))
      );

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
          MechanicAssignment: true,
        },
      });

      if (!appointment) {
        return response.status(404).send("Appointment Not Found");
      }

      // Check if mechanic is already assigned
      if (appointment.MechanicAssignment.length > 0) {
        return response
          .status(400)
          .send("Mechanic already assigned to this appointment");
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
      await prisma.mechanicAssignment.create({
        data: {
          appointmentId,
          mechanicId,
        },
      });

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
        },
      });
      if (!checkIfAppointmentExist) {
        return response.status(404).send("Appointment Not Found");
      }

      const newInVoice = await prisma.$transaction(async (tx) => {
        // Step 1: Create invoice to get invoiceCount
        const created = await tx.invoice.create({
          data: {
            totalAmount,
            appointmentId,
            invoiceNumber: "TEMP", // placeholder, will overwrite
          },
        });

        // Step 2: Update the invoiceNumber with formatted value
        const updated = await tx.invoice.update({
          where: { id: created.id },
          data: {
            invoiceNumber: `INV-${String(created.invoiceCount).padStart(
              6,
              "0"
            )}`,
          },
        });

        return updated;
      });
      const safeInvoice = {
        ...newInVoice,
        invoiceCount: Number(newInVoice.invoiceCount),
      };
      io.emit(
        `new-invoice-${checkIfAppointmentExist.userId}`,
        await encryptSocketData(JSON.stringify(safeInvoice))
      );

      return response.status(201).json({
        message: "Invoice Generated Successfully",
        billing_date: newInVoice.billingDate,
      });
    } catch (error) {
      console.log(error);
      return response.status(500).send("Internal Server Error");
    }
  }
);

export default app;
