const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");
const {
  app,
  prisma,
  setupUserLookup,
  loginAs,
  resetMocks,
  request,
} = require("./helpers/apiTestKit");

/** PNG mínimo válido (1x1 transparente) */
const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

describe("POST /uploads/branding-logo", () => {
  beforeAll(() => {
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET = "unit_test_secret";
  });

  beforeEach(() => {
    resetMocks();
    const passwordHash = bcrypt.hashSync("123456", 10);
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
  });

  test("aceita multipart e persiste logoUrl", async () => {
    const login = await loginAs("admin@pizzaria.local", "123456");
    expect(login.status).toBe(200);
    const token = login.body.token;

    prisma.establishmentSetting.findUnique.mockResolvedValue({
      id: 1,
      tradeName: "Pizzaria",
      logoUrl: null,
      deliveryFeeDefault: 0,
    });
    prisma.establishmentSetting.upsert.mockResolvedValue({
      id: 1,
      tradeName: "Pizzaria",
      logoUrl: "/uploads/branding/logo-test.png",
      deliveryFeeDefault: 0,
    });

    const res = await request(app)
      .post("/uploads/branding-logo")
      .set("Authorization", `Bearer ${token}`)
      .attach("logo", tinyPng, "logo.png");

    expect(res.status).toBe(201);
    expect(res.body.logoUrl).toMatch(/^\/uploads\/branding\//);
    expect(prisma.establishmentSetting.upsert).toHaveBeenCalled();

    const brandingDir = path.join(__dirname, "../uploads/branding");
    const files = fs.readdirSync(brandingDir).filter((f) => f.startsWith("logo-"));
    expect(files.length).toBeGreaterThanOrEqual(1);
  });

  test("POST /settings/establishment-logo-data aceita data URL", async () => {
    const login = await loginAs("admin@pizzaria.local", "123456");
    const token = login.body.token;
    prisma.establishmentSetting.findUnique.mockResolvedValue({
      id: 1,
      tradeName: "Pizzaria",
      logoUrl: null,
      deliveryFeeDefault: 0,
    });
    prisma.establishmentSetting.upsert.mockResolvedValue({
      id: 1,
      tradeName: "Pizzaria",
      logoUrl: "/uploads/branding/logo-data.png",
      deliveryFeeDefault: 0,
    });
    const dataUrl = `data:image/png;base64,${tinyPng.toString("base64")}`;
    const res = await request(app)
      .post("/settings/establishment-logo-data")
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", "application/json")
      .send({ dataUrl });
    expect(res.status).toBe(201);
    expect(res.body.logoUrl).toMatch(/^\/uploads\/branding\//);
  });

  test("rejeita sem arquivo", async () => {
    const login = await loginAs("admin@pizzaria.local", "123456");
    const token = login.body.token;
    const res = await request(app)
      .post("/uploads/branding-logo")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toBeTruthy();
  });
});
