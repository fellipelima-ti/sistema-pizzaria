const bcrypt = require("bcryptjs");
const { app, prisma, setupUserLookup, loginAs, resetMocks, request } = require("./helpers/apiTestKit");

describe("API order and payment flows", () => {
  beforeAll(() => {
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET = "unit_test_secret";
  });

  beforeEach(() => {
    resetMocks();
  });

  test("caixa consegue criar pedido quando caixa está aberto", async () => {
    const passwordHash = await bcrypt.hash("123456", 10);
    setupUserLookup([
      {
        id: 2,
        name: "Atendimento",
        email: "caixa@pizzaria.local",
        role: "caixa",
        active: true,
        passwordHash,
      },
    ]);
    prisma.product.findMany.mockResolvedValue([
      { id: 1, name: "Pizza Calabresa", price: 50, available: true },
    ]);
    prisma.order.create.mockResolvedValue({
      id: 99,
      total: 100,
      status: "novo",
      paymentStatus: "pendente",
      customer: { id: 10, name: "Cliente Balcão" },
      items: [],
      table: null,
    });

    const login = await loginAs("caixa@pizzaria.local", "123456");
    const token = login.body.token;

    const response = await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId: 10,
        type: "balcao",
        items: [{ productId: 1, quantity: 2 }],
      });

    expect(response.status).toBe(201);
    expect(prisma.order.create).toHaveBeenCalled();
  });

  test("criar pedido falha quando caixa está fechado", async () => {
    const passwordHash = await bcrypt.hash("123456", 10);
    setupUserLookup([
      {
        id: 2,
        name: "Atendimento",
        email: "caixa@pizzaria.local",
        role: "caixa",
        active: true,
        passwordHash,
      },
    ]);
    prisma.cashShift.findFirst.mockResolvedValue(null);
    prisma.product.findMany.mockResolvedValue([
      { id: 1, name: "Pizza Calabresa", price: 50, available: true },
    ]);

    const login = await loginAs("caixa@pizzaria.local", "123456");
    const token = login.body.token;

    const response = await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId: 10,
        type: "balcao",
        items: [{ productId: 1, quantity: 1 }],
      });

    expect(response.status).toBe(403);
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  test("criar pedido falha com item inválido", async () => {
    const passwordHash = await bcrypt.hash("123456", 10);
    setupUserLookup([
      {
        id: 2,
        name: "Atendimento",
        email: "caixa@pizzaria.local",
        role: "caixa",
        active: true,
        passwordHash,
      },
    ]);
    prisma.product.findMany.mockResolvedValue([]);

    const login = await loginAs("caixa@pizzaria.local", "123456");
    const token = login.body.token;

    const response = await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId: 10,
        type: "balcao",
        items: [{ productId: 999, quantity: 1 }],
      });

    expect(response.status).toBe(400);
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  test("caixa não pode registrar pagamento", async () => {
    const passwordHash = await bcrypt.hash("123456", 10);
    setupUserLookup([
      {
        id: 2,
        name: "Atendimento",
        email: "caixa@pizzaria.local",
        role: "caixa",
        active: true,
        passwordHash,
      },
    ]);

    const login = await loginAs("caixa@pizzaria.local", "123456");
    const token = login.body.token;

    const response = await request(app)
      .patch("/orders/123/payment")
      .set("Authorization", `Bearer ${token}`)
      .send({ paymentMethod: "pix", paymentStatus: "pago" });

    expect(response.status).toBe(403);
  });

  test("admin pode registrar pagamento", async () => {
    const passwordHash = await bcrypt.hash("123456", 10);
    setupUserLookup([
      {
        id: 1,
        name: "Administrador",
        email: "admin@pizzaria.local",
        role: "admin",
        active: true,
        passwordHash,
      },
    ]);
    prisma.order.update.mockResolvedValue({
      id: 123,
      paymentMethod: "pix",
      paymentStatus: "pago",
      customer: { id: 10, name: "Cliente Balcão" },
      table: null,
      items: [],
    });

    const login = await loginAs("admin@pizzaria.local", "123456");
    const token = login.body.token;

    const response = await request(app)
      .patch("/orders/123/payment")
      .set("Authorization", `Bearer ${token}`)
      .send({ paymentMethod: "pix", paymentStatus: "pago" });

    expect(response.status).toBe(200);
    expect(prisma.order.update).toHaveBeenCalled();
  });

  test("pedido entrega exige endereço e telefone", async () => {
    const passwordHash = await bcrypt.hash("123456", 10);
    setupUserLookup([
      {
        id: 2,
        name: "Atendimento",
        email: "caixa@pizzaria.local",
        role: "caixa",
        active: true,
        passwordHash,
      },
    ]);
    prisma.product.findMany.mockResolvedValue([
      { id: 1, name: "Pizza", price: 40, available: true },
    ]);
    prisma.establishmentSetting.findUnique.mockResolvedValue({
      id: 1,
      tradeName: "Pizzaria",
      logoUrl: null,
      deliveryFeeDefault: 5,
    });

    const login = await loginAs("caixa@pizzaria.local", "123456");
    const token = login.body.token;

    const response = await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId: 10,
        type: "entrega",
        items: [{ productId: 1, quantity: 1 }],
 });

    expect(response.status).toBe(400);
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  test("pedido entrega soma taxa e atualiza cliente", async () => {
    const passwordHash = await bcrypt.hash("123456", 10);
    setupUserLookup([
      {
        id: 2,
        name: "Atendimento",
        email: "caixa@pizzaria.local",
        role: "caixa",
        active: true,
        passwordHash,
      },
    ]);
    prisma.product.findMany.mockResolvedValue([
      { id: 1, name: "Pizza", price: 40, available: true },
    ]);
    prisma.establishmentSetting.findUnique.mockResolvedValue({
      id: 1,
      tradeName: "Pizzaria",
      logoUrl: null,
      deliveryFeeDefault: 6.5,
    });
    prisma.customer.findUnique.mockResolvedValue({
      id: 10,
      name: "Maria",
      phone: null,
      address: null,
    });
    prisma.customer.update.mockResolvedValue({});
    prisma.order.create.mockResolvedValue({
      id: 77,
      total: 46.5,
      deliveryFee: 6.5,
      type: "entrega",
      status: "novo",
      paymentStatus: "pendente",
      customer: { id: 10, name: "Maria" },
      items: [],
      table: null,
    });

    const login = await loginAs("caixa@pizzaria.local", "123456");
    const token = login.body.token;

    const response = await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId: 10,
        type: "entrega",
        deliveryPhone: "(11) 98888-7777",
        deliveryAddress: "Rua das Flores, 100 — Centro",
        items: [{ productId: 1, quantity: 1 }],
      });

    expect(response.status).toBe(201);
    expect(prisma.customer.update).toHaveBeenCalled();
    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "entrega",
          deliveryFee: 6.5,
          total: 46.5,
          deliveryAddress: "Rua das Flores, 100 — Centro",
        }),
      })
    );
  });
});
