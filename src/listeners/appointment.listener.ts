import { NotificationType, SCNotificationType } from "@prisma/client";
import eventHandler from "../lib/EventHandler";
import prisma from "../lib/prisma";
import { io } from "../server";
import { encryptSocketData } from "../utils/cryptr";
import { format } from "date-fns";

eventHandler.on(`appointment-created`, async function (payload) {
  const { serviceCenterId, appointment } = payload;
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
        isAccidental: appointment.isAccidental,
        photos: appointment.photos,
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
        type: SCNotificationType.APPOINTMENT_CREATED,
        message: `New appointment received: ${appointment.owner.name} has requested ${appointment.serviceType} for ${appointment.Vehicle.vehicleMake} ${appointment.Vehicle.vehicleModel} on ${formattedDate}.`,
        appointmentId: appointment.id,
      },
    });

  io.emit(
    `notification-service-center-${serviceCenterId}`,
    await encryptSocketData(JSON.stringify(new_serviceCenter_notification))
  );
});

eventHandler.on(`appointment-status-update`, async function (payload) {
  const { appointment, appointmentId, message, type, status } = payload;
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

  io.emit(
    `status-update-appointment-${appointment.serviceCenterId}`,
    await encryptSocketData(
      JSON.stringify({
        status: status,
        appointmentId: appointmentId,
      })
    )
  );
});

eventHandler.on(`appointment-invoice-created`, async (payload) => {
  const { appointment, updatedInvoice, appointmentId } = payload;
  io.emit(
    `new-invoice-${appointment.userId}`,
    await encryptSocketData(JSON.stringify(updatedInvoice))
  );

  const invoiceNotification = await prisma.customerNotification.create({
    data: {
      type: "INVOICE_GENERATED",
      appointmentId,
      customerId: appointment.userId,
      message: `You have received invoice for the service request kindly pay before ${format(
        updatedInvoice.dueDate,
        "dd MMM yyyy, hh:mm a"
      )}`,
    },
  });
  io.emit(
    `notification-customer-${appointment.userId}`,
    await encryptSocketData(JSON.stringify(invoiceNotification))
  );
});

eventHandler.on(
  `appointment-payment-completed`,
  async function (payload: { serviceCenterId: string; appointmentId: string }) {
    const { serviceCenterId, appointmentId } = payload;
    const appointment = await prisma.appointment.findUnique({
      where: {
        id: appointmentId,
      },
      select: {
        serviceType: true,
      },
    });

    const formattedDateTime = format(new Date(), "dd MMM yyyy, hh:mm a");
    const new_serviceCenter_notification =
      await prisma.serviceCenterNotification.create({
        data: {
          serviceCenterId,
          appointmentId,
          type: "PAYMENT_COMPLETED",
          message: `The customer has successfully completed the payment for the ${appointment?.serviceType} appointment by the owner on ${formattedDateTime}`,
        },
      });

    io.emit(
      `notification-service-center-${serviceCenterId}`,
      await encryptSocketData(JSON.stringify(new_serviceCenter_notification))
    );
  }
);
