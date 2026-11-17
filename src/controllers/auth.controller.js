const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../config/db");

const signToken = (user) =>
  jwt.sign(
    { id: user.id, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: "7d" },
  );

exports.register = async (req, res) => {
  try {
    const { name, phone, email, password, role } = req.body;
    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing)
      return res
        .status(400)
        .json({ success: false, message: "Phone already registered" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name,
        phone,
        email: email || null,
        passwordHash,
        role: role === "ADMIN" ? "ADMIN" : "CUSTOMER",
      },
    });

    res.status(201).json({
      success: true,
      token: signToken(user),
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { phone, password } = req.body;
    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user || user.isDeleted) {
      return res
        .status(401)
        .json({ success: false, message: "Account not found or deactivated" });
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid)
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });

    res.json({
      success: true,
      token: signToken(user),
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
