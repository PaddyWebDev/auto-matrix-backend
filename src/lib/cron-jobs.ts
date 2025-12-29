import cron from "node-cron";
import prisma from "./prisma";
import { differenceInDays } from "date-fns";
import { io } from "../server";
import { encryptSocketData } from "../utils/cryptr";


enum PaymentReminderType {
  TWO_DAYS_BEFORE = "TWO_DAYS_BEFORE",
  ONE_DAY_BEFORE = "ONE_DAY_BEFORE",
  ONE_DAY_AFTER = "ONE_DAY_AFTER",
}

// Run every day at 01:00 AM server time
cron.schedule("0 1 * * *", async () => {
  console.log("[CRON] Payment reminder check started");

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await sendReminder(2, PaymentReminderType.TWO_DAYS_BEFORE);
    await sendReminder(1, PaymentReminderType.ONE_DAY_BEFORE);
    await sendReminder(-1, PaymentReminderType.ONE_DAY_AFTER, true);

    await remindServiceCenterAboutAppointmentDecision();

    console.log("[CRON] Job Executed");
  } catch (err) {
    console.error("[CRON] Payment reminder failed", err);
  }
});

/**
 * @param daysOffset - number of days relative to dueDate (positive = before, negative = after)
 * @param message - reminder message
 * @param markOverdue - if true, mark invoice status as OVERDUE
 */
async function sendReminder(
  daysOffset: number,
  message: string,
  markOverdue = false
) {
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysOffset);
  targetDate.setHours(0, 0, 0, 0);

  const nextDay = new Date(targetDate);
  nextDay.setDate(targetDate.getDate() + 1);

  // Find invoices due exactly `daysOffset` from today
  const invoices = await prisma.invoice.findMany({
    where: {
      status: "SENT",
      dueDate: {
        gte: targetDate,
        lt: nextDay,
      },
    },
    select: {
      id: true,
      appointment: {
        select: {
          userId: true,
        },
      },
      appointmentId: true,
      totalAmount: true,
    },
  });

  if (invoices.length === 0) return;

  await prisma.$transaction(async (tx) => {
    if (markOverdue) {
      await tx.invoice.updateMany({
        where: { id: { in: invoices.map((i) => i.id) } },
        data: { status: "OVERDUE" },
      });
    }

    await tx.customerNotification.createMany({
      data: invoices.map((invoice) => ({
        customerId: invoice.appointment.userId,
        appointmentId: invoice.appointmentId,
        type: markOverdue ? "PAYMENT_OVERDUE" : "PAYMENT_PENDING",
        message: `${message}. Amount: ₹${invoice.totalAmount.toString()}`,
      })),
    });
  });
}

async function remindServiceCenterAboutAppointmentDecision() {
  const noDecisionAppointment = await prisma.appointment.findMany({
    where: {
      status: "PENDING",
    },
    select: {
      id: true,
      requestedDate: true,
      serviceType: true,
      serviceCenterId: true,
    },
  });

  noDecisionAppointment.forEach(async (appointment) => {
    const daysDiff = differenceInDays(
      new Date(),
      new Date(appointment.requestedDate)
    );

    if (daysDiff > 2) {
      const notificationData = await prisma.$transaction(async (tx) => {
        const newNotification = await tx.serviceCenterNotification.create({
          data: {
            serviceCenterId: appointment.serviceCenterId,
            type: "APPOINTMENT_APPROVAL_SLA_BREACHED",
            message: `You haven't made decision on the appointment ${appointment.serviceType}`,
          },
        });

        await tx.appointment.update({
          where: {
            id: appointment.id,
          },
          data: {
            status: "REJECTED",
          },
          select: {
            id: true,
          },
        });

        return newNotification;
      });

      io.emit(
        `new-appointment-${appointment.serviceCenterId}`,
        await encryptSocketData(JSON.stringify(notificationData))
      );
    }
  });
}
