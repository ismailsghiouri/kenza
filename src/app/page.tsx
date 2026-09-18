import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { conversations, customers, messages, orders } from "@/db/schema";

export const dynamic = "force-dynamic";

async function getRecentMessages() {
  return db
    .select({
      id: messages.id,
      phone: customers.telephone,
      content: messages.content,
      role: messages.role,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .innerJoin(customers, eq(conversations.clientId, customers.clientId))
    .orderBy(desc(messages.createdAt))
    .limit(20);
}

async function getRecentOrders() {
  return db
    .select({
      commandeId: orders.commandeId,
      customerName: customers.nom,
      totalMad: orders.totalMad,
      statut: orders.statut,
      date: orders.date,
    })
    .from(orders)
    .innerJoin(customers, eq(orders.clientId, customers.clientId))
    .orderBy(desc(orders.date))
    .limit(10);
}

async function getStats() {
  const [messageCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages);
  const [orderCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders);
  const [todayRevenue] = await db
    .select({ total: sql<number>`coalesce(sum(${orders.totalMad}), 0)::int` })
    .from(orders)
    .where(sql`${orders.date} = current_date`);

  return {
    totalMessages: messageCount?.count ?? 0,
    totalOrders: orderCount?.count ?? 0,
    todayRevenue: todayRevenue?.total ?? 0,
  };
}

const statutStyles: Record<string, string> = {
  "en préparation": "bg-amber-100 text-amber-800",
  livrée: "bg-green-100 text-green-800",
  annulée: "bg-red-100 text-red-800",
  retournée: "bg-orange-100 text-orange-800",
  "panier abandonné": "bg-gray-100 text-gray-600",
};

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("fr-MA", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("fr-MA", { dateStyle: "medium" }).format(value);
}

function formatMad(value: number) {
  return new Intl.NumberFormat("fr-MA", { maximumFractionDigits: 0 }).format(value) + " MAD";
}

export default async function HomePage() {
  const [recentMessages, recentOrders, stats] = await Promise.all([
    getRecentMessages(),
    getRecentOrders(),
    getStats(),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          Kenza Dashboard
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Vue d&apos;ensemble des messages WhatsApp et des commandes.
        </p>
      </header>

      {/* Statistiques */}
      <section aria-labelledby="stats-heading" className="mb-10">
        <h2 id="stats-heading" className="mb-3 text-lg font-semibold text-gray-900">
          Statistiques
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Messages totaux</p>
            <p className="mt-2 text-3xl font-semibold text-gray-900">{stats.totalMessages}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Commandes totales</p>
            <p className="mt-2 text-3xl font-semibold text-gray-900">{stats.totalOrders}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Revenu du jour</p>
            <p className="mt-2 text-3xl font-semibold text-gray-900">
              {formatMad(stats.todayRevenue)}
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
        {/* Messages */}
        <section aria-labelledby="messages-heading">
          <h2 id="messages-heading" className="mb-3 text-lg font-semibold text-gray-900">
            Messages
          </h2>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-gray-500">
                    Téléphone
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-gray-500">
                    Message
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-gray-500">
                    Rôle
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-gray-500">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentMessages.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                      Aucun message pour le moment.
                    </td>
                  </tr>
                ) : (
                  recentMessages.map((message) => (
                    <tr key={message.id}>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                        {message.phone}
                      </td>
                      <td className="max-w-xs truncate px-4 py-3 text-gray-700">
                        {message.content}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                        {message.role}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                        {formatDateTime(message.createdAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Commandes */}
        <section aria-labelledby="orders-heading">
          <h2 id="orders-heading" className="mb-3 text-lg font-semibold text-gray-900">
            Commandes
          </h2>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-gray-500">
                    Client
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-gray-500">
                    Total
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-gray-500">
                    Statut
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-gray-500">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentOrders.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                      Aucune commande pour le moment.
                    </td>
                  </tr>
                ) : (
                  recentOrders.map((order) => (
                    <tr key={order.commandeId}>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                        {order.customerName}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                        {formatMad(order.totalMad)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                            statutStyles[order.statut] ?? "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {order.statut}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                        {formatDate(order.date)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
