const state = {
  selectedChannel: null,
  lastUpdated: null,
  searchQuery: "",
  theme: "dark",
};

const channelGroupsEl = document.getElementById("channel-groups");
const messageListEl = document.getElementById("message-list");
const channelTitleEl = document.getElementById("channel-title");
const messageCountEl = document.getElementById("message-count");
const statusTextEl = document.getElementById("status-text");
const refreshTextEl = document.getElementById("refresh-text");
const emptyStateEl = document.getElementById("empty-state");
const logPathEl = document.getElementById("log-path");
const searchInputEl = document.getElementById("search-input");
const themeToggleEl = document.getElementById("theme-toggle");
const tokenInputEl = document.getElementById("token-input");
const guildInputEl = document.getElementById("guild-input");
const saveConfigEl = document.getElementById("save-config");
const stopMonitorEl = document.getElementById("stop-monitor");
const configHelpEl = document.getElementById("config-help");
const monitorBadgeEl = document.getElementById("monitor-badge");
const mentionPattern = /(@everyone|@here|@\S+)/g;
const singleMentionPattern = /^(@everyone|@here|@\S+)$/;

function eventClassName(eventType) {
  switch (eventType) {
    case "EDIT":
      return "event-edit";
    case "DELETE":
      return "event-delete";
    default:
      return "event-message";
  }
}

function applyTheme(theme) {
  state.theme = theme === "light" ? "light" : "dark";
  document.body.classList.toggle("light-mode", state.theme === "light");
  themeToggleEl.textContent = state.theme === "light" ? "Dark Mode" : "Light Mode";
  localStorage.setItem("viewer-theme", state.theme);
}

function guildIdsToText(guildIds) {
  return guildIds.join("\n");
}

function parseGuildIdsFromInput() {
  return guildInputEl.value
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function updateMonitorUI(monitor) {
  const safeMonitor = monitor || { running: false, error: null, guild_ids: [] };
  const hasConfig = tokenInputEl.value.trim() && parseGuildIdsFromInput().length > 0;
  monitorBadgeEl.classList.remove("live", "error");

  if (safeMonitor.running) {
    monitorBadgeEl.textContent = "Live";
    monitorBadgeEl.classList.add("live");
    statusTextEl.textContent = "Monitoring live";
    configHelpEl.textContent = `Watching ${safeMonitor.guild_ids.length} guild${safeMonitor.guild_ids.length === 1 ? "" : "s"}.`;
    return;
  }

  if (safeMonitor.error) {
    monitorBadgeEl.textContent = "Error";
    monitorBadgeEl.classList.add("error");
    statusTextEl.textContent = "Monitor error";
    configHelpEl.textContent = safeMonitor.error;
    return;
  }

  monitorBadgeEl.textContent = "Idle";
  statusTextEl.textContent = hasConfig ? "Saved, not running" : "Awaiting setup";
  configHelpEl.textContent = hasConfig
    ? "Saved locally. Press Save and Start to reconnect."
    : "Enter a bot token and one or more guild IDs to begin.";
}

function formatTimestamp(timestamp) {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return timestamp;
  }

  return parsed.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function initialsFromName(name) {
  return name
    .split(/[\s#._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

function groupChannels(channels) {
  const groups = new Map();
  for (const channel of channels) {
    const list = groups.get(channel.category) ?? [];
    list.push(channel);
    groups.set(channel.category, list);
  }
  return groups;
}

function renderChannels(channels) {
  const groups = groupChannels(channels);
  channelGroupsEl.innerHTML = "";

  if (groups.size === 0) {
    channelGroupsEl.innerHTML = '<p class="sidebar-meta">No channel data yet. Start the monitor and write to the log file.</p>';
    return;
  }

  for (const [category, items] of groups.entries()) {
    const groupEl = document.createElement("section");
    groupEl.className = "channel-group";

    const headingEl = document.createElement("p");
    headingEl.className = "channel-category";
    headingEl.textContent = category;
    groupEl.appendChild(headingEl);

    for (const channel of items) {
      const button = document.createElement("button");
      button.className = "channel-button";
      if (channel.id === state.selectedChannel) {
        button.classList.add("active");
      }

      button.innerHTML = `
        <span class="channel-name"># ${channel.name}</span>
        <span class="channel-count">${channel.count}</span>
      `;
      button.addEventListener("click", () => {
        state.selectedChannel = channel.id;
        fetchState();
      });
      groupEl.appendChild(button);
    }

    channelGroupsEl.appendChild(groupEl);
  }
}

function renderMessages(messages, channels) {
  const selected = channels.find((channel) => channel.id === state.selectedChannel);
  channelTitleEl.textContent = selected
    ? `${selected.category} / #${selected.name}`
    : "No channel selected";
  messageCountEl.textContent = `${messages.length} result${messages.length === 1 ? "" : "s"}`;

  const shouldStickToBottom =
    messageListEl.scrollHeight - messageListEl.scrollTop - messageListEl.clientHeight < 80;

  messageListEl.innerHTML = "";

  if (messages.length === 0) {
    emptyStateEl.classList.remove("hidden");
    return;
  }

  emptyStateEl.classList.add("hidden");

  for (const message of messages) {
    const row = document.createElement("article");
    row.className = "message-row";
    row.innerHTML = `
      <div class="avatar">${initialsFromName(message.author)}</div>
      <div>
        <div class="message-meta">
          <span class="author">${message.author}</span>
          <span class="event-badge ${eventClassName(message.event_type)}">${message.event_type}</span>
          <span class="timestamp">${formatTimestamp(message.timestamp)}</span>
        </div>
        <div class="message-content"></div>
      </div>
    `;
    renderMessageContent(row.querySelector(".message-content"), message.content);
    messageListEl.appendChild(row);
  }

  if (shouldStickToBottom) {
    messageListEl.scrollTop = messageListEl.scrollHeight;
  }
}

function renderMessageContent(container, content) {
  container.textContent = "";

  const parts = content.split(mentionPattern);
  for (const part of parts) {
    if (!part) {
      continue;
    }

    if (singleMentionPattern.test(part)) {
      const mention = document.createElement("span");
      mention.className = "mention-pill";
      mention.textContent = part;
      container.appendChild(mention);
      continue;
    }

    container.appendChild(document.createTextNode(part));
  }
}

async function fetchState() {
  const params = new URLSearchParams();
  if (state.selectedChannel) {
    params.set("channel", state.selectedChannel);
  }
  if (state.searchQuery) {
    params.set("q", state.searchQuery);
  }

  const response = await fetch(`/api/state?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }

  const payload = await response.json();
  state.selectedChannel = payload.selected_channel;
  state.lastUpdated = payload.last_updated;
  state.searchQuery = payload.search_query;
  if (searchInputEl.value !== state.searchQuery) {
    searchInputEl.value = state.searchQuery;
  }

  logPathEl.textContent = payload.available
    ? `Source: ${payload.log_path}`
    : `Waiting for log file: ${payload.log_path}`;
  refreshTextEl.textContent = payload.last_updated
    ? `Updated ${new Date(payload.last_updated * 1000).toLocaleTimeString()}`
    : "No updates yet";

  updateMonitorUI(payload.monitor);
  renderChannels(payload.channels);
  renderMessages(payload.messages, payload.channels);
}

async function fetchConfig() {
  const response = await fetch("/api/config", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Config request failed with ${response.status}`);
  }

  const payload = await response.json();
  tokenInputEl.value = payload.config.token || "";
  guildInputEl.value = guildIdsToText(payload.config.guild_ids || []);
  updateMonitorUI(payload.monitor);
}

async function saveConfigAndStart() {
  const guildIds = parseGuildIdsFromInput();
  const invalidGuild = guildIds.find((value) => !/^\d+$/.test(value));
  if (invalidGuild) {
    monitorBadgeEl.textContent = "Error";
    monitorBadgeEl.classList.remove("live");
    monitorBadgeEl.classList.add("error");
    configHelpEl.textContent = `Invalid guild ID: ${invalidGuild}`;
    return;
  }

  const response = await fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: tokenInputEl.value.trim(),
      guild_ids: guildIds,
      start_monitor: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Save failed with ${response.status}`);
  }

  const payload = await response.json();
  updateMonitorUI(payload.monitor);
}

async function stopMonitor() {
  const response = await fetch("/api/monitor/stop", { method: "POST" });
  if (!response.ok) {
    throw new Error(`Stop failed with ${response.status}`);
  }

  const payload = await response.json();
  updateMonitorUI(payload.monitor);
}

async function tick() {
  try {
    await fetchState();
  } catch (error) {
    statusTextEl.textContent = "Connection issue";
    refreshTextEl.textContent = error.message;
  }
}

let searchDebounceHandle = null;

searchInputEl.addEventListener("input", (event) => {
  clearTimeout(searchDebounceHandle);
  state.searchQuery = event.target.value.trim();
  searchDebounceHandle = setTimeout(() => {
    fetchState().catch((error) => {
      statusTextEl.textContent = "Connection issue";
      refreshTextEl.textContent = error.message;
    });
  }, 150);
});

themeToggleEl.addEventListener("click", () => {
  applyTheme(state.theme === "dark" ? "light" : "dark");
});

saveConfigEl.addEventListener("click", () => {
  saveConfigAndStart().catch((error) => {
    monitorBadgeEl.textContent = "Error";
    monitorBadgeEl.classList.remove("live");
    monitorBadgeEl.classList.add("error");
    configHelpEl.textContent = error.message;
  });
});

stopMonitorEl.addEventListener("click", () => {
  stopMonitor().catch((error) => {
    monitorBadgeEl.textContent = "Error";
    monitorBadgeEl.classList.remove("live");
    monitorBadgeEl.classList.add("error");
    configHelpEl.textContent = error.message;
  });
});

applyTheme(localStorage.getItem("viewer-theme") || "dark");
fetchConfig().catch((error) => {
  configHelpEl.textContent = error.message;
});
tick();
setInterval(tick, 2000);
