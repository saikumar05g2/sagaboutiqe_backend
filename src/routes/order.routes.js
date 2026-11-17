const router = require("express").Router();
const { authenticate } = require("../middleware/auth.middleware");
const ctrl = require("../controllers/order.controller");

router.get("/products", ctrl.getPublicProducts);
router.get("/categories", ctrl.getCategories);
router.get("/measurement-fields", ctrl.getMeasurementFields);
router.post("/measurements", authenticate, ctrl.saveMeasurementProfile);
router.get("/measurements", authenticate, ctrl.getMyMeasurements);
router.post("/checkout", authenticate, ctrl.createCheckoutOrder);
router.post("/verify-payment", authenticate, ctrl.verifyPayment);
router.get("/my-orders", authenticate, ctrl.getMyOrders);
module.exports = router;
