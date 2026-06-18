const PHASE4_API_BASE_URL = "http://127.0.0.1:8000/api";
const PHASE4_TOKEN_KEY = "mocky-pops-customer-token";
const PHASE4_ADMIN_TOKEN_KEY = "mocky-pops-admin-token";

function phase4Page() {
  return document.body.dataset.page || "";
}

function phase4Token(admin = false) {
  return localStorage.getItem(admin ? PHASE4_ADMIN_TOKEN_KEY : PHASE4_TOKEN_KEY);
}

async function phase4Request(path, options = {}, admin = false) {
  const token = phase4Token(admin);
  const response = await fetch(`${PHASE4_API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.detail || "Request failed");
  }
  if (response.status === 204) return null;
  return response.json();
}

function phase4Message(text, error = false) {
  document.querySelectorAll("[data-phase4-message]").forEach((item) => {
    item.textContent = text || "";
    item.classList.toggle("error", error);
  });
}

function money(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function bindFranchiseApplication() {
  const form = document.querySelector("[data-franchise-form]");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await phase4Request("/business/franchise/applications", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(form).entries()))
      });
      form.reset();
      phase4Message("Franchise application submitted. Our team will review it.");
    } catch (error) {
      phase4Message(error.message, true);
    }
  });
}

async function loadFranchisePortal() {
  const shell = document.querySelector("[data-franchise-dashboard]");
  if (!shell) return;
  try {
    const data = await phase4Request("/business/franchise/dashboard");
    if (!data.franchise) {
      shell.innerHTML = '<div class="empty-state">No franchise account is linked to this login yet.</div>';
      return;
    }
    shell.innerHTML = `
      <article class="summary-card"><h2>${data.franchise.franchise_code}</h2><p>${data.franchise.location}</p><strong>${data.franchise.status}</strong></article>
      <article class="summary-card"><h2>Outlets</h2>${data.outlets.map((outlet) => `<p>${outlet.name} - ${outlet.status}</p>`).join("") || "<p>No outlets assigned.</p>"}</article>
      <article class="summary-card"><h2>Royalties</h2>${data.royalties.map((royalty) => `<p>${royalty.month}: ${money(royalty.royalty_amount)} (${royalty.status})</p>`).join("") || "<p>No royalty records yet.</p>"}</article>
    `;
  } catch (error) {
    shell.innerHTML = `<div class="empty-state">${error.message}</div>`;
  }
}

function bindGiftCard() {
  const form = document.querySelector("[data-gift-card-form]");
  const result = document.querySelector("[data-gift-card-result]");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const payload = Object.fromEntries(new FormData(form).entries());
      payload.amount = Number(payload.amount);
      const card = await phase4Request("/business/gift-cards", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      result.innerHTML = `<strong>${card.code}</strong><span>Balance: ${money(card.balance)}</span><span>Expires: ${new Date(card.expires_at).toLocaleDateString("en-IN")}</span>`;
      phase4Message("Gift card created.");
    } catch (error) {
      phase4Message(error.message, true);
    }
  });
}

async function loadLoyalty() {
  const shell = document.querySelector("[data-loyalty]");
  if (!shell) return;
  try {
    const loyalty = await phase4Request("/business/loyalty/me");
    shell.innerHTML = `
      <article class="summary-card"><h2>${loyalty.tier}</h2><strong>${loyalty.points} points</strong><p>Referral: ${loyalty.referral_code}</p></article>
      <article class="summary-card"><h2>Rewards</h2>${loyalty.rewards.map((reward) => `<p>${reward.title}: ${reward.coupon_code}</p>`).join("") || "<p>No rewards redeemed yet.</p>"}</article>
    `;
  } catch (error) {
    shell.innerHTML = `<div class="empty-state">${error.message}</div>`;
  }
}

function bindEventBooking() {
  const form = document.querySelector("[data-event-form]");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const payload = Object.fromEntries(new FormData(form).entries());
      payload.guest_count = Number(payload.guest_count);
      if (!payload.event_date) delete payload.event_date;
      await phase4Request("/business/bulk-orders", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      form.reset();
      phase4Message("Event enquiry submitted. Mocky Pops will prepare a custom quotation.");
    } catch (error) {
      phase4Message(error.message, true);
    }
  });
}

bindFranchiseApplication();
loadFranchisePortal();
bindGiftCard();
loadLoyalty();
bindEventBooking();
