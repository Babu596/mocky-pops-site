const AI_API_BASE_URL = "http://127.0.0.1:8000/api";
const AI_TOKEN_KEY = "mocky-pops-customer-token";
const AI_SESSION_KEY = "mocky-pops-ai-session";

function aiToken() {
  return localStorage.getItem(AI_TOKEN_KEY);
}

function aiSessionId() {
  let session = localStorage.getItem(AI_SESSION_KEY);
  if (!session) {
    session = `web-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    localStorage.setItem(AI_SESSION_KEY, session);
  }
  return session;
}

async function aiRequest(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(aiToken() ? { Authorization: `Bearer ${aiToken()}` } : {}),
    ...(options.headers || {})
  };
  const response = await fetch(`${AI_API_BASE_URL}${path}`, {
    ...options,
    headers
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.detail || "AI request failed");
  }
  if (response.status === 204) return null;
  return response.json();
}

function aiPrice(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function renderChat(history) {
  const messages = document.querySelector("[data-ai-chat-messages]");
  if (!messages) return;
  messages.innerHTML = history
    .map((item) => `<article class="ai-message ${item.role}"><span>${item.role}</span><p>${item.message}</p></article>`)
    .join("");
  messages.scrollTop = messages.scrollHeight;
}

function bindChat() {
  const form = document.querySelector("[data-ai-chat-form]");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = form.message;
    const message = input.value.trim();
    if (!message) return;
    input.value = "";
    try {
      const response = await aiRequest("/ai/chat", {
        method: "POST",
        body: JSON.stringify({ message, session_id: aiSessionId() })
      });
      renderChat(response.history);
      renderChatSuggestions(response.suggestions || []);
    } catch (error) {
      renderChat([{ role: "assistant", message: error.message }]);
    }
  });

  document.querySelector("[data-ai-chat-suggestions]")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-chat-suggestion]");
    if (!button) return;
    form.message.value = button.dataset.chatSuggestion;
    form.requestSubmit();
  });
}

function renderChatSuggestions(suggestions) {
  const container = document.querySelector("[data-ai-chat-suggestions]");
  if (!container) return;
  container.innerHTML = suggestions
    .map((suggestion) => `<button type="button" data-chat-suggestion="${suggestion}">${suggestion}</button>`)
    .join("");
}

async function loadRecommendations() {
  const container = document.querySelector("[data-ai-recommendations]");
  if (!container) return;

  try {
    const hour = new Date().getHours();
    const timeOfDay = hour >= 17 ? "evening" : "day";
    const data = await aiRequest(`/ai/recommendations?weather=hot&time_of_day=${timeOfDay}`);
    container.innerHTML = data.recommendations
      .map(
        (item) => `
          <article class="ai-recommendation-card">
            <img src="${item.product.image || ""}" alt="${item.product.name}" />
            <div>
              <span>${item.product.category}</span>
              <h3>${item.product.name}</h3>
              <p>${item.reason}</p>
              <strong>${aiPrice(item.product.price)}</strong>
            </div>
          </article>
        `
      )
      .join("");
  } catch (error) {
    container.innerHTML = `<div class="empty-state">${error.message}</div>`;
  }
}

bindChat();
renderChatSuggestions(["Suggest a cold drink", "Tell me today's offers", "Help me order"]);
loadRecommendations();
