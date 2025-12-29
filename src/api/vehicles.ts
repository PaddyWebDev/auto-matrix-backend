import express, { Express, Request, Response } from "express";
import prisma from "../lib/prisma";
import { checkIfCustomerExistById } from "../utils/customer";
import { io } from "../server";
import { encryptSocketData } from "../utils/cryptr";

const app: Express = express();

app.post("/add", async function (req: Request, res: Response) {
  try {
    console.log(req);
    const {
      vehicleName,
      vehicleMake,
      vehicleModel,
      vehicleType,
      userId,
      numberPlate,
    } = req.body;
    if (
      !vehicleName ||
      !vehicleMake ||
      !vehicleModel ||
      !vehicleType ||
      !numberPlate ||
      !userId
    ) {
      return res.status(400).send("Missing Fields");
    }

    const checkIfUserExist = await checkIfCustomerExistById(userId);
    if (!checkIfUserExist) {
      return res.status(404).send("User not found");
    }

    const checkIfSameNumberPlateVehicleExist = await prisma.vehicle.findUnique({
      where: {
        numberPlate,
      },
      select: {
        vehicleName: true,
      },
    });

    if (checkIfSameNumberPlateVehicleExist) {
      return res
        .status(409)
        .send("The number plate used already exist in our system");
    }

    const data = await prisma.vehicle.create({
      data: {
        vehicleName,
        vehicleMake,
        vehicleModel: Number(vehicleModel),
        vehicleType,
        numberPlate,
        userId,
      },
    });

    io.emit(
      `new-vehicle-${userId}`,
      await encryptSocketData(JSON.stringify(data))
    );

    return res.status(201).json("Created Successfully");
  } catch (error) {
    return res.status(500).send("Internal Server Error");
  }
});

export default app;
