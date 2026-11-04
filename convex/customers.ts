import { ConvexError, v } from "convex/values";
import {
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { getCurrentUser, requireCustomer } from "./lib/auth";

const addressFields = {
  name: v.string(),
  phone: v.string(),
  street: v.string(),
  area: v.string(),
  city: v.string(),
  pincode: v.string(),
};

function validateAddress(address: {
  name: string;
  phone: string;
  street: string;
  area: string;
  city: string;
  pincode: string;
}) {
  if (
    address.name.trim().length < 1 ||
    address.name.trim().length > 100 ||
    !/^\+[1-9]\d{7,14}$/.test(address.phone) ||
    address.street.trim().length < 3 ||
    address.street.trim().length > 200 ||
    address.area.trim().length < 2 ||
    address.area.trim().length > 100 ||
    address.city.trim().length < 2 ||
    address.city.trim().length > 100 ||
    !/^\d{4,10}$/.test(address.pincode)
  ) {
    throw new ConvexError({
      message: "Enter valid delivery address details.",
      code: "BAD_REQUEST",
    });
  }
}

export const getCurrentCustomerId = internalQuery({
  args: {},
  returns: v.union(v.id("users"), v.null()),
  handler: async (ctx) => {
    const customer = await getCurrentUser(ctx);
    if (
      !customer ||
      customer.role !== "CUSTOMER" ||
      !customer.phone ||
      customer.isActive === false
    ) {
      return null;
    }
    return customer._id;
  },
});

export const getProfile = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("users"),
      name: v.union(v.string(), v.null()),
      phone: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (
      !user ||
      user.role !== "CUSTOMER" ||
      !user.phone ||
      user.isActive === false
    ) {
      return null;
    }
    return { _id: user._id, name: user.name ?? null, phone: user.phone };
  },
});

export const updateProfile = mutation({
  args: { name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const customer = await requireCustomer(ctx);
    const name = args.name.trim();
    if (name.length < 1 || name.length > 100) {
      throw new ConvexError({
        message: "Name must be between 1 and 100 characters.",
        code: "BAD_REQUEST",
      });
    }
    await ctx.db.patch("users", customer._id, { name });
    return null;
  },
});

export const listAddresses = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("deliveryAddresses"),
      _creationTime: v.number(),
      ...addressFields,
      createdAt: v.string(),
      updatedAt: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const customer = await requireCustomer(ctx);
    return await ctx.db
      .query("deliveryAddresses")
      .withIndex("by_user", (q) => q.eq("userId", customer._id))
      .order("desc")
      .take(50);
  },
});

export const addAddress = mutation({
  args: addressFields,
  returns: v.id("deliveryAddresses"),
  handler: async (ctx, args) => {
    const customer = await requireCustomer(ctx);
    validateAddress(args);
    const now = new Date().toISOString();
    return await ctx.db.insert("deliveryAddresses", {
      userId: customer._id,
      name: args.name.trim(),
      phone: args.phone.trim(),
      street: args.street.trim(),
      area: args.area.trim(),
      city: args.city.trim(),
      pincode: args.pincode.trim(),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateAddress = mutation({
  args: {
    addressId: v.id("deliveryAddresses"),
    ...addressFields,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const customer = await requireCustomer(ctx);
    const address = await ctx.db.get("deliveryAddresses", args.addressId);
    if (!address || address.userId !== customer._id) {
      throw new ConvexError({
        message: "Delivery address not found.",
        code: "NOT_FOUND",
      });
    }
    validateAddress(args);
    const { addressId, ...fields } = args;
    await ctx.db.patch("deliveryAddresses", addressId, {
      name: fields.name.trim(),
      phone: fields.phone.trim(),
      street: fields.street.trim(),
      area: fields.area.trim(),
      city: fields.city.trim(),
      pincode: fields.pincode.trim(),
      updatedAt: new Date().toISOString(),
    });
    return null;
  },
});

export const deleteAddress = mutation({
  args: { addressId: v.id("deliveryAddresses") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const customer = await requireCustomer(ctx);
    const address = await ctx.db.get("deliveryAddresses", args.addressId);
    if (!address || address.userId !== customer._id) {
      throw new ConvexError({
        message: "Delivery address not found.",
        code: "NOT_FOUND",
      });
    }
    await ctx.db.delete("deliveryAddresses", args.addressId);
    return null;
  },
});
