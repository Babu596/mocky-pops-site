const ADMIN_API_BASE_URL = "http://127.0.0.1:8000/api";
const ADMIN_TOKEN_KEY = "mocky-pops-admin-token";

const adminState = {
  user: null,
  dashboard: null,
  products: [],
  categories: [],
  orders: []
};

const statusOptions = [
  ["pending", "Pending"],
  ["confirmed", "Confirmed"],
  ["preparing", "Preparing"],
  ["ready", "Ready"],
  ["out_for_delivery", "Out for delivery"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"]
];

const statusLabels = {
  placed: "Pending",
  accepted: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  delivered: "Completed",
  cancelled: "Cancelled"
};

function getAdminPage() {
  return document.body.dataset.page || "";
}

function getToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

function setToken(token) {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

function formatAdminPrice(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function showAdminMessage(message, isError = false) {
  document.querySelectorAll("[data-admin-message], [data-admin-login-message]").forEach((element) => {
    element.textContent = message || "";
    element.classList.toggle("error", isError);
  });
}

async function adminRequest(path, options = {}) {
  const headers = {
    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers || {})
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${ADMIN_API_BASE_URL}${path}`, {
    ...options,
    headers
  });

  if (response.status === 401 || response.status === 403) {
    clearToken();
    if (getAdminPage() === "admin") window.location.href = "admin-login.html";
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.detail || "Admin request failed");
  }

  if (response.status === 204) return null;
  return response.json();
}

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function customizationsFromText(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, optionsText = ""] = line.split(":");
      return {
        label: label.trim(),
        options: optionsText.split(",").map((option) => option.trim()).filter(Boolean)
      };
    })
    .filter((item) => item.label && item.options.length);
}

function customizationsToText(customizations = []) {
  return customizations
    .map((item) => `${item.label}: ${(item.options || []).join(", ")}`)
    .join("\n");
}

async function verifyAdminSession() {
  const token = getToken();
  if (!token) {
    window.location.href = "admin-login.html";
    return;
  }

  const user = await adminRequest("/auth/me");
  if (user.role !== "admin") {
    clearToken();
    window.location.href = "admin-login.html";
    return;
  }

  adminState.user = user;
  const userElement = document.querySelector("[data-admin-user]");
  if (userElement) userElement.textContent = `Signed in as ${user.name}`;
}

async function handleAdminLogin() {
  const form = document.querySelector("[data-admin-login-form]");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showAdminMessage("Checking credentials...");

    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      const token = await adminRequest("/auth/login", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setToken(token.access_token);
      const user = await adminRequest("/auth/me");
      if (user.role !== "admin") {
        clearToken();
        showAdminMessage("This account is not an admin.", true);
        return;
      }
      window.location.href = "admin.html";
    } catch (error) {
      showAdminMessage(error.message, true);
    }
  });
}

function dashboardMetric(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function renderSalesChart(points) {
  const chart = document.querySelector("[data-sales-chart]");
  if (!chart) return;

  const maxRevenue = Math.max(...points.map((point) => point.revenue), 1);
  chart.innerHTML = points
    .map((point) => {
      const height = Math.max(8, Math.round((point.revenue / maxRevenue) * 100));
      const day = new Date(point.date).toLocaleDateString("en-IN", { weekday: "short" });
      return `
        <div class="admin-chart-bar">
          <span style="height: ${height}%"></span>
          <small>${day}</small>
          <em>${formatAdminPrice(point.revenue)}</em>
        </div>
      `;
    })
    .join("");
}

function renderPopularProducts(products) {
  const container = document.querySelector("[data-popular-products]");
  if (!container) return;

  container.innerHTML = products.length
    ? products
        .map(
          (product) => `
            <article class="admin-list-row">
              <div>
                <strong>${product.name}</strong>
                <span>${product.units_sold} units sold</span>
              </div>
              <b>${formatAdminPrice(product.revenue)}</b>
            </article>
          `
        )
        .join("")
    : '<p class="admin-empty">No completed product sales yet.</p>';
}

function renderProductsTable() {
  const body = document.querySelector("[data-products-table]");
  if (!body) return;

  body.innerHTML = adminState.products.length
    ? adminState.products
        .map(
          (product) => `
            <tr>
              <td>
                <div class="admin-product-cell">
                  <img src="${product.image || ""}" alt="${product.name}" />
                  <span>${product.name}</span>
                </div>
              </td>
              <td>${product.category}</td>
              <td>${formatAdminPrice(product.price)}</td>
              <td><span class="admin-pill ${product.is_available ? "ok" : "muted"}">${product.is_available ? "In stock" : "Hidden"}</span></td>
              <td>
                <div class="admin-row-actions">
                  <button type="button" data-edit-product="${product.db_id}">Edit</button>
                  <button type="button" data-delete-product="${product.db_id}">Delete</button>
                </div>
              </td>
            </tr>
          `
        )
        .join("")
    : '<tr><td colspan="5">No products found.</td></tr>';
}

function renderCategoryOptions() {
  const select = document.querySelector("[data-category-options]");
  if (!select) return;

  select.innerHTML = adminState.categories
    .map((category) => `<option value="${category.slug}">${category.name}</option>`)
    .join("");
}

function renderCategories() {
  const container = document.querySelector("[data-categories-list]");
  if (!container) return;

  container.innerHTML = adminState.categories.length
    ? adminState.categories
        .map(
          (category) => `
            <article class="admin-list-row">
              <div>
                <strong>${category.name}</strong>
                <span>${category.slug}</span>
              </div>
              <div class="admin-row-actions">
                <button type="button" data-edit-category="${category.id}">Edit</button>
                <span class="admin-pill ${category.is_active ? "ok" : "muted"}">${category.is_active ? "Active" : "Inactive"}</span>
              </div>
            </article>
          `
        )
        .join("")
    : '<p class="admin-empty">No categories yet.</p>';
}

function renderOrders() {
  const container = document.querySelector("[data-orders-list]");
  if (!container) return;

  container.innerHTML = adminState.orders.length
    ? adminState.orders
        .map((order) => {
          const status = statusLabels[order.status] || order.status;
          const items = order.items.map((item) => `${item.quantity} x ${item.product_name}`).join(", ");
          return `
            <article class="admin-order-card">
              <header>
                <div>
                  <span>${order.id}</span>
                  <strong>${order.address.customer_name}</strong>
                </div>
                <b>${formatAdminPrice(order.total)}</b>
              </header>
              <div class="admin-order-meta">
                <span>${new Date(order.created_at).toLocaleString("en-IN")}</span>
                <span>${order.address.phone}</span>
                <span>${status}</span>
              </div>
              <p>${order.address.address_line}</p>
              <small>${items}</small>
              <select data-order-status="${order.id}" aria-label="Status for ${order.id}">
                ${statusOptions
                  .map(([value, label]) => `<option value="${value}" ${label === status ? "selected" : ""}>${label}</option>`)
                  .join("")}
              </select>
            </article>
          `;
        })
        .join("")
    : '<p class="admin-empty">No orders yet.</p>';
}

function fillProductForm(product) {
  const form = document.querySelector("[data-product-form]");
  if (!form || !product) return;

  form.db_id.value = product.db_id;
  form.name.value = product.name;
  form.slug.value = product.id;
  form.category_slug.value = product.category;
  form.price.value = product.price;
  form.rating.value = product.rating || 4.5;
  form.image_url.value = product.image || "";
  form.ingredients.value = (product.ingredients || []).join(", ");
  form.customizations.value = customizationsToText(product.customizations || []);
  form.description.value = product.description;
  form.is_available.checked = Boolean(product.is_available);
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetProductForm() {
  const form = document.querySelector("[data-product-form]");
  if (!form) return;
  form.reset();
  form.db_id.value = "";
  form.is_available.checked = true;
  form.rating.value = 4.5;
}

function fillCategoryForm(category) {
  const form = document.querySelector("[data-category-form]");
  if (!form || !category) return;
  form.id.value = category.id;
  form.name.value = category.name;
  form.slug.value = category.slug;
  form.is_active.checked = Boolean(category.is_active);
}

function resetCategoryForm() {
  const form = document.querySelector("[data-category-form]");
  if (!form) return;
  form.reset();
  form.id.value = "";
  form.is_active.checked = true;
}

async function uploadImageIfSelected(form) {
  const fileInput = form.querySelector("[data-product-image]");
  if (!fileInput || !fileInput.files.length) return form.image_url.value;

  const data = new FormData();
  data.append("file", fileInput.files[0]);
  const upload = await adminRequest("/admin/uploads", {
    method: "POST",
    body: data
  });
  return `${ADMIN_API_BASE_URL.replace("/api", "")}${upload.image_url}`;
}

function bindAdminActions() {
  document.querySelector("[data-admin-logout]")?.addEventListener("click", () => {
    clearToken();
    window.location.href = "admin-login.html";
  });

  document.querySelector("[data-refresh-admin]")?.addEventListener("click", () => loadAdminData());
  document.querySelector("[data-generate-marketing]")?.addEventListener("click", () => loadMarketingIdeas());
  document.querySelector("[data-outlet-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await adminRequest("/business/outlets", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(form).entries()))
      });
      form.reset();
      await loadPhase4Admin();
      showAdminMessage("Outlet added.");
    } catch (error) {
      showAdminMessage(error.message, true);
    }
  });

  document.querySelector("[data-franchise-applications]")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-franchise-action]");
    if (!button) return;
    try {
      await adminRequest(`/business/franchise/applications/${button.dataset.franchiseId}/decision`, {
        method: "PATCH",
        body: JSON.stringify({ status: button.dataset.franchiseDecision, owner_password: "password123" })
      });
      await loadPhase4Admin();
      showAdminMessage("Franchise application updated.");
    } catch (error) {
      showAdminMessage(error.message, true);
    }
  });

  const productForm = document.querySelector("[data-product-form]");
  productForm?.name.addEventListener("input", () => {
    if (!productForm.db_id.value) productForm.slug.value = slugify(productForm.name.value);
  });
  productForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    showAdminMessage("Saving product...");

    try {
      const imageUrl = await uploadImageIfSelected(productForm);
      const payload = {
        slug: productForm.slug.value,
        name: productForm.name.value,
        description: productForm.description.value,
        price: Number(productForm.price.value),
        category_slug: productForm.category_slug.value,
        image_url: imageUrl || null,
        rating: Number(productForm.rating.value || 4.5),
        ingredients: productForm.ingredients.value.split(",").map((item) => item.trim()).filter(Boolean),
        customizations: customizationsFromText(productForm.customizations.value),
        is_available: productForm.is_available.checked
      };

      const id = productForm.db_id.value;
      await adminRequest(id ? `/admin/products/${id}` : "/admin/products", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(payload)
      });
      resetProductForm();
      await loadAdminData();
      showAdminMessage("Product saved.");
    } catch (error) {
      showAdminMessage(error.message, true);
    }
  });

  document.querySelector("[data-reset-product-form]")?.addEventListener("click", resetProductForm);
  document.querySelector("[data-remove-product-image]")?.addEventListener("click", () => {
    if (productForm) productForm.image_url.value = "";
  });

  document.querySelector("[data-products-table]")?.addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-product]");
    const deleteButton = event.target.closest("[data-delete-product]");

    if (editButton) {
      const product = adminState.products.find((item) => item.db_id === Number(editButton.dataset.editProduct));
      fillProductForm(product);
    }

    if (deleteButton) {
      const id = Number(deleteButton.dataset.deleteProduct);
      const product = adminState.products.find((item) => item.db_id === id);
      if (!window.confirm(`Delete ${product?.name || "this product"}?`)) return;
      await adminRequest(`/admin/products/${id}`, { method: "DELETE" });
      await loadAdminData();
      showAdminMessage("Product deleted.");
    }
  });

  const categoryForm = document.querySelector("[data-category-form]");
  categoryForm?.name.addEventListener("input", () => {
    if (!categoryForm.id.value) categoryForm.slug.value = slugify(categoryForm.name.value);
  });
  categoryForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    showAdminMessage("Saving category...");

    try {
      const payload = {
        name: categoryForm.name.value,
        slug: categoryForm.slug.value,
        is_active: categoryForm.is_active.checked
      };
      const id = categoryForm.id.value;
      await adminRequest(id ? `/admin/categories/${id}` : "/admin/categories", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(payload)
      });
      resetCategoryForm();
      await loadAdminData();
      showAdminMessage("Category saved.");
    } catch (error) {
      showAdminMessage(error.message, true);
    }
  });

  document.querySelector("[data-reset-category-form]")?.addEventListener("click", resetCategoryForm);

  document.querySelector("[data-categories-list]")?.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-category]");
    if (!editButton) return;
    const category = adminState.categories.find((item) => item.id === Number(editButton.dataset.editCategory));
    fillCategoryForm(category);
  });

  document.querySelector("[data-orders-list]")?.addEventListener("change", async (event) => {
    const select = event.target.closest("[data-order-status]");
    if (!select) return;

    try {
      await adminRequest(`/admin/orders/${select.dataset.orderStatus}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: select.value })
      });
      await loadAdminData();
      showAdminMessage("Order status updated.");
    } catch (error) {
      showAdminMessage(error.message, true);
    }
  });

  document.querySelector("[data-site-settings-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await adminRequest("/site/settings", {
        method: "PUT",
        body: JSON.stringify({
          franchise_amount: Number(form.franchise_amount.value),
          instagram_url: form.instagram_url.value,
          facebook_url: form.facebook_url.value,
          whatsapp_number: form.whatsapp_number.value,
          support_email: form.support_email.value,
          brand_description: form.brand_description.value
        })
      });
      showAdminMessage("Brand settings saved.");
      await loadSiteSettingsAdmin();
    } catch (error) {
      showAdminMessage(error.message, true);
    }
  });
}

async function loadAdminData() {
  showAdminMessage("Loading dashboard...");
  const [dashboard, categories, orders] = await Promise.all([
    adminRequest("/admin/dashboard"),
    adminRequest("/admin/categories"),
    adminRequest("/admin/orders")
  ]);

  adminState.dashboard = dashboard;
  adminState.products = dashboard.products || [];
  adminState.categories = categories || [];
  adminState.orders = orders || [];

  dashboardMetric("[data-total-orders]", dashboard.total_orders);
  dashboardMetric("[data-todays-sales]", formatAdminPrice(dashboard.todays_sales));
  dashboardMetric("[data-total-revenue]", formatAdminPrice(dashboard.total_revenue));
  dashboardMetric("[data-total-customers]", dashboard.total_customers);
  renderSalesChart(dashboard.sales_analytics || []);
  renderPopularProducts(dashboard.popular_products || []);
  renderCategoryOptions();
  renderProductsTable();
  renderOrders();
  renderCategories();
  showAdminMessage("");
  await loadAdminAi();
  await loadPhase4Admin();
  await loadSiteSettingsAdmin();
}

async function loadSiteSettingsAdmin() {
  const form = document.querySelector("[data-site-settings-form]");
  if (!form) return;
  try {
    const settings = await adminRequest("/site/settings");
    form.franchise_amount.value = settings.franchise_amount;
    form.instagram_url.value = settings.instagram_url;
    form.facebook_url.value = settings.facebook_url;
    form.whatsapp_number.value = settings.whatsapp_number;
    form.support_email.value = settings.support_email;
    form.brand_description.value = settings.brand_description;
  } catch (error) {
    showAdminMessage(error.message, true);
  }
}

async function loadAdminAi() {
  try {
    const [business, inventory] = await Promise.all([
      adminRequest("/ai/business-assistant"),
      adminRequest("/ai/inventory")
    ]);
    renderBusinessAi(business);
    renderInventoryAi(inventory);
  } catch (error) {
    const businessContainer = document.querySelector("[data-ai-business]");
    if (businessContainer) businessContainer.innerHTML = `<p class="admin-empty">${error.message}</p>`;
  }
}

function renderBusinessAi(data) {
  const container = document.querySelector("[data-ai-business]");
  if (!container) return;
  container.innerHTML = `
    <article class="admin-list-row"><div><strong>Daily sales</strong><span>${formatAdminPrice(data.daily_sales)}</span></div></article>
    <article class="admin-list-row"><div><strong>Weekly sales</strong><span>${formatAdminPrice(data.weekly_sales)}</span></div></article>
    <article class="admin-list-row"><div><strong>Monthly revenue</strong><span>${formatAdminPrice(data.monthly_revenue)}</span></div></article>
    ${data.insights
      .map((insight) => `<article class="admin-list-row"><div><strong>${insight.title}</strong><span>${insight.detail}</span></div><b>${insight.priority}</b></article>`)
      .join("")}
  `;
}

function renderInventoryAi(data) {
  const container = document.querySelector("[data-ai-inventory]");
  if (!container) return;
  container.innerHTML = data.predictions.length
    ? data.predictions
        .slice(0, 8)
        .map(
          (item) => `
            <article class="admin-list-row">
              <div>
                <strong>${item.ingredient}</strong>
                <span>Stock ${item.current_stock} / 7-day use ${item.predicted_7_day_usage}</span>
              </div>
              <b>${item.alert}</b>
            </article>
          `
        )
        .join("")
    : '<p class="admin-empty">No inventory signals yet.</p>';
}

async function loadMarketingIdeas() {
  const container = document.querySelector("[data-ai-marketing]");
  if (!container) return;
  container.innerHTML = '<p class="admin-empty">Generating campaign ideas...</p>';
  try {
    const data = await adminRequest("/ai/marketing", {
      method: "POST",
      body: JSON.stringify({ goal: "increase repeat orders", channel: "Instagram" })
    });
    container.innerHTML = data.ideas
      .map(
        (idea) => `
          <article class="admin-list-row">
            <div>
              <strong>${idea.title}</strong>
              <span>${idea.segment} | ${idea.offer}</span>
              <span>${idea.caption}</span>
            </div>
            <b>${idea.channel}</b>
          </article>
        `
      )
      .join("");
  } catch (error) {
    container.innerHTML = `<p class="admin-empty">${error.message}</p>`;
  }
}

async function loadPhase4Admin() {
  const appContainer = document.querySelector("[data-franchise-applications]");
  if (!appContainer) return;
  try {
    const [applications, outlets, bulkOrders, reports] = await Promise.all([
      adminRequest("/business/franchise/applications"),
      adminRequest("/business/outlets"),
      adminRequest("/business/bulk-orders"),
      adminRequest("/business/reports/admin")
    ]);
    renderFranchiseApplications(applications);
    renderOutlets(outlets);
    renderBulkOrders(bulkOrders);
    renderPhase4Reports(reports);
  } catch (error) {
    appContainer.innerHTML = `<p class="admin-empty">${error.message}</p>`;
  }
}

function renderFranchiseApplications(applications) {
  const container = document.querySelector("[data-franchise-applications]");
  if (!container) return;
  container.innerHTML = applications.length
    ? applications
        .map(
          (item) => `
            <article class="admin-list-row">
              <div>
                <strong>${item.applicant_name}</strong>
                <span>${item.location} | ${item.email}</span>
                <span>${item.status}${item.franchise_code ? ` | ${item.franchise_code}` : ""}</span>
              </div>
              <div class="admin-row-actions">
                <button type="button" data-franchise-id="${item.id}" data-franchise-decision="approved" data-franchise-action>Approve</button>
                <button type="button" data-franchise-id="${item.id}" data-franchise-decision="rejected" data-franchise-action>Reject</button>
              </div>
            </article>
          `
        )
        .join("")
    : '<p class="admin-empty">No franchise applications yet.</p>';
}

function renderOutlets(outlets) {
  const container = document.querySelector("[data-outlets-list]");
  if (!container) return;
  container.innerHTML = outlets.length
    ? outlets
        .map((outlet) => `<article class="admin-list-row"><div><strong>${outlet.name}</strong><span>${outlet.address}</span><span>${outlet.manager || "No manager"} | ${outlet.status}</span></div></article>`)
        .join("")
    : '<p class="admin-empty">No outlets yet.</p>';
}

function renderBulkOrders(orders) {
  const container = document.querySelector("[data-bulk-orders]");
  if (!container) return;
  container.innerHTML = orders.length
    ? orders
        .map((order) => `<article class="admin-list-row"><div><strong>${order.event_type}</strong><span>${order.customer_name} | ${order.guest_count} guests</span><span>${order.status} ${order.quoted_amount ? `| ${formatAdminPrice(order.quoted_amount)}` : ""}</span></div></article>`)
        .join("")
    : '<p class="admin-empty">No bulk enquiries yet.</p>';
}

function renderPhase4Reports(reports) {
  const container = document.querySelector("[data-phase4-reports]");
  if (!container) return;
  container.innerHTML = Object.entries(reports)
    .map(([key, value]) => `<article class="admin-list-row"><div><strong>${key.replaceAll("_", " ")}</strong><span>${value}</span></div></article>`)
    .join("");
}

async function initAdmin() {
  if (getAdminPage() === "admin-login") {
    handleAdminLogin();
    return;
  }

  if (getAdminPage() === "admin") {
    try {
      await verifyAdminSession();
      bindAdminActions();
      await loadAdminData();
    } catch (error) {
      showAdminMessage(error.message, true);
    }
  }
}

initAdmin();
