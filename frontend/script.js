const CART_STORAGE_KEY = "mocky-pops-cart";
const ORDER_STORAGE_KEY = "mocky-pops-last-order";
const ORDER_HISTORY_STORAGE_KEY = "mocky-pops-orders";
const CUSTOMER_TOKEN_STORAGE_KEY = "mocky-pops-customer-token";
const API_BASE_URL = "http://127.0.0.1:8000/api";

const state = {
  activeCategory: "all",
  query: "",
  cart: loadCart()
};

let products = typeof ProductManager !== "undefined"
  ? ProductManager.getAll()
  : typeof MOCKY_PRODUCTS !== "undefined"
    ? MOCKY_PRODUCTS
    : [];
let categories = typeof ProductManager !== "undefined"
  ? ProductManager.getCategories()
  : typeof PRODUCT_CATEGORIES !== "undefined"
    ? PRODUCT_CATEGORIES
    : [];
let categoryLabels = categories.reduce((labels, category) => {
  labels[category.id] = category.label;
  return labels;
}, {});

function getPage() {
  return document.body.dataset.page || "home";
}

function formatPrice(value) {
  return `Rs. ${Number(value).toLocaleString("en-IN")}`;
}

function formatCategory(categoryId) {
  return categoryLabels[categoryId] || categoryId.replace("-", " ");
}

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_STORAGE_KEY)) || [];
  } catch (error) {
    return [];
  }
}

function saveCart() {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state.cart));
}

async function apiRequest(path, options = {}) {
  const token = localStorage.getItem(CUSTOMER_TOKEN_STORAGE_KEY);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.detail || "API request failed");
  }

  return response.json();
}

function isLoggedIn() {
  return Boolean(localStorage.getItem(CUSTOMER_TOKEN_STORAGE_KEY));
}

function backendCartToLocal(cart) {
  return (cart.items || []).map((item) => ({
    cartItemId: item.id,
    id: item.product.id,
    name: item.product.name,
    price: item.product.price,
    image: item.product.image,
    options: item.selected_options || {},
    quantity: item.quantity
  }));
}

async function loadCartFromApi() {
  if (!isLoggedIn()) return;
  try {
    const cart = await apiRequest("/cart");
    state.cart = backendCartToLocal(cart);
    saveCart();
  } catch (error) {
    console.info("Using browser cart because saved cart is not available.");
  }
}

async function loadProductsFromApi() {
  try {
    const apiProducts = await apiRequest("/products");
    if (Array.isArray(apiProducts) && apiProducts.length) {
      products = apiProducts;
    }
  } catch (error) {
    console.info("Using local products because the backend is not available.");
  }
}

async function loadCategoriesFromApi() {
  try {
    const apiCategories = await apiRequest("/products/categories");
    if (Array.isArray(apiCategories) && apiCategories.length) {
      categories = [
        { id: "all", label: "All" },
        ...apiCategories.map((category) => ({ id: category.slug, label: category.name }))
      ];
      categoryLabels = categories.reduce((labels, category) => {
        labels[category.id] = category.label;
        return labels;
      }, {});
      renderCategoryTabs();
    }
  } catch (error) {
    console.info("Using local categories because the backend is not available.");
  }
}

async function loadSiteSettings() {
  try {
    const settings = await apiRequest("/site/settings");
    document.querySelectorAll("[data-social-instagram]").forEach((link) => { link.href = settings.instagram_url; });
    document.querySelectorAll("[data-social-facebook]").forEach((link) => { link.href = settings.facebook_url; });
    document.querySelectorAll("[data-social-whatsapp]").forEach((link) => { link.href = settings.whatsapp_url; });
    document.querySelectorAll("[data-brand-description]").forEach((item) => { item.textContent = settings.brand_description; });
    document.querySelectorAll("[data-franchise-headline]").forEach((item) => {
      item.textContent = `Start your Mocky Pops Franchise at Rs. ${Number(settings.franchise_amount).toLocaleString("en-IN")}`;
    });
    document.querySelectorAll("[data-footer-franchise]").forEach((item) => {
      item.textContent = `Start your Mocky Pops Franchise at Rs. ${Number(settings.franchise_amount).toLocaleString("en-IN")}`;
    });
  } catch (error) {
    console.info("Using default site settings.");
  }
}

function loadOrders() {
  try {
    return JSON.parse(localStorage.getItem(ORDER_HISTORY_STORAGE_KEY)) || [];
  } catch (error) {
    return [];
  }
}

function saveOrder(order) {
  const orders = loadOrders();
  const nextOrders = [order, ...orders];
  localStorage.setItem(ORDER_HISTORY_STORAGE_KEY, JSON.stringify(nextOrders));
  localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(order));
}

function generateOrderId() {
  const now = new Date();
  const datePart = now.toISOString().slice(2, 10).replace(/-/g, "");
  const timePart = String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0") +
    String(now.getSeconds()).padStart(2, "0");
  const randomPart = Math.floor(100 + Math.random() * 900);
  return `MP-${datePart}-${timePart}-${randomPart}`;
}

function formatDateTime(dateValue) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(dateValue));
}

function cartTotals() {
  const subtotal = state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const deliveryFee = subtotal > 0 ? 29 : 0;
  const taxes = Math.round(subtotal * 0.05);
  return {
    subtotal,
    deliveryFee,
    taxes,
    total: subtotal + deliveryFee + taxes
  };
}

function getProduct(productId) {
  const product = products.find((item) => item.id === productId);
  if (product) return product;

  if (typeof ProductManager !== "undefined") {
    return ProductManager.getById(productId);
  }

  return undefined;
}

function getSelectedOptions(productCard) {
  if (!productCard) return {};

  return [...productCard.querySelectorAll("select")].reduce((options, select) => {
    options[select.dataset.optionLabel] = select.value;
    return options;
  }, {});
}

function sameOptions(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function addToCart(productId, selectedOptions = {}) {
  const product = getProduct(productId);
  if (!product) return;

  if (isLoggedIn()) {
    apiRequest("/cart/items", {
      method: "POST",
      body: JSON.stringify({ product_id: productId, quantity: 1, options: selectedOptions })
    })
      .then((cart) => {
        state.cart = backendCartToLocal(cart);
        saveCart();
        renderCartCount();
        renderCartPanel();
        openCartPanel();
      })
      .catch(() => addToCartLocal(productId, selectedOptions));
    return;
  }

  addToCartLocal(productId, selectedOptions);
}

function addToCartLocal(productId, selectedOptions = {}) {
  const product = getProduct(productId);
  if (!product) return;

  const existingItem = state.cart.find(
    (item) => item.id === productId && sameOptions(item.options, selectedOptions)
  );

  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    state.cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
      options: selectedOptions,
      quantity: 1
    });
  }

  saveCart();
  renderCartCount();
  renderCartPanel();
  openCartPanel();
}

function updateQuantity(index, quantity) {
  if (!state.cart[index]) return;

  const parsedQuantity = Number(quantity);
  const nextQuantity = Number.isFinite(parsedQuantity) ? Math.max(1, parsedQuantity) : 1;

  if (isLoggedIn() && state.cart[index].cartItemId) {
    apiRequest(`/cart/items/${state.cart[index].cartItemId}`, {
      method: "PATCH",
      body: JSON.stringify({ quantity: nextQuantity })
    })
      .then((cart) => {
        state.cart = backendCartToLocal(cart);
        saveCart();
        renderCartCount();
        renderCartPage();
        renderCartPanel();
        renderCheckoutPage();
      })
      .catch(() => {});
    return;
  }

  state.cart[index].quantity = nextQuantity;
  saveCart();
  renderCartCount();
  renderCartPage();
  renderCartPanel();
  renderCheckoutPage();
}

function removeCartItem(index) {
  if (!state.cart[index]) return;

  if (isLoggedIn() && state.cart[index].cartItemId) {
    apiRequest(`/cart/items/${state.cart[index].cartItemId}`, { method: "DELETE" })
      .then((cart) => {
        state.cart = backendCartToLocal(cart);
        saveCart();
        renderCartCount();
        renderCartPage();
        renderCartPanel();
        renderCheckoutPage();
      })
      .catch(() => {});
    return;
  }

  state.cart.splice(index, 1);
  saveCart();
  renderCartCount();
  renderCartPage();
  renderCartPanel();
  renderCheckoutPage();
}

function optionSelectMarkup(product) {
  return product.customizations
    .map(
      (customization) => `
        <div class="custom-row">
          <span>${customization.label}</span>
          <select data-option-label="${customization.label}" aria-label="${customization.label}">
            ${customization.options.map((option) => `<option>${option}</option>`).join("")}
          </select>
        </div>
      `
    )
    .join("");
}

function productCardMarkup(product) {
  return `
    <article class="product-card" data-product-id="${product.id}" data-category="${product.category}">
      <a href="product.html?id=${product.id}" aria-label="View ${product.name} details">
        <img src="${product.image}" alt="${product.name}" loading="lazy" />
      </a>
      <div class="product-body">
        <div>
          <div class="product-meta">
            <span>${formatCategory(product.category)}</span>
            <strong>${product.rating.toFixed(1)}</strong>
          </div>
          <h3><a href="product.html?id=${product.id}">${product.name}</a></h3>
          <p>${product.description}</p>
          <small>${product.ingredients.join(" | ")}</small>
        </div>
        ${optionSelectMarkup(product)}
        <footer>
          <strong>${formatPrice(product.price)}</strong>
          <button type="button" data-add="${product.id}">Add</button>
        </footer>
      </div>
    </article>
  `;
}

function renderProducts() {
  const productGrid = document.querySelector("[data-products]");
  const productCount = document.querySelector("[data-product-count]");
  if (!productGrid) return;

  const query = state.query.trim().toLowerCase();
  const visibleProducts = products.filter((product) => {
        const haystack = [
          product.name,
          product.category,
          product.description,
          ...product.ingredients
        ].join(" ").toLowerCase();
        const matchesCategory = state.activeCategory === "all" || product.category === state.activeCategory;
        return matchesCategory && haystack.includes(query);
      });

  productGrid.innerHTML = visibleProducts.length
    ? visibleProducts.map(productCardMarkup).join("")
    : '<p class="empty-state">No products found. Try another category or search term.</p>';

  if (productCount) {
    const label = state.activeCategory === "all" ? "all categories" : formatCategory(state.activeCategory);
    productCount.textContent = `${visibleProducts.length} products available in ${label}`;
  }
}

function bindMenuEvents() {
  const searchInput = document.querySelector("[data-search]");

  if (searchInput) {
    searchInput.addEventListener("input", (event) => {
      state.query = event.target.value;
      renderProducts();
    });
  }

  bindCategoryButtons();

  document.addEventListener("click", (event) => {
    const addButton = event.target.closest("[data-add]");
    if (!addButton) return;

    const productCard = addButton.closest("[data-product-id]");
    addToCart(addButton.dataset.add, getSelectedOptions(productCard));
  });
}

function renderCategoryTabs() {
  const tabs = document.querySelector(".category-tabs");
  if (!tabs) return;
  tabs.innerHTML = categories
    .map((category) => `<button class="${category.id === state.activeCategory ? "active" : ""}" type="button" data-category="${category.id}">${category.label}</button>`)
    .join("");
  bindCategoryButtons();
}

function bindCategoryButtons() {
  const categoryButtons = [...document.querySelectorAll(".category-tabs [data-category]")];
  categoryButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.activeCategory = button.dataset.category;
      categoryButtons.forEach((item) => item.classList.toggle("active", item === button));
      renderProducts();
    });
  });
}

function renderCartCount() {
  const itemCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);

  document.querySelectorAll("[data-cart-count]").forEach((element) => {
    element.textContent = itemCount;
  });
}

function cartLineMarkup(item, index, compact = false) {
  const options = Object.entries(item.options || {})
    .map(([key, value]) => `${key}: ${value}`)
    .join(" / ");

  return `
    <article class="cart-line ${compact ? "compact" : ""}">
      <img src="${item.image}" alt="${item.name}" />
      <div>
        <h3>${item.name}</h3>
        <p>${options || "Standard"}</p>
        <strong>${formatPrice(item.price)}</strong>
      </div>
      ${
        compact
          ? `<div class="mini-cart-actions">
              <button type="button" data-qty-minus="${index}" aria-label="Decrease quantity">-</button>
              <span class="qty-pill">x${item.quantity}</span>
              <button type="button" data-qty-plus="${index}" aria-label="Increase quantity">+</button>
              <button class="mini-remove" type="button" data-remove="${index}" aria-label="Remove ${item.name}">Remove</button>
            </div>`
          : `<div class="quantity-control">
              <button type="button" data-qty-minus="${index}" aria-label="Decrease quantity">-</button>
              <input type="number" min="1" value="${item.quantity}" data-qty-input="${index}" aria-label="Quantity for ${item.name}" />
              <button type="button" data-qty-plus="${index}" aria-label="Increase quantity">+</button>
              <button class="remove-button" type="button" data-remove="${index}">Remove</button>
            </div>`
      }
    </article>
  `;
}

function renderSummary(container) {
  if (!container) return;
  const totals = cartTotals();

  container.innerHTML = `
    <div class="summary-line"><span>Subtotal</span><strong>${formatPrice(totals.subtotal)}</strong></div>
    <div class="summary-line"><span>Delivery</span><strong>${formatPrice(totals.deliveryFee)}</strong></div>
    <div class="summary-line"><span>Taxes</span><strong>${formatPrice(totals.taxes)}</strong></div>
    <div class="summary-line total"><span>Total</span><strong>${formatPrice(totals.total)}</strong></div>
  `;
}

function renderCartPanel() {
  const cartItems = document.querySelector("[data-cart-items]");
  const cartTotal = document.querySelector("[data-cart-total]");
  if (!cartItems || !cartTotal) return;

  cartTotal.textContent = formatPrice(cartTotals().total);
  cartItems.innerHTML = state.cart.length
    ? state.cart.map((item, index) => cartLineMarkup(item, index, true)).join("")
    : '<p class="empty-cart">Add a product to start an order.</p>';
}

function openCartPanel() {
  const cartPanel = document.querySelector("[data-cart-panel]");
  if (!cartPanel) return;
  cartPanel.classList.add("open");
  cartPanel.setAttribute("aria-hidden", "false");
}

function bindCartPanelEvents() {
  const openButton = document.querySelector("[data-cart-open]");
  const closeButton = document.querySelector("[data-cart-close]");
  const cartItems = document.querySelector("[data-cart-items]");

  if (openButton) openButton.addEventListener("click", openCartPanel);
  if (closeButton) {
    closeButton.addEventListener("click", () => {
      const cartPanel = document.querySelector("[data-cart-panel]");
      cartPanel.classList.remove("open");
      cartPanel.setAttribute("aria-hidden", "true");
    });
  }

  if (cartItems) {
    cartItems.addEventListener("click", (event) => {
      const minus = event.target.closest("[data-qty-minus]");
      const plus = event.target.closest("[data-qty-plus]");
      const remove = event.target.closest("[data-remove]");

      if (minus) {
        const index = Number(minus.dataset.qtyMinus);
        if (state.cart[index]) updateQuantity(index, state.cart[index].quantity - 1);
      }
      if (plus) {
        const index = Number(plus.dataset.qtyPlus);
        if (state.cart[index]) updateQuantity(index, state.cart[index].quantity + 1);
      }
      if (remove) removeCartItem(Number(remove.dataset.remove));
    });
  }
}

function renderCartPage() {
  const cartPageItems = document.querySelector("[data-cart-page-items]");
  if (!cartPageItems) return;

  cartPageItems.innerHTML = state.cart.length
    ? state.cart.map((item, index) => cartLineMarkup(item, index)).join("")
    : '<div class="empty-state">Your cart is empty. Add a drink from the menu to continue.</div>';

  renderSummary(document.querySelector("[data-cart-summary]"));
  const checkoutLink = document.querySelector("[data-checkout-link]");
  if (checkoutLink) checkoutLink.classList.toggle("disabled", !state.cart.length);
}

function bindCartPageEvents() {
  const cartPageItems = document.querySelector("[data-cart-page-items]");
  if (!cartPageItems) return;

  cartPageItems.addEventListener("click", (event) => {
    const minus = event.target.closest("[data-qty-minus]");
    const plus = event.target.closest("[data-qty-plus]");
    const remove = event.target.closest("[data-remove]");

    if (minus) {
      const index = Number(minus.dataset.qtyMinus);
      if (state.cart[index]) updateQuantity(index, state.cart[index].quantity - 1);
    }
    if (plus) {
      const index = Number(plus.dataset.qtyPlus);
      if (state.cart[index]) updateQuantity(index, state.cart[index].quantity + 1);
    }
    if (remove) removeCartItem(Number(remove.dataset.remove));
  });

  cartPageItems.addEventListener("change", (event) => {
    const input = event.target.closest("[data-qty-input]");
    if (input) updateQuantity(Number(input.dataset.qtyInput), input.value);
  });
}

function renderCheckoutPage() {
  const checkoutItems = document.querySelector("[data-checkout-items]");
  if (!checkoutItems) return;

  checkoutItems.innerHTML = state.cart.length
    ? state.cart.map((item, index) => cartLineMarkup(item, index, true)).join("")
    : '<div class="empty-state">Your cart is empty. Please add products before checkout.</div>';

  renderSummary(document.querySelector("[data-checkout-summary]"));
}

function orderItemsMarkup(items) {
  return items
    .map((item) => {
      const options = Object.entries(item.options || {})
        .map(([key, value]) => `${key}: ${value}`)
        .join(" / ");

      return `
        <li>
          <span>${item.quantity} x ${item.name}</span>
          <small>${options || "Standard"}</small>
        </li>
      `;
    })
    .join("");
}

function confirmationMarkup(order) {
  return `
    <strong>Order placed successfully</strong>
    <span>Order ID: ${order.id}</span>
    <span>Total: ${formatPrice(order.totals.total)}</span>
    <span>Status: ${order.status}</span>
    <a class="text-action" href="orders.html">View order history</a>
  `;
}

function apiOrderToLocalOrder(apiOrder, customer) {
  return {
    id: apiOrder.id,
    customer,
    items: state.cart,
    totals: {
      subtotal: apiOrder.subtotal,
      deliveryFee: apiOrder.delivery_fee,
      taxes: apiOrder.taxes,
      total: apiOrder.total
    },
    status: apiOrder.status,
    createdAt: apiOrder.created_at
  };
}

async function createBackendOrder(customer) {
  const specialInstructions = customer.instructions || "";
  return apiRequest("/orders", {
    method: "POST",
    body: JSON.stringify({
      customer: {
        ...customer,
        address_id: customer.address_id ? Number(customer.address_id) : null,
        coupon_code: customer.coupon || null,
        gift_card_code: customer.gift_card || null
      },
      special_instructions: specialInstructions,
      items: state.cart.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        options: item.options || {}
      }))
    })
  });
}

function bindCheckoutForm() {
  const checkoutForm = document.querySelector("[data-checkout-form]");
  const confirmation = document.querySelector("[data-order-confirmation]");
  if (!checkoutForm) return;

  checkoutForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.cart.length) {
      confirmation.textContent = "Please add at least one product before placing an order.";
      confirmation.classList.add("show");
      return;
    }

    const formData = new FormData(checkoutForm);
    const customer = Object.fromEntries(formData.entries());
    let order;
    try {
      const apiOrder = await createBackendOrder(customer);
      order = apiOrderToLocalOrder(apiOrder, customer);
    } catch (error) {
      order = {
        id: generateOrderId(),
        customer,
        items: state.cart,
        totals: cartTotals(),
        status: "Order placed locally",
        createdAt: new Date().toISOString()
      };
    }

    saveOrder(order);
    state.cart = [];
    saveCart();
    renderCartCount();
    renderCheckoutPage();
    checkoutForm.reset();
    confirmation.innerHTML = confirmationMarkup(order);
    confirmation.classList.add("show");
  });
}

async function hydrateCheckoutCustomer() {
  const checkoutForm = document.querySelector("[data-checkout-form]");
  const addressSelect = document.querySelector("[data-saved-addresses]");
  if (!checkoutForm || !isLoggedIn()) return;

  try {
    const profile = await apiRequest("/customers/me");
    if (checkoutForm.name) checkoutForm.name.value = profile.name || "";
    if (checkoutForm.phone) checkoutForm.phone.value = profile.phone || "";

    if (addressSelect) {
      addressSelect.innerHTML = '<option value="">Use typed address</option>' +
        (profile.addresses || [])
          .map((address) => `<option value="${address.id}">${address.address_line}</option>`)
          .join("");
      addressSelect.addEventListener("change", () => {
        const selected = (profile.addresses || []).find((address) => address.id === Number(addressSelect.value));
        if (selected) {
          checkoutForm.address.value = selected.address_line;
          checkoutForm.instructions.value = selected.delivery_instructions || "";
        }
      });
    }
  } catch (error) {
    console.info("Customer profile is not available for checkout.");
  }
}

function orderHistoryCardMarkup(order) {
  return `
    <article class="order-card">
      <header>
        <div>
          <span class="order-id">${order.id}</span>
          <h3>${order.customer.name}</h3>
        </div>
        <strong>${formatPrice(order.totals.total)}</strong>
      </header>

      <div class="order-card-meta">
        <span>${formatDateTime(order.createdAt)}</span>
        <span>${order.status}</span>
        <span>${order.customer.phone}</span>
      </div>

      <div class="order-address">
        <strong>Delivery address</strong>
        <p>${order.customer.address}</p>
        <small>${order.customer.instructions || "No extra delivery instructions"}</small>
      </div>

      <ul class="order-items">
        ${orderItemsMarkup(order.items)}
      </ul>
    </article>
  `;
}

function renderOrderHistoryPage() {
  const orderHistory = document.querySelector("[data-order-history]");
  if (!orderHistory) return;

  if (isLoggedIn()) {
    apiRequest("/orders")
      .then((orders) => {
        orderHistory.innerHTML = orders.length
          ? orders.map(apiOrderHistoryCardMarkup).join("")
          : '<div class="empty-state">No orders yet. Place your first Mocky Pops order from the menu.</div>';
      })
      .catch(() => {
        const orders = loadOrders();
        orderHistory.innerHTML = orders.length
          ? orders.map(orderHistoryCardMarkup).join("")
          : '<div class="empty-state">No orders yet. Place your first Mocky Pops order from the menu.</div>';
      });
    return;
  }

  const orders = loadOrders();
  orderHistory.innerHTML = orders.length
    ? orders.map(orderHistoryCardMarkup).join("")
    : '<div class="empty-state">No orders yet. Place your first Mocky Pops order from the menu.</div>';
}

function bindOrderHistoryEvents() {
  const orderHistory = document.querySelector("[data-order-history]");
  if (!orderHistory) return;

  orderHistory.addEventListener("click", async (event) => {
    const cancelButton = event.target.closest("[data-cancel-order]");
    if (!cancelButton) return;
    try {
      await apiRequest(`/orders/${cancelButton.dataset.cancelOrder}/cancel`, { method: "PATCH" });
      renderOrderHistoryPage();
    } catch (error) {
      alert(error.message);
    }
  });
}

function bindClickSparkles() {
  const colors = ["#ffe66d", "#ff6fb1", "#65d7ff", "#75f0b2", "#ff765e"];

  document.addEventListener("pointerdown", (event) => {
    if (event.button && event.button !== 0) return;
    const sparkleCount = 8;

    for (let index = 0; index < sparkleCount; index += 1) {
      const sparkle = document.createElement("span");
      const angle = (Math.PI * 2 * index) / sparkleCount;
      const distance = 24 + Math.random() * 34;
      sparkle.className = "click-sparkle";
      sparkle.style.left = `${event.clientX}px`;
      sparkle.style.top = `${event.clientY}px`;
      sparkle.style.setProperty("--sparkle-x", `${Math.cos(angle) * distance}px`);
      sparkle.style.setProperty("--sparkle-y", `${Math.sin(angle) * distance}px`);
      sparkle.style.setProperty("--sparkle-color", colors[index % colors.length]);
      document.body.appendChild(sparkle);
      window.setTimeout(() => sparkle.remove(), 760);
    }
  });
}

function apiOrderHistoryCardMarkup(order) {
  const localOrder = {
    id: order.id,
    customer: {
      name: order.address.customer_name,
      phone: order.address.phone,
      address: order.address.address_line,
      instructions: order.address.delivery_instructions
    },
    items: order.items.map((item) => ({
      name: item.product_name,
      quantity: item.quantity,
      options: item.selected_options
    })),
    totals: {
      total: order.total
    },
    status: order.status,
    createdAt: order.created_at
  };
  return orderHistoryCardMarkup(localOrder).replace(
    "</article>",
    `<button class="secondary-checkout" type="button" data-cancel-order="${order.id}">Cancel Order</button></article>`
  );
}

async function init() {
  await loadSiteSettings();
  await loadCartFromApi();
  bindClickSparkles();
  renderCartCount();
  renderCartPanel();
  bindCartPanelEvents();

  if (getPage() === "home") {
    await loadCategoriesFromApi();
    await loadProductsFromApi();
    renderProducts();
    bindMenuEvents();
  }

  if (getPage() === "cart") {
    renderCartPage();
    bindCartPageEvents();
  }

  if (getPage() === "checkout") {
    renderCheckoutPage();
    await hydrateCheckoutCustomer();
    bindCheckoutForm();
  }

  if (getPage() === "orders") {
    renderOrderHistoryPage();
    bindOrderHistoryEvents();
  }
}

init();
