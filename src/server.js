require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const app = express();
app.use(helmet());

app.use(
  cors({
    origin: [
      "http://localhost:5174",
      "https://sagaboutiqe.com",
      "https://www.sagaboutiqe.com",
      process.env.FRONTEND_URL,
      process.env.FRONTEND_WWW_URL,
    ].filter(Boolean),
    credentials: true,
  }),
);
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));
// MUST come before routes to allow 4-5 images in JSON payload
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use(morgan("dev"));

app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/store", require("./routes/order.routes"));
app.use("/api/admin", require("./routes/admin.routes"));

app.get("/health", (_, res) =>
  res.json({ status: "SAGA Boutique API Running" }),
);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`SAGA Boutique Server running on port ${PORT}`),
);
