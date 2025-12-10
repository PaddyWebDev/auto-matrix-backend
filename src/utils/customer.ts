import prisma from "../lib/prisma";

export async function checkIfCustomerExistById(userId: string): Promise<{
  id: string;
} | null> {
  return await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
    },
  });
}
