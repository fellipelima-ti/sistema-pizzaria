const { app, prisma, resetMocks, request } = require("./helpers/apiTestKit");

describe("API public table QR gate (qrEnabled)", () => {
  beforeAll(() => {
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET = "unit_test_secret";
  });

  beforeEach(() => {
    resetMocks();
  });

  test("GET /public/table/:token retorna 403 quando QR nao liberado", async () => {
    prisma.diningTable.findUnique.mockResolvedValue({
      id: 2,
      number: 5,
      label: null,
      publicToken: "abc-token",
      qrEnabled: false,
    });

    const res = await request(app).get("/public/table/abc-token");

    expect(res.status).toBe(403);
    expect(String(res.body.message || "")).toMatch(/liberar/i);
  });

  test("GET /public/table/:token retorna dados quando QR liberado", async () => {
    prisma.diningTable.findUnique.mockResolvedValue({
      id: 2,
      number: 5,
      label: "Varanda",
      publicToken: "abc-token",
      qrEnabled: true,
    });

    const res = await request(app).get("/public/table/abc-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        id: 2,
        number: 5,
        label: "Varanda",
      })
    );
  });
});
