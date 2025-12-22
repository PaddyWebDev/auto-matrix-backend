import express, { Express, Request, Response } from "express";
import prisma from "../lib/prisma";
import { checkIfCustomerExistById } from "../utils/customer";
import { io } from "../server";
import { encryptSocketData } from "../utils/cryptr";
import { bookingStatus, NotificationType } from "@prisma/client";
import { format } from "date-fns";

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
        priority,
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

app.post("/job-card/create", async (req: Request, res: Response) => {
  try {
    const { jobName, jobDescription, price, appointmentId } = req.body;
    if (!jobName || !jobDescription || !appointmentId) {
      return res.status(400).send("Missing Fields");
    }
    const checkIfAppointmentExist = await prisma.appointment.findUnique({
      where: {
        id: appointmentId,
      },
      select: {
        serviceType: true,
      },
    });

    if (!checkIfAppointmentExist) {
      return res.status(404).send("Appointment Not found");
    }

    const newJobCard = await prisma.jobCards.create({
      data: {
        jobName,
        jobDescription,
        appointmentId,
        price: Number(price) || 0,
      },
    });

    return res.status(201).json({
      message: "Created Successfully",
      new_job_card: newJobCard,
    });
  } catch (error) {
    return res.status(500).send("Internal Server Error");
  }
});

app.delete(
  "/job-card/delete/:jobCardId",
  async (req: Request, res: Response) => {
    try {
      const { jobCardId } = req.params as { jobCardId: string };
      const { appointmentId } = req.query as { appointmentId: string };

      // Validation
      if (!jobCardId) {
        return res.status(400).send("Missing jobCardId");
      }

      if (!appointmentId) {
        return res.status(400).json("Missing appointmentId");
      }

      // Check if job card exists and belongs to appointment
      const existingJobCard = await prisma.jobCards.findFirst({
        where: {
          id: jobCardId,
          appointmentId,
        },
        select: {
          jobName: true,
          JobCardParts: {
            select: {
              partId: true,
              quantity: true,
            },
          },
        },
      });

      if (!existingJobCard) {
        return res.status(404).send("Job card not found for this appointment");
      }

      // Delete job card

      await prisma.$transaction(async (tx) => {
        // restore inventory
        await Promise.all(
          existingJobCard.JobCardParts.map((part) =>
            tx.inventory.update({
              where: { id: part.partId },
              data: {
                quantity: { increment: part.quantity },
              },
            })
          )
        );

        // delete job card parts first (if no cascade)
        await tx.jobCardParts.deleteMany({
          where: { jobCardId },
        });

        // delete job card
        await tx.jobCards.delete({
          where: { id: jobCardId },
        });
      });

      return res.status(200).send("Job card deleted successfully");
    } catch (error) {
      console.error("Error deleting job card:", error);
      return res.status(500).send("Internal Server Error");
    }
  }
);

app.post(
  `/job-card/part/add`,
  async function (request: Request, response: Response) {
    try {
      const { jobCardId, partId, quantity, appointmentId } = request.body;
      const qty = Number(quantity);
      if (!jobCardId || !partId || !quantity || !appointmentId) {
        return response.status(400).send("Missing Fields");
      }

      if (quantity < 0) {
        return response
          .status(400)
          .send("Quantity should be greater than zero");
      }
      const existingJobCard = await prisma.jobCards.findUnique({
        where: { id: jobCardId },
        select: {
          jobName: true,
          appointmentId: true,
        },
      });
      if (!existingJobCard) {
        return response.status(404).send("Job Card Not Found");
      }

      if (appointmentId !== existingJobCard.appointmentId) {
        return response.status(404).send("Appointment Not Found");
      }

      const inventory = await prisma.inventory.findUnique({
        where: { id: partId },
        select: {
          quantity: true,
        },
      });

      if (!inventory) {
        return response.status(404).send("Inventory Not found");
      }

      if (!quantity || inventory.quantity < qty) {
        return response.status(400).send("Insufficient Stock");
      }
      let newJobCardPart;
      await prisma.$transaction(async (tx) => {
        newJobCardPart = await tx.jobCardParts.create({
          data: { partId, jobCardId, quantity: qty },
          select: {
            partId: true,
            quantity: true,
            partUsed: { select: { unitPrice: true, name: true } },
          },
        });

        await tx.jobCards.update({
          where: { id: jobCardId },
          data: {
            price: {
              increment: newJobCardPart.partUsed.unitPrice * qty,
            },
          },
        });

        await tx.inventory.update({
          where: { id: partId },
          data: { quantity: { decrement: Number(quantity) } },
        });

        return newJobCardPart;
      });

      return response.status(200).json({
        new_part_job_card: newJobCardPart,
        message: "Part Added Successfully",
      });
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

      const appointment = await prisma.appointment.update({
        where: { id: appointmentId },
        data: {
          status: status,
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
        },
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
