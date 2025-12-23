import express, { Express, Request, Response } from "express";
import prisma from "../lib/prisma";

const app: Express = express();

app.post("/create", async (req: Request, res: Response) => {
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
  "/delete/:jobCardId",
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
  `/part/add`,
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

export default app;