const express = require("express");
const { authenticate } = require("../middleware/auth.middleware");
const userController = require("../controllers/user.controller");

const router = express.Router();

router.get("/profile", authenticate, userController.getProfile);
router.put("/profile", authenticate, userController.updateProfile);
router.post("/addresses", authenticate, userController.addAddress);
router.put("/addresses/:addressId", authenticate, userController.updateAddress);
router.delete(
  "/addresses/:addressId",
  authenticate,
  userController.deleteAddress,
);

module.exports = router;
