const CUSTOMER_API_BASE_URL = "http://127.0.0.1:8000/api";
const CUSTOMER_TOKEN_KEY = "mocky-pops-customer-token";

function customerPage() {
  return document.body.dataset.page || "";
}

function customerToken() {
  return localStorage.getItem(CUSTOMER_TOKEN_KEY);
}

function setCustomerToken(token) {
  localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
}

function clearCustomerToken() {
  localStorage.removeItem(CUSTOMER_TOKEN_KEY);
}

function customerMessage(message, isError = false) {
  document.querySelectorAll("[data-customer-message]").forEach((element) => {
    element.textContent = message || "";
    element.classList.toggle("error", isError);
  });
}

async function customerRequest(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  const token = customerToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${CUSTOMER_API_BASE_URL}${path}`, {
    ...options,
    headers
  });

  if (response.status === 401 || response.status === 403) {
    clearCustomerToken();
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.detail || "Request failed");
  }

  if (response.status === 204) return null;
  return response.json();
}

function requireCustomerLogin() {
  if (!customerToken()) {
    window.location.href = "login.html";
    return false;
  }
  return true;
}

function bindCustomerLogout() {
  document.querySelectorAll("[data-customer-logout]").forEach((button) => {
    button.addEventListener("click", () => {
      clearCustomerToken();
      window.location.href = "login.html";
    });
  });
}

function bindLogin() {
  const form = document.querySelector("[data-login-form]");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    customerMessage("Logging in...");
    try {
      const token = await customerRequest("/auth/login", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(form).entries()))
      });
      setCustomerToken(token.access_token);
      const user = await customerRequest("/auth/me");
      if (user.role === "admin") {
        window.location.href = "admin.html";
        return;
      }
      if (user.role === "delivery_partner") {
        window.location.href = "delivery.html";
        return;
      }
      window.location.href = "profile.html";
    } catch (error) {
      customerMessage(error.message, true);
    }
  });
}

function bindRegister() {
  const form = document.querySelector("[data-register-form]");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    customerMessage("Creating account...");
    try {
      const payload = Object.fromEntries(new FormData(form).entries());
      await customerRequest("/auth/register", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      const token = await customerRequest("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: payload.email, password: payload.password })
      });
      setCustomerToken(token.access_token);
      window.location.href = "profile.html";
    } catch (error) {
      customerMessage(error.message, true);
    }
  });
}

async function loadProfile() {
  if (!requireCustomerLogin()) return;

  try {
    const profile = await customerRequest("/customers/me");
    const profileForm = document.querySelector("[data-profile-form]");
    if (profileForm) {
      profileForm.name.value = profile.name || "";
      profileForm.email.value = profile.email || "";
      profileForm.phone.value = profile.phone || "";
    }
    renderAddresses(profile.addresses || []);
  } catch (error) {
    customerMessage(error.message, true);
  }
}

function renderAddresses(addresses) {
  const list = document.querySelector("[data-address-list]");
  if (!list) return;

  list.innerHTML = addresses.length
    ? addresses
        .map(
          (address) => `
            <article class="admin-list-row">
              <div>
                <strong>${address.customer_name}</strong>
                <span>${address.phone}</span>
                <span>${address.address_line}</span>
              </div>
              <div class="admin-row-actions">
                <button type="button" data-edit-address="${address.id}">Edit</button>
                <button type="button" data-delete-address="${address.id}">Delete</button>
              </div>
            </article>
          `
        )
        .join("")
    : '<p class="admin-empty">No saved addresses yet.</p>';

  list.dataset.addresses = JSON.stringify(addresses);
}

function bindProfile() {
  const profileForm = document.querySelector("[data-profile-form]");
  const passwordForm = document.querySelector("[data-password-form]");
  const addressForm = document.querySelector("[data-address-form]");
  const addressList = document.querySelector("[data-address-list]");

  profileForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await customerRequest("/customers/me", {
        method: "PATCH",
        body: JSON.stringify(Object.fromEntries(new FormData(profileForm).entries()))
      });
      customerMessage("Profile updated.");
      await loadProfile();
    } catch (error) {
      customerMessage(error.message, true);
    }
  });

  passwordForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await customerRequest("/customers/me/password", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(passwordForm).entries()))
      });
      passwordForm.reset();
      customerMessage("Password changed.");
    } catch (error) {
      customerMessage(error.message, true);
    }
  });

  addressForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(addressForm).entries());
    const id = payload.id;
    delete payload.id;
    try {
      await customerRequest(id ? `/customers/me/addresses/${id}` : "/customers/me/addresses", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(payload)
      });
      addressForm.reset();
      customerMessage("Address saved.");
      await loadProfile();
    } catch (error) {
      customerMessage(error.message, true);
    }
  });

  addressList?.addEventListener("click", async (event) => {
    const edit = event.target.closest("[data-edit-address]");
    const remove = event.target.closest("[data-delete-address]");
    const addresses = JSON.parse(addressList.dataset.addresses || "[]");

    if (edit && addressForm) {
      const address = addresses.find((item) => item.id === Number(edit.dataset.editAddress));
      if (!address) return;
      addressForm.id.value = address.id;
      addressForm.customer_name.value = address.customer_name;
      addressForm.phone.value = address.phone;
      addressForm.address_line.value = address.address_line;
      addressForm.delivery_instructions.value = address.delivery_instructions || "";
    }

    if (remove) {
      try {
        await customerRequest(`/customers/me/addresses/${remove.dataset.deleteAddress}`, { method: "DELETE" });
        customerMessage("Address deleted.");
        await loadProfile();
      } catch (error) {
        customerMessage(error.message, true);
      }
    }
  });
}

function customerFormatPrice(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

async function renderProductDetail() {
  const shell = document.querySelector("[data-product-detail]");
  if (!shell) return;

  const slug = new URLSearchParams(window.location.search).get("id");
  if (!slug) {
    shell.innerHTML = '<div class="empty-state">Product not found.</div>';
    return;
  }

  try {
    const product = await customerRequest(`/products/${slug}`);
    shell.innerHTML = `
      <img src="${product.image || ""}" alt="${product.name}" />
      <article>
        <p class="eyebrow">${product.category}</p>
        <h1>${product.name}</h1>
        <p>${product.description}</p>
        <div class="product-detail-meta">
          <strong>${customerFormatPrice(product.price)}</strong>
          <span>${product.is_available ? "Available" : "Unavailable"}</span>
          <span>${Number(product.rating || 0).toFixed(1)} rating</span>
        </div>
        <h2>Ingredients</h2>
        <ul>${(product.ingredients || []).map((item) => `<li>${item}</li>`).join("")}</ul>
        <h2>Reviews</h2>
        <div class="admin-list">
          ${
            product.reviews.length
              ? product.reviews.map((review) => `<article class="admin-list-row"><strong>${review.customer_name}</strong><span>${review.comment}</span></article>`).join("")
              : '<p class="admin-empty">No reviews yet.</p>'
          }
        </div>
        <a class="checkout-button" href="index.html#menu">Add from Menu</a>
      </article>
    `;
  } catch (error) {
    shell.innerHTML = `<div class="empty-state">${error.message}</div>`;
  }
}

async function renderTracking() {
  const list = document.querySelector("[data-tracking-list]");
  if (!list) return;
  if (!requireCustomerLogin()) return;

  try {
    const orders = await customerRequest("/orders");
    list.innerHTML = orders.length
      ? orders
          .map(
            (order) => `
              <article class="tracking-card">
                <header><strong>${order.id}</strong><span>${customerFormatPrice(order.total)}</span></header>
                <div class="tracking-steps" data-current-status="${order.status}">
                  ${["placed", "accepted", "preparing", "ready", "out_for_delivery", "delivered"]
                    .map((status) => `<span class="${status === order.status ? "active" : ""}">${status.replaceAll("_", " ")}</span>`)
                    .join("")}
                </div>
                <p>${order.address.address_line}</p>
              </article>
            `
          )
          .join("")
      : '<div class="empty-state">No orders to track yet.</div>';
  } catch (error) {
    list.innerHTML = `<div class="empty-state">${error.message}</div>`;
  }
}

function initCustomer() {
  bindCustomerLogout();

  if (customerPage() === "login") bindLogin();
  if (customerPage() === "register") bindRegister();
  if (customerPage() === "profile") {
    bindProfile();
    loadProfile();
  }
  if (customerPage() === "product-detail") renderProductDetail();
  if (customerPage() === "tracking") renderTracking();
}

initCustomer();
