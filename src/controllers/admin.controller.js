const Razorpay = require("razorpay");
const prisma = require("../config/db");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

exports.addStock = async (req, res) => {
  try {
    const {
      name,
      category,
      description,
      basePrice,
      stockQuantity,
      images,
      isCustomizable,
    } = req.body;
    const qty = parseInt(stockQuantity, 10) || 0;

    if (!images || images.length < 4 || images.length > 5) {
      return res.status(400).json({
        success: false,
        message: "Please upload 4 to 5 pictures for each outfit.",
      });
    }
    const product = await prisma.product.create({
      data: {
        name,
        category,
        description: description || "",
        basePrice: parseFloat(basePrice),
        isCustomizable: isCustomizable !== false,
        stockQuantity: qty,
        inStock: qty > 0,
        images,
      },
    });
    res.status(201).json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAllOrders = async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      include: {
        user: { select: { id: true, name: true, phone: true } },
        items: { include: { product: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { status },
    });
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { cancellationReason } = req.body;
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });

    let paymentStatus = order.paymentStatus;
    if (order.paymentStatus === "PAID" && order.razorpayPaymentId) {
      await razorpay.payments.refund(order.razorpayPaymentId, {
        notes: { reason: cancellationReason, orderNumber: order.orderNumber },
      });
      paymentStatus = "REFUNDED";
    }

    const cancelled = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "CANCELLED",
        paymentStatus,
        cancellationReason: cancellationReason || "Cancelled by Admin",
      },
    });
    res.json({ success: true, data: cancelled });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getCustomers = async (req, res) => {
  try {
    const customers = await prisma.user.findMany({
      where: { role: "CUSTOMER", isDeleted: false },
      include: {
        _count: { select: { orders: true } },
        measurementProfiles: true,
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: customers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const activeOrders = await prisma.order.count({
      where: {
        userId: customerId,
        status: { notIn: ["DELIVERED", "CANCELLED"] },
      },
    });
    if (activeOrders > 0) {
      return res.status(400).json({
        success: false,
        message:
          "Customer has active orders in progress. Cancel or complete them before deleting.",
      });
    }

    await prisma.user.update({
      where: { id: customerId },
      data: {
        isDeleted: true,
        name: "Deleted Customer",
        phone: `DEL_${Date.now()}_${customerId.slice(0, 5)}`,
        email: null,
      },
    });
    res.json({ success: true, message: "Customer deleted safely" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create a New Category
exports.createCategory = async (req, res) => {
  try {
    const { name, genderType } = req.body;
    if (!name || !name.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Category name is required" });
    }

    const slug = name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_");

    const category = await prisma.category.create({
      data: {
        name: name.trim(),
        slug,
        genderType: genderType === "MEN" ? "MEN" : "WOMEN",
      },
    });

    res.status(201).json({ success: true, data: category });
  } catch (error) {
    if (error.code === "P2002") {
      return res
        .status(400)
        .json({ success: false, message: "This category already exists" });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete a Category
exports.deleteCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    await prisma.category.delete({ where: { id: categoryId } });
    res.json({ success: true, message: "Category deleted" });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to delete category" });
  }
};

// Update Stock Quantity for an Existing Product (Restock or Mark Out of Stock)
exports.updateProductStock = async (req, res) => {
  try {
    const { productId } = req.params;
    const qty = Math.max(0, parseInt(req.body.stockQuantity, 10) || 0);

    const updated = await prisma.product.update({
      where: { id: productId },
      data: {
        stockQuantity: qty,
        inStock: qty > 0,
      },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to update product stock" });
  }
};

// Get All Offline Walk-in Customers
exports.getOfflineCustomers = async (req, res) => {
  try {
    const records = await prisma.offlineCustomer.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: records });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create Offline Walk-in Customer Record
exports.createOfflineCustomer = async (req, res) => {
  try {
    const {
      name,
      phone,
      email,
      genderType,
      unit,
      measurements,
      specifications,
      totalAmount,
      advanceAmount,
    } = req.body;

    if (!name || !name.trim() || !phone || !phone.trim()) {
      return res.status(400).json({
        success: false,
        message: "Customer name and phone number are required.",
      });
    }

    const total = parseFloat(totalAmount) || 0;
    const advance = parseFloat(advanceAmount) || 0;
    const balance = Math.max(0, total - advance);

    const created = await prisma.offlineCustomer.create({
      data: {
        name: name.trim(),
        phone: phone.trim(),
        email: email?.trim() || null,
        genderType: genderType === "MEN" ? "MEN" : "WOMEN",
        unit: unit === "CM" ? "CM" : "INCHES",
        measurements: measurements || {},
        specifications: specifications?.trim() || "",
        totalAmount: total,
        advanceAmount: advance,
        balanceAmount: balance,
      },
    });

    res.status(201).json({ success: true, data: created });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update Existing Offline Customer Record (Measurements, Notes, or Advance/Balance Payments)
exports.updateOfflineCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      phone,
      email,
      genderType,
      unit,
      measurements,
      specifications,
      totalAmount,
      advanceAmount,
    } = req.body;

    const total = parseFloat(totalAmount) || 0;
    const advance = parseFloat(advanceAmount) || 0;
    const balance = Math.max(0, total - advance);

    const updated = await prisma.offlineCustomer.update({
      where: { id },
      data: {
        name: name.trim(),
        phone: phone.trim(),
        email: email?.trim() || null,
        genderType: genderType === "MEN" ? "MEN" : "WOMEN",
        unit: unit === "CM" ? "CM" : "INCHES",
        measurements: measurements || {},
        specifications: specifications?.trim() || "",
        totalAmount: total,
        advanceAmount: advance,
        balanceAmount: balance,
      },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update offline customer record.",
    });
  }
};

// Delete Offline Customer Record
exports.deleteOfflineCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.offlineCustomer.delete({ where: { id } });
    res.json({ success: true, message: "Offline customer record deleted." });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete offline customer record.",
    });
  }
};
// Create a New Body Measurement Field (Women or Men)
exports.createMeasurementField = async (req, res) => {
  try {
    const { label, genderType } = req.body;
    if (!label || !label.trim()) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Measurement field label is required.",
        });
    }

    const gender = genderType === "MEN" ? "MEN" : "WOMEN";
    const count = await prisma.measurementField.count({
      where: { genderType: gender },
    });

    const created = await prisma.measurementField.create({
      data: {
        label: label.trim(),
        genderType: gender,
        sortOrder: count + 1,
      },
    });

    res.status(201).json({ success: true, data: created });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(400).json({
        success: false,
        message:
          "This measurement field already exists for the selected template.",
      });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete a Body Measurement Field
exports.deleteMeasurementField = async (req, res) => {
  try {
    const { fieldId } = req.params;
    await prisma.measurementField.delete({ where: { id: fieldId } });
    res.json({ success: true, message: "Measurement field deleted." });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to delete measurement field." });
  }
};
