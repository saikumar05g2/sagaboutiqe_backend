const prisma = require("../config/db");

// Fetch Logged-In User Profile & Saved Address
exports.getProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        addresses: {
          orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
        },
      },
    });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    res.json({ success: true, user });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to load profile." });
  }
};

// Update Logged-In User Profile & Delivery Address
exports.updateProfile = async (req, res) => {
  try {
    const { name, email } = req.body;

    if (!name || !name.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Full name is required." });
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        name: name.trim(),
        email: email ? email.trim() : null,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
      },
    });

    res.json({
      success: true,
      message: "Profile updated successfully.",
      user: updatedUser,
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to update profile." });
  }
};

exports.addAddress = async (req, res) => {
  try {
    const {
      label,
      recipientName,
      mobileNumber,
      flatNo,
      street,
      city,
      pincode,
      latitude,
      longitude,
      mapAddress,
      isDefault,
    } = req.body;

    if (
      !recipientName?.trim() ||
      !mobileNumber?.trim() ||
      !flatNo?.trim() ||
      !street?.trim() ||
      !city?.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "All required address fields must be filled.",
      });
    }

    if (!/^\d{10}$/.test(mobileNumber.trim())) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid 10-digit mobile number.",
      });
    }

    if (!/^\d{6}$/.test(pincode?.trim() || "")) {
      return res
        .status(400)
        .json({ success: false, message: "Enter a valid 6-digit pincode." });
    }

    const existingCount = await prisma.address.count({
      where: { userId: req.user.id },
    });
    const makeDefault = Boolean(isDefault) || existingCount === 0;

    if (makeDefault) {
      await prisma.address.updateMany({
        where: { userId: req.user.id },
        data: { isDefault: false },
      });
    }

    const address = await prisma.address.create({
      data: {
        userId: req.user.id,
        label: label?.trim() || "Home",
        recipientName: recipientName.trim(),
        mobileNumber: mobileNumber.trim(),
        flatNo: flatNo.trim(),
        street: street.trim(),
        city: city.trim(),
        pincode: pincode.trim(),
        latitude:
          latitude !== undefined && latitude !== null ? Number(latitude) : null,
        longitude:
          longitude !== undefined && longitude !== null
            ? Number(longitude)
            : null,
        mapAddress: mapAddress || null,
        isDefault: makeDefault,
      },
    });

    res.status(201).json({ success: true, message: "Address saved.", address });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to save address." });
  }
};

// PUT /api/users/addresses/:addressId (Edit an existing saved address)
exports.updateAddress = async (req, res) => {
  try {
    const { addressId } = req.params;
    const {
      label,
      recipientName,
      mobileNumber,
      flatNo,
      street,
      city,
      pincode,
      latitude,
      longitude,
      mapAddress,
      isDefault,
    } = req.body;

    const existing = await prisma.address.findFirst({
      where: { id: addressId, userId: req.user.id },
    });
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Address not found." });
    }

    if (mobileNumber && !/^\d{10}$/.test(mobileNumber.trim())) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid 10-digit mobile number.",
      });
    }

    if (pincode && !/^\d{6}$/.test(pincode.trim())) {
      return res
        .status(400)
        .json({ success: false, message: "Enter a valid 6-digit pincode." });
    }

    if (isDefault) {
      await prisma.address.updateMany({
        where: { userId: req.user.id },
        data: { isDefault: false },
      });
    }

    const address = await prisma.address.update({
      where: { id: addressId },
      data: {
        label: label?.trim() || existing.label,
        recipientName: recipientName?.trim() || existing.recipientName,
        mobileNumber: mobileNumber?.trim() || existing.mobileNumber,
        flatNo: flatNo?.trim() || existing.flatNo,
        street: street?.trim() || existing.street,
        city: city?.trim() || existing.city,
        pincode: pincode?.trim() || existing.pincode,
        latitude:
          latitude !== undefined
            ? latitude !== null
              ? Number(latitude)
              : null
            : existing.latitude,
        longitude:
          longitude !== undefined
            ? longitude !== null
              ? Number(longitude)
              : null
            : existing.longitude,
        mapAddress: mapAddress !== undefined ? mapAddress : existing.mapAddress,
        isDefault:
          isDefault !== undefined ? Boolean(isDefault) : existing.isDefault,
      },
    });

    res.json({ success: true, message: "Address updated.", address });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to update address." });
  }
};

// DELETE /api/users/addresses/:addressId (Delete a saved address)
exports.deleteAddress = async (req, res) => {
  try {
    const { addressId } = req.params;
    const existing = await prisma.address.findFirst({
      where: { id: addressId, userId: req.user.id },
    });

    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Address not found." });
    }

    await prisma.address.delete({ where: { id: addressId } });
    res.json({ success: true, message: "Address deleted." });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to delete address." });
  }
};
