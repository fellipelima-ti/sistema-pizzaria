const { app, prisma, resetMocks, request } = require("./helpers/apiTestKit");

describe("GET /health", () => {
  beforeAll(() => {
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET = "unit_test_secret";
  });

  beforeEach(() => {
    resetMocks();
  });

  test("retorna 200 quando o banco responde", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.database).toBe("up");
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith("SELECT 1");
  });

  test("retorna 503 quando o banco falha", async () => {
    prisma.$queryRawUnsafe.mockRejectedValueOnce(new Error("connection refused"));
    const res = await request(app).get("/health");
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("degraded");
    expect(res.body.database).toBe("down");
    expect(String(res.body.message || "")).toMatch(/connection refused/i);
  });
});
