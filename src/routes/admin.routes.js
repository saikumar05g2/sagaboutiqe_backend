const router = require("express").Router();
const { authenticate, requireAdmin } = require("../middleware/auth.middleware");
const admin = require("../controllers/admin.controller");

router.use(authenticate, requireAdmin);
router.post("/categories", admin.createCategory);
router.delete("/categories/:categoryId", admin.deleteCategory);
router.post("/measurement-fields", admin.createMeasurementField);
router.delete("/measurement-fields/:fieldId", admin.deleteMeasurementField);
router.post("/products", admin.addStock);
router.patch("/products/:productId/stock", admin.updateProductStock);
router.get("/orders", admin.getAllOrders);
router.patch("/orders/:orderId/status", admin.updateOrderStatus);
router.post("/orders/:orderId/cancel", admin.cancelOrder);
router.get("/customers", admin.getCustomers);
router.delete("/customers/:customerId", admin.deleteCustomer);

// Offline Walk-in Customers Register
router.get("/offline-customers", admin.getOfflineCustomers);
router.post("/offline-customers", admin.createOfflineCustomer);
router.put("/offline-customers/:id", admin.updateOfflineCustomer);
router.delete("/offline-customers/:id", admin.deleteOfflineCustomer);

module.exports = router;
