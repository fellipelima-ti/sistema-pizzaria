const bcrypt = require("bcryptjs");

const users = [
  {
    id: 1,
    name: "Administrador",
    email: "admin@pizzaria.local",
    role: "admin",
    passwordHash: bcrypt.hashSync("123456", 10),
  },
];

const products = [
  { id: 1, name: "Pizza Calabresa", price: 52.9, category: "pizza" },
  { id: 2, name: "Refrigerante 2L", price: 12.0, category: "bebida" },
];

const orders = [];

module.exports = {
  users,
  products,
  orders,
};
