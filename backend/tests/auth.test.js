const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { app, prisma, setupUserLookup, loginAs, resetMocks, request } = require("./helpers/apiTestKit");

describe("API auth flows", () => {
  beforeAll(() => {
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET = "unit_test_secret";
  });

  beforeEach(() => {
    resetMocks();
  });

  test("login com credenciais validas retorna token", async () => {
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

    const response = await loginAs("admin@pizzaria.local", "123456");
    expect(response.status).toBe(200);
    expect(response.body.token).toBeTruthy();
    expect(response.body.user?.role).toBe("admin");
  });

  test("login normaliza email para minusculas", async () => {
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

    const response = await loginAs("Admin@Pizzaria.Local", "123456");
    expect(response.status).toBe(200);
    expect(response.body.token).toBeTruthy();
  });

  test("login bloqueia usuario inativo", async () => {
    const passwordHash = await bcrypt.hash("123456", 10);
    setupUserLookup([
      {
        id: 9,
        name: "Inativo",
        email: "inativo@pizzaria.local",
        role: "garcom",
        active: false,
        passwordHash,
      },
    ]);

    const response = await loginAs("inativo@pizzaria.local", "123456");
    expect(response.status).toBe(403);
  });

  test("token invalido retorna 401 em rota protegida", async () => {
    const response = await request(app)
      .get("/orders")
      .set("Authorization", "Bearer token_invalido");

    expect(response.status).toBe(401);
  });

  test("recuperacao falha com codigo expirado", async () => {
    const passwordHash = await bcrypt.hash("123456", 10);
    setupUserLookup([
      {
        id: 1,
        name: "Administrador",
        email: "admin@pizzaria.local",
        role: "admin",
        active: true,
        passwordHash,
        recoveryCodeHash: "qualquer_hash",
        recoveryCodeExpiresAt: new Date(Date.now() - 60 * 1000),
      },
    ]);

    const response = await request(app).post("/auth/recovery/confirm").send({
      email: "admin@pizzaria.local",
      code: "123456",
      newPassword: "654321",
    });

    expect(response.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test("recuperacao de senha com codigo valido funciona", async () => {
    const passwordHash = await bcrypt.hash("123456", 10);
    const code = "654321";
    const recoveryCodeHash = crypto
      .createHash("sha256")
      .update(code)
      .digest("hex");
    setupUserLookup([
      {
        id: 1,
        name: "Administrador",
        email: "admin@pizzaria.local",
        role: "admin",
        active: true,
        passwordHash,
        recoveryCodeHash,
        recoveryCodeExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    ]);
    prisma.user.update.mockResolvedValue({ id: 1 });

    const response = await request(app).post("/auth/recovery/confirm").send({
      email: "admin@pizzaria.local",
      code,
      newPassword: "nova1234",
    });

    expect(response.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalled();
    const updateArgs = prisma.user.update.mock.calls[0][0];
    expect(updateArgs.data.recoveryCodeHash).toBeNull();
    expect(updateArgs.data.recoveryCodeExpiresAt).toBeNull();
    expect(updateArgs.data.passwordHash).toBeTruthy();
  });

  test("request de recuperacao em dev retorna devCode para usuario existente", async () => {
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
    prisma.user.update.mockResolvedValue({ id: 1 });

    const response = await request(app).post("/auth/recovery/request").send({
      email: "admin@pizzaria.local",
    });

    expect(response.status).toBe(200);
    expect(response.body.devCode).toBeTruthy();
    expect(String(response.body.devCode)).toHaveLength(6);
    expect(prisma.user.update).toHaveBeenCalled();
  });

  test("request de recuperacao em producao nao expõe devCode", async () => {
    const oldNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
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
      prisma.user.update.mockResolvedValue({ id: 1 });

      const response = await request(app).post("/auth/recovery/request").send({
        email: "admin@pizzaria.local",
      });

      expect(response.status).toBe(200);
      expect(response.body.devCode).toBeUndefined();
      expect(prisma.user.update).toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = oldNodeEnv || "test";
    }
  });

  test("request de recuperacao com email inexistente nao gera codigo", async () => {
    setupUserLookup([]);

    const response = await request(app).post("/auth/recovery/request").send({
      email: "naoexiste@pizzaria.local",
    });

    expect(response.status).toBe(200);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
