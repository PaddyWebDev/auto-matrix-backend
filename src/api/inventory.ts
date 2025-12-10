import express, { Express, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";

const app: Express = express();

app.post("/create", async (req: Request, res: Response) => {
  try {
    const {
      name,
      sku,
      brand,
      category,
      unitPrice,
      minimumStock,
      serviceCenterId,
    } = req.body;
    if (!name || !sku || !brand || !category || !unitPrice || !minimumStock) {
      return res.status(400).send("Missing Fields");
    }

    if (!serviceCenterId) {
      return res.status(404).send("Service Center Id is required");
    }

    const checkIfServiceCenterExist = await prisma.serviceCenter.findUnique({
      where: {
        id: serviceCenterId,
      },
      select: {
        email: true,
      },
    });

    if (!checkIfServiceCenterExist) {
      return res.status(404).send("Service center not found");
    }

    const newInventoryItem = await prisma.inventory.create({
      data: {
        name,
        sku,
        brand,
        category,
        unitPrice: Number(unitPrice),
        quantity: Number(minimumStock),
        serviceCenterId,
      },
    });

    return res.status(201).json({
      message: "Created Successfully",
      new_inventory_item: newInventoryItem,
    });
  } catch (error) {
    return res.status(500).send("Internal Server Error");
  }
});

app.delete(
  "/delete/:inventoryItemId",
  async function (req: Request, res: Response) {
    try {
      const { inventoryItemId } = req.params;
      const { serviceCenterId } = req.query;

      if (!inventoryItemId) {
        return res.status(400).send("Inventory Item Id is required");
      }

      if (!serviceCenterId) {
        return res.status(400).send("Service Center Id is required");
      }

      const checkIfServiceCenterExist = await prisma.serviceCenter.findUnique({
        where: {
          id: String(serviceCenterId),
        },
        select: {
          email: true,
        },
      });

      if (!checkIfServiceCenterExist) {
        return res.status(404).send("Service Center not found");
      }

      await prisma.inventory.delete({
        where: {
          id: inventoryItemId,
        },
      });

      return res.status(200).send("Inventory Item Deleted Successfully");
    } catch (error) {
      return res.status(500).send("Internal Server Error");
    }
  }
);

export default app;
