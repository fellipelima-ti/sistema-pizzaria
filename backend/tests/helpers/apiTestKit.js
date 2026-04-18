const request = require("supertest");

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(),
    $queryRawUnsafe: jest.fn(),
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    product: {
      findMany: jest.fn(),
      count: jest.fn(),
      createMany: jest.fn(),
    },
    order: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    cashShift: {
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    customer: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
    },
    diningTable: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
    },
    tableServiceRequest: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    tableCheckoutDiscountLog: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    establishmentSetting: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

const { prisma } = require("../../src/lib/prisma");
const { app } = require("../../src/server");

function setupUserLookup(users) {
  prisma.user.findUnique.mockImplementation(async ({ where }) => {
    if (where?.email) {
      return users.find((u) => u.email === where.email) || null;
    }
    if (where?.id) {
      return users.find((u) => u.id === Number(where.id)) || null;
    }
    return null;
  });
}

async function loginAs(email, password) {
  return request(app).post("/auth/login").send({ email, password });
}

function resetMocks() {
  jest.clearAllMocks();
  prisma.cashShift.findFirst.mockResolvedValue({ id: 1, status: "aberto" });
  prisma.$queryRawUnsafe.mockResolvedValue([{ "?column?": 1 }]);
  prisma.$transaction.mockImplementation(async (ops) => Promise.all(ops));
  prisma.diningTable.update.mockResolvedValue({ id: 1, qrEnabled: false });
  prisma.order.updateMany.mockResolvedValue({ count: 0 });
  prisma.tableServiceRequest.updateMany.mockResolvedValue({ count: 0 });
  prisma.tableServiceRequest.update.mockResolvedValue({ id: 1, status: "atendido" });
  prisma.tableCheckoutDiscountLog.create.mockResolvedValue({ id: 1 });
}

module.exports = {
  app,
  prisma,
  setupUserLookup,
  loginAs,
  resetMocks,
  request,
};
