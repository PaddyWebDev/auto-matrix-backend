import express, { Express, Request, Response } from "express";
import prisma from "../lib/prisma";
import { io } from "../server";
import { encryptSocketData } from "../utils/cryptr";

const app: Express = express();

app.post(
  "/:serviceCenterId/mechanic/create",
  async function (request: Request, response: Response) {
    try {
      const { serviceCenterId } = request.params;
      if (!serviceCenterId) {
        return response.status(400).send("Service Center Id is required");
      }
      const { name, email, phone, specialty, experienceYears } = request.body;
      if (!name || !email || !phone || !specialty || !experienceYears) {
        return response.status(400).send("Missing Fields");
      }

      const checkIfServiceCenterExist = await prisma.serviceCenter.findUnique({
        where: {
          id: serviceCenterId,
        },
        select: {
          name: true,
        },
      });
      if (!checkIfServiceCenterExist) {
        return response.status(404).send("Service Center Not Found");
      }

      const new_mechanic = await prisma.mechanic.create({
        data: {
          name,
          email,
          phoneNumber: phone,
          speciality: specialty,
          experienceYears: Number(experienceYears),
          serviceCenterId,
        },
      });

      io.emit(
        `new-mechanic-${serviceCenterId}`,
        await encryptSocketData(
          JSON.stringify({
            id: new_mechanic.id,
            name: new_mechanic.name,
            phoneNumber: new_mechanic.phoneNumber,
            email: new_mechanic.email,
            speciality: new_mechanic.speciality,
            status: new_mechanic.status,
          })
        )
      );
      return response.status(201).json("Mechanic Registered Successfully");
    } catch (error) {
      return response.status(500).send("Internal Server Error");
    }
  }
);

app.patch(
  "/mechanic/:mechanicId/assign",
  async function (request: Request, response: Response) {
    try {
    } catch (error) {
      return response.status(500).send("Internal Server Error");
    }
  }
);

app.patch(
  "/mechanic/:mechanicId/status/update",
  async function (request: Request, response: Response) {
    try {
      const { mechanicId } = request.params;
      if (!mechanicId) {
        return response.status(400).send("Mechanic Id is required");
      }

      const { status } = request.body;
      if (!status) {
        return response.status(400).send("Status is required");
      }

      const checkIfMechanicExist = await prisma.mechanic.findUnique({
        where: {
          id: mechanicId,
        },
        select: {
          name: true,
        },
      });

      if (!checkIfMechanicExist) {
        return response.status(404).send("Mechanic Not Found");
      }

      await prisma.mechanic.update({
        where: {
          id: mechanicId,
        },
        data: {
          status: status,
        },
      });
    } catch (error) {
      return response.status(500).send("Internal Server Error");
    }
  }
);

app.delete(
  "/:serviceCenterId/mechanic/:mechanicId/delete",
  async function (request: Request, response: Response) {
    try {
      const { serviceCenterId, mechanicId } = request.params;

      if (!serviceCenterId || !mechanicId) {
        return response
          .status(400)
          .send("Service Center & Mechanic Id is required");
      }

      const checkIfMechanicExist = await prisma.mechanic.findUnique({
        where: {
          id: mechanicId,
        },
        select: {
          serviceCenterId: true,
        },
      });

      if (!checkIfMechanicExist) {
        return response.status(404).send("Mechanic Not Found");
      }

      if (checkIfMechanicExist.serviceCenterId !== serviceCenterId) {
        return response.status(409).send("Invalid Service Center Id");
      }

      await prisma.mechanic.delete({
        where: {
          id: mechanicId,
        },
      });

      return response.status(200).send("Mechanic Deleted Successfully");
    } catch (error) {
      return response.status(500).send("Internal Server Error");
    }
  }
);

export default app;
