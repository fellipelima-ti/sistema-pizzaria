const jwt = require("jsonwebtoken");
const { prisma } = require("../lib/prisma");

async function authRequired(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : null;

  if (!token) {
    return res.status(401).json({ message: "Token não informado." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const dbUser = await prisma.user.findUnique({
      where: { id: Number(decoded.id) },
      select: { id: true, email: true, role: true, active: true },
    });
    if (!dbUser || dbUser.active === false) {
      return res.status(401).json({ message: "Usuário inativo ou inexistente." });
    }
    req.user = { id: dbUser.id, email: dbUser.email, role: dbUser.role };
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Token inválido." });
  }
}

const VALID_ROLES = ["admin", "caixa", "cozinha", "garcom"];

function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    const role = req.user?.role || "admin";
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        message: "Sem permissão para esta ação (perfil insuficiente).",
      });
    }
    return next();
  };
}

module.exports = {
  authRequired,
  requireRoles,
  VALID_ROLES,
};
