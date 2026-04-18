const bcrypt = require("bcryptjs");
const {
  app,
  prisma,
  setupUserLookup,
  loginAs,
  resetMocks,
  request,
} = require("./helpers/apiTestKit");

const SIZES_PMG = [
  { label: "P", price: 30, sortOrder: 0 },
  { label: "M", price: 45, sortOrder: 1 },
  { label: "G", price: 70, sortOrder: 2 },
];

const SIZES_SEM_G = [
  { label: "P", price: 25, sortOrder: 0 },
  { label: "M", price: 40, sortOrder: 1 },
];

describe("Pedidos: tamanhos e meia a meia (G)", () => {
  beforeAll(() => {
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET = "unit_test_secret";
  });

  beforeEach(() => {
    resetMocks();
  });

  async function tokenCaixa() {
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
    return login.body.token;
  }

  test("produto com tamanhos exige sizeLabel", async () => {
    const token = await tokenCaixa();
    prisma.product.findMany.mockResolvedValue([
      {
        id: 1,
        name: "Calabresa",
        price: 30,
        available: true,
        sizes: SIZES_PMG,
      },
    ]);

    const res = await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId: 10,
        type: "balcao",
        items: [{ productId: 1, quantity: 1 }],
      });

    expect(res.status).toBe(400);
    expect(String(res.body.message || "")).toMatch(/Informe o tamanho/i);
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  test("tamanho P não aceita segundo sabor", async () => {
    const token = await tokenCaixa();
    prisma.product.findMany.mockResolvedValue([
      { id: 1, name: "Calabresa", price: 30, available: true, sizes: SIZES_PMG },
      { id: 2, name: "Portuguesa", price: 30, available: true, sizes: SIZES_PMG },
    ]);

    const res = await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId: 10,
        type: "balcao",
        items: [
          {
            productId: 1,
            quantity: 1,
            sizeLabel: "P",
            secondProductId: 2,
          },
        ],
      });

    expect(res.status).toBe(400);
    expect(String(res.body.message || "")).toMatch(/Só pizza G|meia a meia/i);
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  test("tamanho G exige segundo sabor", async () => {
    const token = await tokenCaixa();
    prisma.product.findMany.mockResolvedValue([
      { id: 1, name: "Calabresa", price: 30, available: true, sizes: SIZES_PMG },
    ]);

    const res = await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId: 10,
        type: "balcao",
        items: [{ productId: 1, quantity: 1, sizeLabel: "G" }],
      });

    expect(res.status).toBe(400);
    expect(String(res.body.message || "")).toMatch(/2º sabor|meia a meia/i);
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  test("G exige que o segundo produto tenha o mesmo tamanho cadastrado", async () => {
    const token = await tokenCaixa();
    prisma.product.findMany.mockResolvedValue([
      { id: 1, name: "Calabresa", price: 30, available: true, sizes: SIZES_PMG },
      {
        id: 2,
        name: "Item sem G",
        price: 10,
        available: true,
        sizes: SIZES_SEM_G,
      },
    ]);

    const res = await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId: 10,
        type: "balcao",
        items: [
          {
            productId: 1,
            quantity: 1,
            sizeLabel: "G",
            secondProductId: 2,
          },
        ],
      });

    expect(res.status).toBe(400);
    expect(String(res.body.message || "")).toMatch(/não possui o tamanho|G/i);
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  test("G com dois sabores usa o maior preco e grava secondProductId", async () => {
    const token = await tokenCaixa();
    const sizesSegundo = [
      { label: "P", price: 28, sortOrder: 0 },
      { label: "M", price: 42, sortOrder: 1 },
      { label: "G", price: 85, sortOrder: 2 },
    ];
    prisma.product.findMany.mockResolvedValue([
      { id: 1, name: "Calabresa", price: 28, available: true, sizes: SIZES_PMG },
      { id: 2, name: "Portuguesa", price: 28, available: true, sizes: sizesSegundo },
    ]);
    prisma.order.create.mockResolvedValue({
      id: 100,
      total: 85,
      status: "novo",
      paymentStatus: "pendente",
      customer: { id: 10, name: "X" },
      items: [],
      table: null,
    });

    const res = await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customerId: 10,
        type: "balcao",
        items: [
          {
            productId: 1,
            quantity: 1,
            sizeLabel: "G",
            secondProductId: 2,
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(prisma.order.create).toHaveBeenCalled();
    const arg = prisma.order.create.mock.calls[0][0];
    const rows = arg.data.items.create;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      productId: 1,
      secondProductId: 2,
      sizeLabel: "G",
      quantity: 1,
      unitPrice: 85,
      subtotal: 85,
    });
  });

  test("POST /public/orders aceita G meia a meia quando QR liberado", async () => {
    prisma.diningTable.findUnique.mockResolvedValue({
      id: 1,
      number: 3,
      label: null,
      publicToken: "tok-test",
      qrEnabled: true,
    });
    prisma.product.findMany.mockResolvedValue([
      { id: 1, name: "Sabor A", price: 30, available: true, sizes: SIZES_PMG },
      { id: 2, name: "Sabor B", price: 30, available: true, sizes: SIZES_PMG },
    ]);
    prisma.customer.create.mockResolvedValue({ id: 50 });
    prisma.order.create.mockResolvedValue({
      id: 202,
      total: 70,
      status: "novo",
      paymentStatus: "pendente",
      customer: { id: 50, name: "Mesa" },
      items: [],
      table: { number: 3 },
    });

    const res = await request(app).post("/public/orders").send({
      publicToken: "tok-test",
      customerName: "João",
      items: [
        {
          productId: 1,
          quantity: 1,
          sizeLabel: "G",
          secondProductId: 2,
        },
      ],
    });

    expect(res.status).toBe(201);
    expect(prisma.order.create).toHaveBeenCalled();
    const arg = prisma.order.create.mock.calls[0][0];
    expect(arg.data.items.create[0]).toMatchObject({
      productId: 1,
      secondProductId: 2,
      unitPrice: 70,
      subtotal: 70,
    });
  });
});
