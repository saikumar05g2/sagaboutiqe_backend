const crypto = require("crypto");
const Razorpay = require("razorpay");
const prisma = require("../config/db");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

exports.getPublicProducts = async (req, res) => {
  try {
    const { category, page, limit } = req.query;
    const where = { ...(category && category !== "ALL" ? { category } : {}) };

    // If page & limit are provided, return paginated batch for infinite scroll
    if (page && limit) {
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.max(1, parseInt(limit, 10) || 12);
      const skip = (pageNum - 1) * limitNum;

      const [products, total] = await Promise.all([
        prisma.product.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limitNum,
        }),
        prisma.product.count({ where }),
      ]);

      return res.json({
        success: true,
        data: products,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          hasMore: skip + products.length < total,
        },
      });
    }

    // Default: return full catalog (used by Admin Inventory table)
    const products = await prisma.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveMeasurementProfile = async (req, res) => {
  try {
    const { profileName, gender, unit, measurements, notes } = req.body;
    const profile = await prisma.measurementProfile.create({
      data: {
        userId: req.user.id,
        profileName,
        gender,
        unit,
        measurements,
        notes,
      },
    });
    res.status(201).json({ success: true, data: profile });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyMeasurements = async (req, res) => {
  try {
    const profiles = await prisma.measurementProfile.findMany({
      where: { userId: req.user.id },
      orderBy: { updatedAt: "desc" },
    });
    res.json({ success: true, data: profiles });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createCheckoutOrder = async (req, res) => {
  try {
    const { cartItems, shippingAddress } = req.body;

    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Your cart is empty." });
    }

    if (!shippingAddress || !shippingAddress.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Shipping address is required." });
    }

    let totalAmount = 0;
    const preparedItems = [];

    // 1. Validate stock availability and calculate order total
    for (const item of cartItems) {
      const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
      });

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "One of the selected outfits is no longer available.",
        });
      }

      if (!product.inStock || product.stockQuantity < qty) {
        return res.status(400).json({
          success: false,
          message:
            product.stockQuantity <= 0
              ? `"${product.name}" is currently Out of Stock.`
              : `Only ${product.stockQuantity} unit(s) left for "${product.name}".`,
        });
      }

      totalAmount += product.basePrice * qty;

      preparedItems.push({
        productId: product.id,
        quantity: qty,
        selectedSize: item.selectedSize || "M",
        selectedColor: item.selectedColor || "Default",
        measurementSnapshot:
          item.selectedSize === "CUSTOMISED" ? item.measurementSnapshot : null,
        stitchingNotes: item.stitchingNotes || "",
        price: product.basePrice,
      });
    }

    // 2. Create Razorpay order (or mock order if placeholder keys are configured)
    const isPlaceholderKey =
      !process.env.RAZORPAY_KEY_ID ||
      process.env.RAZORPAY_KEY_ID.includes("xxxxx");

    let rzpOrder = {
      id: `mock_rzp_${Date.now()}`,
      amount: Math.round(totalAmount * 100),
    };

    if (!isPlaceholderKey) {
      rzpOrder = await razorpay.orders.create({
        amount: Math.round(totalAmount * 100),
        currency: "INR",
        receipt: `saga_${Date.now()}`,
      });
    }

    const orderNumber = `SAGA-${Math.floor(1000 + Math.random() * 9000)}`;

    // 3. Atomically decrement stock, toggle inStock flag, and create the order
    const order = await prisma.$transaction(async (tx) => {
      for (const item of preparedItems) {
        const updatedProd = await tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: { decrement: item.quantity } },
        });

        await tx.product.update({
          where: { id: item.productId },
          data: { inStock: updatedProd.stockQuantity > 0 },
        });
      }

      return tx.order.create({
        data: {
          orderNumber,
          userId: req.user.id,
          totalAmount,
          paymentStatus: isPlaceholderKey ? "PAID" : "PENDING",
          razorpayOrderId: rzpOrder.id,
          shippingAddress: shippingAddress.trim(),
          items: { create: preparedItems },
        },
        include: { items: { include: { product: true } } },
      });
    });

    res.status(201).json({
      success: true,
      mockMode: isPlaceholderKey,
      order,
      razorpay: {
        orderId: rzpOrder.id,
        amount: rzpOrder.amount,
        keyId: process.env.RAZORPAY_KEY_ID,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message:
        error.error?.description ||
        error.message ||
        "Failed to create checkout order.",
    });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const {
      orderId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;
    const expectedSig = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSig !== razorpay_signature) {
      return res
        .status(400)
        .json({ success: false, message: "Payment signature mismatch" });
    }

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: "PAID",
        razorpayPaymentId: razorpay_payment_id,
        status: "CONFIRMED",
      },
    });
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyOrders = async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.user.id },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const DEFAULT_CATEGORIES = [
  { name: "Bridal & Maggam Blouses", slug: "BLOUSE", genderType: "WOMEN" },
  { name: "Lehengas", slug: "LEHENGA", genderType: "WOMEN" },
  { name: "Designer Frocks", slug: "FROCK", genderType: "WOMEN" },
  { name: "Men's Blazers", slug: "BLAZER", genderType: "MEN" },
  { name: "Formal Shirts", slug: "SHIRT", genderType: "MEN" },
  { name: "Tailored Trousers", slug: "PANT", genderType: "MEN" },
];

exports.getCategories = async (req, res) => {
  try {
    let categories = await prisma.category.findMany({
      orderBy: { createdAt: "asc" },
    });

    // Seed initial categories once if database table is empty
    if (categories.length === 0) {
      await prisma.category.createMany({
        data: DEFAULT_CATEGORIES,
        skipDuplicates: true,
      });
      categories = await prisma.category.findMany({
        orderBy: { createdAt: "asc" },
      });
    }

    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const DEFAULT_MEASUREMENT_FIELDS = [
  // WOMEN defaults
  { label: "Bust", genderType: "WOMEN", sortOrder: 1 },
  { label: "Upper Bust", genderType: "WOMEN", sortOrder: 2 },
  { label: "Waist", genderType: "WOMEN", sortOrder: 3 },
  { label: "Hip", genderType: "WOMEN", sortOrder: 4 },
  { label: "Shoulder", genderType: "WOMEN", sortOrder: 5 },
  { label: "Armhole", genderType: "WOMEN", sortOrder: 6 },
  { label: "Sleeve Length", genderType: "WOMEN", sortOrder: 7 },
  { label: "Outfit Length", genderType: "WOMEN", sortOrder: 8 },
  // MEN defaults
  { label: "Chest", genderType: "MEN", sortOrder: 1 },
  { label: "Stomach / Waist", genderType: "MEN", sortOrder: 2 },
  { label: "Hip", genderType: "MEN", sortOrder: 3 },
  { label: "Shoulder", genderType: "MEN", sortOrder: 4 },
  { label: "Sleeve Length", genderType: "MEN", sortOrder: 5 },
  { label: "Neck / Collar", genderType: "MEN", sortOrder: 6 },
  { label: "Jacket / Shirt Length", genderType: "MEN", sortOrder: 7 },
  { label: "Trouser Inseam", genderType: "MEN", sortOrder: 8 },
];

exports.getMeasurementFields = async (req, res) => {
  try {
    let fields = await prisma.measurementField.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    if (fields.length === 0) {
      await prisma.measurementField.createMany({
        data: DEFAULT_MEASUREMENT_FIELDS,
        skipDuplicates: true,
      });
      fields = await prisma.measurementField.findMany({
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
    }

    res.json({ success: true, data: fields });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
