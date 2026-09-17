import { pgTable, uuid, text, timestamp, integer, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
]);

export const messageRoleEnum = pgEnum("message_role", ["user", "assistant"]);

export const productCategoryEnum = pgEnum("product_category", [
  "phone",
  "tablet",
  "laptop",
  "accessory",
]);

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  phone: text("phone").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const InsertCustomerSchema = createInsertSchema(customers);
export const SelectCustomerSchema = createSelectSchema(customers);

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  category: productCategoryEnum("category").notNull(),
  priceCents: integer("price_cents").notNull(),
  stock: integer("stock").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const InsertProductSchema = createInsertSchema(products);
export const SelectProductSchema = createSelectSchema(products);

export const discounts = pgTable("discounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  description: text("description"),
  percent: integer("percent").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const InsertDiscountSchema = createInsertSchema(discounts);
export const SelectDiscountSchema = createSelectSchema(discounts);

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id),
  status: orderStatusEnum("status").notNull().default("pending"),
  totalCents: integer("total_cents").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const InsertOrderSchema = createInsertSchema(orders);
export const SelectOrderSchema = createSelectSchema(orders);

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id),
  quantity: integer("quantity").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
});

export const InsertOrderItemSchema = createInsertSchema(orderItems);
export const SelectOrderItemSchema = createSelectSchema(orderItems);

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const InsertConversationSchema = createInsertSchema(conversations);
export const SelectConversationSchema = createSelectSchema(conversations);

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id),
  role: messageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const InsertMessageSchema = createInsertSchema(messages);
export const SelectMessageSchema = createSelectSchema(messages);
