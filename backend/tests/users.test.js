const bcrypt = require("bcryptjs");
const { app, prisma, setupUserLookup, loginAs, resetMocks, request } = require("./helpers/apiTestKit");

describe("API users management guards", () => {
  beforeAll(() => {
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET = "unit_test_secret";
  });

  beforeEach(() => {
    resetMocks();
  });

  test("admin nao pode desativar a propria conta", async () => {
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

    const login = await loginAs("admin@pizzaria.local", "123456");
    const token = login.body.token;

    const response = await request(app)
      .patch("/users/1")
      .set("Authorization", `Bearer ${token}`)
      .send({ active: false });

    expect(response.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test("admin nao pode desativar ultimo admin ativo", async () => {
    const passwordHash = await bcrypt.hash("123456", 10);
    setupUserLookup([
      {
        id: 1,
        name: "Admin Logado",
        email: "admin1@pizzaria.local",
        role: "admin",
        active: true,
        passwordHash,
      },
      {
        id: 2,
        name: "Ultimo Admin",
        email: "admin2@pizzaria.local",
        role: "admin",
        active: true,
        passwordHash,
      },
    ]);
    prisma.user.count.mockResolvedValue(1);

    const login = await loginAs("admin1@pizzaria.local", "123456");
    const token = login.body.token;

    const response = await request(app)
      .patch("/users/2")
      .set("Authorization", `Bearer ${token}`)
      .send({ active: false });

    expect(response.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test("admin pode gerar codigo de recuperacao para usuario ativo", async () => {
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
      {
        id: 2,
        name: "Atendimento",
        email: "caixa@pizzaria.local",
        role: "caixa",
        active: true,
        passwordHash,
      },
    ]);
    prisma.user.update.mockResolvedValue({ id: 2 });

    const login = await loginAs("admin@pizzaria.local", "123456");
    const token = login.body.token;

    const response = await request(app)
      .post("/users/2/recovery-code")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.code).toBeTruthy();
    expect(String(response.body.code)).toHaveLength(6);
    expect(response.body.expiresInMinutes).toBe(15);
    expect(prisma.user.update).toHaveBeenCalled();
  });

  test("admin nao gera codigo para usuario inativo", async () => {
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
      {
        id: 2,
        name: "Inativo",
        email: "inativo@pizzaria.local",
        role: "garcom",
        active: false,
        passwordHash,
      },
    ]);

    const login = await loginAs("admin@pizzaria.local", "123456");
    const token = login.body.token;

    const response = await request(app)
      .post("/users/2/recovery-code")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
