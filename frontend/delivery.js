const DELIVERY_API_BASE_URL = "http://127.0.0.1:8000/api";
const DELIVERY_TOKEN_KEY = "mocky-pops-customer-token";

function deliveryToken() {
  return localStorage.getItem(DELIVERY_TOKEN_KEY);
}

async function deliveryRequest(path, options = {}) {
  const response = await fetch(`${DELIVERY_API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(deliveryToken() ? { Authorization: `Bearer ${deliveryToken()}` } : {}),
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.detail || "Delivery request failed");
  }
  return response.json();
}

function deliveryPrice(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function deliveryOrderCard(order, active = true) {
  return `
    <article class="admin-order-card">
      <header>
        <div><span>${order.id}</span><strong>${order.address.customer_name}</strong></div>
        <b>${deliveryPrice(order.total)}</b>
      </header>
      <div class="admin-order-meta">
        <span>${order.address.phone}</span>
        <span>${order.status.replaceAll("_", " ")}</span>
      </div>
      <p>${order.address.address_line}</p>
      <small>${order.items.map((item) => `${item.quantity} x ${item.product_name}`).join(", ")}</small>
      ${
        active
          ? `<select data-delivery-status="${order.id}">
              <option value="out_for_delivery">Out for delivery</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>`
          : ""
      }
    </article>
  `;
}

async function loadDelivery() {
  const orders = document.querySelector("[data-delivery-orders]");
  const history = document.querySelector("[data-delivery-history]");
  if (!orders || !history) return;

  try {
    const data = await deliveryRequest("/delivery/orders");
    orders.innerHTML = data.assigned_orders.length
      ? data.assigned_orders.map((order) => deliveryOrderCard(order, true)).join("")
      : '<div class="empty-state">No assigned delivery orders right now.</div>';
    history.innerHTML = data.delivery_history.length
      ? data.delivery_history.map((order) => deliveryOrderCard(order, false)).join("")
      : '<div class="empty-state">No delivery history yet.</div>';
  } catch (error) {
    orders.innerHTML = `<div class="empty-state">${error.message}</div>`;
  }
}

document.querySelector("[data-delivery-orders]")?.addEventListener("change", async (event) => {
  const select = event.target.closest("[data-delivery-status]");
  if (!select) return;
  await deliveryRequest(`/delivery/orders/${select.dataset.deliveryStatus}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status: select.value })
  });
  loadDelivery();
});

loadDelivery();
