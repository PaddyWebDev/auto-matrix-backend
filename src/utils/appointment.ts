import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";

export async function checkAppointmentExist(
  whereClause: Prisma.AppointmentWhereUniqueInput,
  selectData: Prisma.AppointmentSelect
) {
  return await prisma.appointment.findUnique({
    where: whereClause,
    select: selectData,
  });
}
