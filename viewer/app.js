const state = {
  selectedGuild: null,
  selectedChannel: null,
  lastUpdated: null,
  searchQuery: "",
  theme: "dark",
  configExpanded: true,
  sidebarCollapsed: false,
  helpOpen: false,
  settingsOpen: false,
  guilds: [],
  monitorGuilds: [],
  configuredGuildIds: [],
  draftGuildIds: [],
  guildSelectionDirty: false,
  configuredChannelIds: [],
  draftChannelIds: [],
  channelSelectionDirty: false,
  webhookUrl: "",
  formatData: true,
  messagePageSize: 80,
  loadedMessages: [],
  oldestLoadedLine: null,
  newestLoadedLine: null,
  hasMoreOlder: false,
  loadingOlder: false,
  queryKey: "",
  guildLatestById: {},
  unreadGuildIds: new Set(),
  unreadTrackingReady: false,
  webhookEnabled: false,
  channelFilterOpen: false,
  channelActionsMenuOpen: false,
  mobileHeaderMenuOpen: false,
  mobileSearchOpen: false,
  highlightOnly: false,
  latestChannels: [],
  keywords: [],
  messageViewLoading: false,
};

const serverListEl = document.getElementById("server-list");
const channelGroupsEl = document.getElementById("channel-groups");
const messageListEl = document.getElementById("message-list");
const channelTitleEl = document.getElementById("channel-title");
const sidebarGuildTitleEl = document.getElementById("sidebar-guild-title");
const messageCountEl = document.getElementById("message-count");
const statusTextEl = document.getElementById("status-text");
const statusDotEl = document.querySelector(".status-dot");
const refreshTextEl = document.getElementById("refresh-text");
const emptyStateEl = document.getElementById("empty-state");
const messageViewLoadingEl = document.getElementById("message-view-loading");
const messageViewLoadingTextEl = document.getElementById("message-view-loading-text");
const logPathEl = document.getElementById("log-path");
const searchInputEl = document.getElementById("search-input");
const searchWrapEl = document.querySelector(".search-wrap");
const mobileSearchToggleEl = document.getElementById("mobile-search-toggle");
const cancelMobileSearchEl = document.getElementById("cancel-mobile-search");
const themeToggleEl = document.getElementById("theme-toggle");
const toggleServersEl = document.getElementById("toggle-servers");
const toggleChannelsEl = document.getElementById("toggle-channels");
const toggleHighlightFilterEl = document.getElementById("toggle-highlight-filter");
const mobileMenuToggleEl = document.getElementById("mobile-menu-toggle");
const mobileActionsMenuEl = document.getElementById("mobile-actions-menu");
const toggleSidebarEl = document.getElementById("toggle-sidebar");
const toggleSidebarIconEl = toggleSidebarEl.querySelector(".button-icon");
const openHelpEl = document.getElementById("open-help");
const openSettingsEl = document.getElementById("open-settings");
const closeHelpEl = document.getElementById("close-help");
const closeSettingsEl = document.getElementById("close-settings");
const helpPanelEl = document.getElementById("help-panel");
const settingsPanelEl = document.getElementById("settings-panel");
const helpModalEl = document.getElementById("help-modal");
const settingsModalEl = document.getElementById("settings-modal");
const channelFilterModalEl = document.getElementById("channel-filter-modal");
const tokenInputEl = document.getElementById("token-input");
const guildSelectorEl = document.getElementById("guild-selector");
const webhookInputEl = document.getElementById("webhook-input");
const keywordsInputEl = document.getElementById("keywords-input");
const openChannelFilterEl = document.getElementById("open-channel-filter");
const addGuildMonitorEl = document.getElementById("add-guild-monitor");
const toggleChannelActionsEl = document.getElementById("toggle-channel-actions");
const channelActionsMenuEl = document.getElementById("channel-actions-menu");
const closeChannelFilterEl = document.getElementById("close-channel-filter");
const applyChannelFilterEl = document.getElementById("apply-channel-filter");
const channelFilterTitleEl = document.getElementById("channel-filter-title");
const channelFilterListEl = document.getElementById("channel-filter-list");
const channelWebhookToggleEl = document.getElementById("channel-webhook-toggle");
const saveConfigEl = document.getElementById("save-config");
const stopMonitorEl = document.getElementById("stop-monitor");
const configHelpEl = document.getElementById("config-help");
const monitorBadgeEl = document.getElementById("monitor-badge");
const toggleConfigEl = document.getElementById("toggle-config");
const toggleConfigLabelEl = document.getElementById("toggle-config-label");
const configSummaryEl = document.getElementById("config-summary");
const configSummaryTextEl = document.getElementById("config-summary-text");
const configFormEl = document.getElementById("config-form");
const formatDataToggleEl = document.getElementById("format-data-toggle");
const themeToggleIconEl = document.getElementById("theme-toggle-icon");
const appShellEl = document.querySelector(".app-shell");
const chatPanelEl = document.querySelector(".chat-panel");
const mentionPattern = /(@everyone|@here|@\S+)/g;
const singleMentionPattern = /^(@everyone|@here|@\S+)$/;
let deferredMessageRender = null;

function renderCurrentMessagesWithFilters() {
  if (deferredMessageRender) {
    renderMessages(deferredMessageRender.messages, deferredMessageRender.channels || []);
    return;
  }
  renderMessages(state.loadedMessages || [], state.latestChannels || []);
}

function setButtonLoading(buttonEl, loading) {
  if (!buttonEl) {
    return;
  }
  buttonEl.disabled = Boolean(loading);
  buttonEl.classList.toggle("is-loading", Boolean(loading));
  buttonEl.setAttribute("aria-busy", loading ? "true" : "false");
}

function setMessageViewLoading(loading, label = "Loading messages...") {
  state.messageViewLoading = Boolean(loading);
  chatPanelEl?.classList.toggle("is-message-view-loading", state.messageViewLoading);
  if (messageViewLoadingEl) {
    messageViewLoadingEl.classList.toggle("hidden", !state.messageViewLoading);
    messageViewLoadingEl.setAttribute("aria-hidden", state.messageViewLoading ? "false" : "true");
  }
  if (messageViewLoadingTextEl) {
    messageViewLoadingTextEl.textContent = label;
  }
}

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
  if (themeToggleIconEl) {
    themeToggleIconEl.textContent = state.theme === "light" ? "\u2600" : "\u263E";
  }
  if (themeToggleEl) {
    const nextModeLabel = state.theme === "light" ? "Switch to dark mode" : "Switch to light mode";
    themeToggleEl.setAttribute("aria-label", nextModeLabel);
    themeToggleEl.setAttribute("title", nextModeLabel);
  }
  localStorage.setItem("viewer-theme", state.theme);
}

function applyFormatData(enabled) {
  state.formatData = Boolean(enabled);
  formatDataToggleEl.checked = state.formatData;
  localStorage.setItem("viewer-format-data", state.formatData ? "1" : "0");
}

function applySidebarState(collapsed) {
  state.sidebarCollapsed = Boolean(collapsed);
  appShellEl.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  toggleSidebarIconEl.textContent = state.sidebarCollapsed ? ">" : "<";
  localStorage.setItem("viewer-sidebar-collapsed", state.sidebarCollapsed ? "1" : "0");
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 760px)").matches;
}

function applyMobileServersState(open) {
  const shouldOpen = Boolean(open);
  appShellEl.classList.toggle("mobile-servers-open", shouldOpen);
  if (shouldOpen) {
    appShellEl.classList.remove("mobile-channels-open");
  }
}

function applyMobileChannelsState(open) {
  const shouldOpen = Boolean(open);
  appShellEl.classList.toggle("mobile-channels-open", shouldOpen);
  if (shouldOpen) {
    appShellEl.classList.remove("mobile-servers-open");
  }
}

function applyMobileHeaderMenuState(open) {
  const shouldOpen = Boolean(open);
  state.mobileHeaderMenuOpen = shouldOpen;
  appShellEl.classList.toggle("mobile-header-menu-open", shouldOpen);
  if (mobileMenuToggleEl) {
    mobileMenuToggleEl.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
  }
}

function applyMobileSearchState(open) {
  const shouldOpen = Boolean(open);
  state.mobileSearchOpen = shouldOpen;
  appShellEl.classList.toggle("mobile-search-open", shouldOpen);
  if (mobileSearchToggleEl) {
    mobileSearchToggleEl.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
  }
  if (shouldOpen) {
    setTimeout(() => searchInputEl?.focus(), 130);
  }
}

function cancelMobileSearch() {
  const hadQuery = Boolean(state.searchQuery);
  state.searchQuery = "";
  if (searchInputEl) {
    searchInputEl.value = "";
  }
  applyMobileSearchState(false);
  if (hadQuery) {
    fetchState().catch((error) => {
      statusTextEl.textContent = "Connection issue";
      refreshTextEl.textContent = error.message;
    });
  }
}

function syncHighlightFilterButtons() {
  for (const button of [toggleHighlightFilterEl]) {
    if (!button) {
      continue;
    }
    button.classList.toggle("is-active", state.highlightOnly);
    button.setAttribute("aria-pressed", state.highlightOnly ? "true" : "false");
  }
}

function applyHighlightFilterState(enabled) {
  state.highlightOnly = Boolean(enabled);
  syncHighlightFilterButtons();
}

function applySettingsState(open) {
  state.settingsOpen = Boolean(open);
  settingsModalEl.classList.toggle("hidden", !state.settingsOpen);
  applyChannelActionsMenuState(false);
  applyMobileHeaderMenuState(false);
  if (state.settingsOpen) {
    applyHelpState(false);
    applyChannelFilterState(false);
    applyMobileSearchState(false);
  }
}

function applyHelpState(open) {
  state.helpOpen = Boolean(open);
  helpModalEl.classList.toggle("hidden", !state.helpOpen);
  applyChannelActionsMenuState(false);
  applyMobileHeaderMenuState(false);
  if (state.helpOpen) {
    settingsModalEl.classList.add("hidden");
    channelFilterModalEl.classList.add("hidden");
    state.settingsOpen = false;
    state.channelFilterOpen = false;
    applyMobileSearchState(false);
  }
}

function applyChannelFilterState(open) {
  state.channelFilterOpen = Boolean(open);
  channelFilterModalEl.classList.toggle("hidden", !state.channelFilterOpen);
  applyChannelActionsMenuState(false);
  applyMobileHeaderMenuState(false);
  if (state.channelFilterOpen) {
    applyHelpState(false);
    applySettingsState(false);
    applyMobileSearchState(false);
  }
}

function applyChannelActionsMenuState(open) {
  state.channelActionsMenuOpen = Boolean(open);
  if (channelActionsMenuEl) {
    channelActionsMenuEl.classList.toggle("hidden", !state.channelActionsMenuOpen);
  }
  if (toggleChannelActionsEl) {
    toggleChannelActionsEl.setAttribute("aria-expanded", state.channelActionsMenuOpen ? "true" : "false");
  }
}

function getSelectedGuildIds() {
  return Array.from(guildSelectorEl.querySelectorAll("input[type='checkbox']:checked"))
    .map((input) => input.value)
    .filter(Boolean);
}

function getSelectedGuildIdsForSave() {
  return getEffectiveGuildSelection().map(String);
}

function getChannelIdsForSave() {
  return getEffectiveChannelSelection().map(String);
}

function parseKeywords(rawInput) {
  return (rawInput || "")
    .split(/[\n,]+/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

function hasKeywordMatch(content, keywords) {
  if (!content || !keywords?.length) {
    return false;
  }
  const normalized = String(content).toLowerCase();
  return keywords.some((keyword) => normalized.includes(String(keyword).toLowerCase()));
}

function getEffectiveGuildSelection() {
  return state.guildSelectionDirty ? state.draftGuildIds : state.configuredGuildIds;
}

function getEffectiveChannelSelection() {
  return state.channelSelectionDirty ? state.draftChannelIds : state.configuredChannelIds;
}

function getAvailableChannelMap(monitorGuilds, selectedGuildIds) {
  const selectedSet = new Set((selectedGuildIds || []).map(String));
  const channelMap = new Map();
  for (const guild of monitorGuilds || []) {
    if (!selectedSet.has(String(guild.id))) {
      continue;
    }
    for (const channel of guild.channels || []) {
      channelMap.set(String(channel.id), {
        id: String(channel.id),
        name: channel.name || "unknown-channel",
        guild_id: String(guild.id),
        guild_name: guild.name || "Unknown Server",
        category: channel.category || "No Category",
      });
    }
  }
  return channelMap;
}

function normalizeSelectedChannels(channelIds, monitorGuilds, selectedGuildIds) {
  const channelMap = getAvailableChannelMap(monitorGuilds, selectedGuildIds);
  if (!channelMap.size) {
    return [...channelIds];
  }
  return (channelIds || [])
    .map(String)
    .filter((channelId) => channelMap.has(String(channelId)));
}

function getGuildChannelIds(guildIds, monitorGuilds) {
  const guildIdSet = new Set((guildIds || []).map(String));
  const channelIds = [];
  for (const guild of monitorGuilds || []) {
    if (!guildIdSet.has(String(guild.id))) {
      continue;
    }
    for (const channel of guild.channels || []) {
      channelIds.push(String(channel.id));
    }
  }
  return channelIds;
}

function includeAllChannelsForNewGuilds(nextGuildIds, nextChannelIds, previousGuildIds) {
  const normalizedGuildIds = (nextGuildIds || []).map(String);
  const normalizedChannelIds = (nextChannelIds || []).map(String);
  const previousGuildSet = new Set((previousGuildIds || []).map(String));
  const addedGuildIds = normalizedGuildIds.filter((guildId) => !previousGuildSet.has(guildId));

  if (!addedGuildIds.length || !normalizedChannelIds.length) {
    return normalizedChannelIds;
  }

  const nextChannelSet = new Set(normalizedChannelIds);
  for (const channelId of getGuildChannelIds(addedGuildIds, state.monitorGuilds)) {
    nextChannelSet.add(channelId);
  }

  return Array.from(nextChannelSet);
}

function shouldAutoOpenSettings(config, monitor) {
  const token = String(config?.token || "").trim();
  const guildIds = (config?.guild_ids || []).map((guildId) => String(guildId)).filter(Boolean);
  const monitoredGuilds = (monitor?.guilds || []).filter((guild) => guild.monitored);

  if (!token) {
    return true;
  }

  if (monitor?.running && monitoredGuilds.length > 0) {
    return false;
  }

  return guildIds.length === 0;
}

function refreshConfigVisibility() {
  const guildCount = getEffectiveGuildSelection().length;
  const channelCount = getEffectiveChannelSelection().length;
  const hasConfig = tokenInputEl.value.trim() && guildCount > 0;
  const showCollapsed = hasConfig && !state.configExpanded;

  configSummaryEl.classList.toggle("hidden", !showCollapsed);
  configFormEl.classList.toggle("hidden", showCollapsed);
  toggleConfigEl.classList.toggle("hidden", !hasConfig);
  toggleConfigLabelEl.textContent = showCollapsed ? "Edit" : "Hide";

  if (hasConfig) {
    const channelText = channelCount
      ? `${channelCount} channel${channelCount === 1 ? "" : "s"} selected`
      : "all channels selected";
    const webhookText = state.webhookEnabled ? "webhook alerts enabled" : "webhook alerts disabled";
    configSummaryTextEl.textContent = `Saved token with ${guildCount} guild${guildCount === 1 ? "" : "s"} configured (${channelText}, ${webhookText}).`;
  } else if (tokenInputEl.value.trim()) {
    configSummaryTextEl.textContent = "Token saved. Choose which discovered servers to monitor.";
  }
}

function initialsFromServerName(name) {
  return name
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "SC";
}

function mergeGuilds(logGuilds, monitorGuilds) {
  const guildMap = new Map();

  for (const guild of logGuilds || []) {
    guildMap.set(guild.id, { ...guild });
  }

  for (const guild of monitorGuilds || []) {
    const existing = guildMap.get(String(guild.id)) || guildMap.get(guild.id);
    guildMap.set(String(guild.id), {
      id: String(guild.id),
      name: guild.name || existing?.name || "Unknown Server",
      icon_url: guild.icon_url || existing?.icon_url || null,
    });
  }

  return Array.from(guildMap.values());
}

function compareTimestamps(left, right) {
  const leftMs = Date.parse(left || "");
  const rightMs = Date.parse(right || "");
  const leftIsNum = !Number.isNaN(leftMs);
  const rightIsNum = !Number.isNaN(rightMs);

  if (leftIsNum && rightIsNum) {
    return leftMs - rightMs;
  }
  return String(left || "").localeCompare(String(right || ""));
}

function computeLatestByGuild(channels) {
  const latestByGuild = {};
  for (const channel of channels || []) {
    const guildId = String(channel.guild_id || "");
    if (!guildId) {
      continue;
    }
    const lastTimestamp = channel.last_timestamp || "";
    const existing = latestByGuild[guildId];
    if (!existing || compareTimestamps(lastTimestamp, existing) > 0) {
      latestByGuild[guildId] = lastTimestamp;
    }
  }
  return latestByGuild;
}

function updateUnreadGuilds(channels) {
  const latestByGuild = computeLatestByGuild(channels);
  const selectedGuildId = state.selectedGuild ? String(state.selectedGuild) : null;

  if (!state.unreadTrackingReady) {
    state.guildLatestById = latestByGuild;
    state.unreadTrackingReady = true;
    if (selectedGuildId) {
      state.unreadGuildIds.delete(selectedGuildId);
    }
    return;
  }

  for (const [guildId, latestTimestamp] of Object.entries(latestByGuild)) {
    const previousTimestamp = state.guildLatestById[guildId];
    const hasAdvanced =
      previousTimestamp === undefined
        ? Boolean(latestTimestamp)
        : compareTimestamps(latestTimestamp, previousTimestamp) > 0;

    if (hasAdvanced && guildId !== selectedGuildId) {
      state.unreadGuildIds.add(guildId);
    }
  }

  state.guildLatestById = { ...state.guildLatestById, ...latestByGuild };
  if (selectedGuildId) {
    state.unreadGuildIds.delete(selectedGuildId);
  }
}

function getMonitorGuilds(monitor) {
  return (monitor?.guilds || []).map((guild) => ({
    id: String(guild.id),
    name: guild.name || "Unknown Server",
    icon_url: guild.icon_url || null,
    channels: (guild.channels || []).map((channel) => ({
      id: String(channel.id),
      name: channel.name || "unknown-channel",
      category: channel.category || "No Category",
      monitored: Boolean(channel.monitored),
    })),
  }));
}

function buildGuildSelectorOptions(guilds) {
  const byId = new Map((guilds || []).map((guild) => [String(guild.id), guild]));
  for (const guildId of state.configuredGuildIds) {
    if (!byId.has(String(guildId))) {
      byId.set(String(guildId), {
        id: String(guildId),
        name: `Configured Guild (${guildId})`,
        icon_url: null,
        unavailable: true,
      });
    }
  }
  return Array.from(byId.values());
}

function renderGuildSelector(guilds) {
  guildSelectorEl.innerHTML = "";
  const options = buildGuildSelectorOptions(guilds);
  const selectedGuildIds = new Set(getEffectiveGuildSelection().map(String));

  if (!tokenInputEl.value.trim()) {
    guildSelectorEl.innerHTML = '<p class="sidebar-meta">Save a bot token first to discover available servers.</p>';
    return;
  }

  if (options.length === 0) {
    guildSelectorEl.innerHTML = '<p class="sidebar-meta">No servers discovered yet. Save and start to connect the bot and load its guilds.</p>';
    return;
  }

  for (const guild of options) {
    const option = document.createElement("label");
    option.className = "guild-option";
    option.innerHTML = `
      <input type="checkbox" value="${guild.id}">
      <span class="guild-option-label">
        <span class="guild-option-name"></span>
        <span class="guild-option-meta">${guild.id}</span>
      </span>
    `;
    option.querySelector(".guild-option-name").textContent = guild.name;
    if (guild.unavailable) {
      option.querySelector(".guild-option-meta").textContent = `${guild.id} (currently unavailable)`;
    }
    const input = option.querySelector("input");
    input.checked = selectedGuildIds.has(String(guild.id));
    input.addEventListener("change", () => {
      state.draftGuildIds = getSelectedGuildIds();
      state.guildSelectionDirty = true;
      state.draftChannelIds = normalizeSelectedChannels(
        getEffectiveChannelSelection(),
        state.monitorGuilds,
        state.draftGuildIds,
      );
      state.channelSelectionDirty = true;
      refreshConfigVisibility();
    });
    guildSelectorEl.appendChild(option);
  }
}

function renderChannelFilterModal() {
  channelFilterListEl.innerHTML = "";
  const selectedGuildId = state.selectedGuild ? String(state.selectedGuild) : null;
  const guild = state.monitorGuilds.find((item) => String(item.id) === selectedGuildId);
  if (channelWebhookToggleEl) {
    channelWebhookToggleEl.checked = Boolean(state.webhookEnabled);
  }

  if (!selectedGuildId || !guild) {
    channelFilterTitleEl.textContent = "Select A Server First";
    channelFilterListEl.innerHTML = '<p class="sidebar-meta">Pick a server in the left rail, then open this panel again.</p>';
    applyChannelFilterEl.disabled = true;
    return;
  }

  channelFilterTitleEl.textContent = `Monitored Channels - ${guild.name}`;
  applyChannelFilterEl.disabled = false;
  const selectedSet = new Set(getEffectiveChannelSelection().map(String));

  for (const channel of guild.channels || []) {
    const option = document.createElement("label");
    option.className = "guild-option channel-option";
    option.innerHTML = `
      <input type="checkbox" value="${channel.id}">
      <span class="guild-option-label">
        <span class="guild-option-name"></span>
        <span class="guild-option-meta"></span>
      </span>
    `;
    option.querySelector(".guild-option-name").textContent = `#${channel.name}`;
    option.querySelector(".guild-option-meta").textContent = `${channel.category} (${channel.id})`;
    const input = option.querySelector("input");
    input.checked = selectedSet.has(String(channel.id));
    channelFilterListEl.appendChild(option);
  }
}

function renderServers(guilds) {
  serverListEl.innerHTML = "";

  if (guilds.length === 0) {
    const placeholder = document.createElement("div");
    placeholder.className = "server-avatar";
    placeholder.textContent = "GM";
    serverListEl.appendChild(placeholder);
    return;
  }

  for (const guild of guilds) {
    const button = document.createElement("button");
    button.className = "server-button";
    if (guild.id === state.selectedGuild) {
      button.classList.add("active");
    }

    const avatar = document.createElement("div");
    avatar.className = "server-avatar";
    if (guild.icon_url) {
      const image = document.createElement("img");
      image.src = guild.icon_url;
      image.alt = guild.name;
      avatar.appendChild(image);
    } else {
      avatar.textContent = initialsFromServerName(guild.name);
    }

    button.title = guild.name;
    button.appendChild(avatar);
    const hasUnread = state.unreadGuildIds.has(String(guild.id));
    if (hasUnread) {
      const unreadDot = document.createElement("span");
      unreadDot.className = "server-unread-indicator";
      unreadDot.setAttribute("aria-label", "Unread messages");
      button.appendChild(unreadDot);
    }
    button.addEventListener("click", () => {
      state.selectedGuild = guild.id;
      state.selectedChannel = null;
      state.unreadGuildIds.delete(String(guild.id));
      if (isMobileViewport()) {
        applyMobileServersState(false);
        applyMobileChannelsState(false);
      }
      fetchState();
    });
    serverListEl.appendChild(button);
  }
}

function updateMonitorUI(monitor) {
  const safeMonitor = monitor || {
    running: false,
    error: null,
    guild_ids: [],
    channel_ids: [],
    webhook_configured: false,
    webhook_enabled: false,
    guilds: [],
  };
  const hasConfig = tokenInputEl.value.trim() && getEffectiveGuildSelection().length > 0;
  const selectedGuildId = state.selectedGuild ? String(state.selectedGuild) : null;
  const selectedGuildStatus = (safeMonitor.guilds || []).find(
    (guild) => String(guild.id) === selectedGuildId
  );
  const monitoredGuilds = (safeMonitor.guilds || []).filter((guild) => guild.monitored);
  monitorBadgeEl.classList.remove("live", "error");
  statusDotEl?.classList.remove("muted");
  const shouldShowAddGuildButton = Boolean(
    selectedGuildId &&
    selectedGuildStatus &&
    !selectedGuildStatus.monitored &&
    tokenInputEl.value.trim()
  );
  addGuildMonitorEl?.classList.toggle("hidden", !shouldShowAddGuildButton);

  if (safeMonitor.running && monitoredGuilds.length > 0) {
    const monitoredChannelCount = (safeMonitor.channel_ids || []).length;
    monitorBadgeEl.textContent = "Live";
    monitorBadgeEl.classList.add("live");
    if (selectedGuildId && selectedGuildStatus && !selectedGuildStatus.monitored) {
      statusTextEl.textContent = "Viewing unmonitored server";
      statusDotEl?.classList.add("muted");
    } else {
      statusTextEl.textContent = "Monitoring live";
    }
    const channelInfo = monitoredChannelCount
      ? `${monitoredChannelCount} selected channel${monitoredChannelCount === 1 ? "" : "s"}`
      : "all channels in selected servers";
    const webhookInfo = safeMonitor.webhook_configured && safeMonitor.webhook_enabled
      ? "webhook alerts enabled"
      : "webhook alerts disabled";
    configHelpEl.textContent = `Watching ${monitoredGuilds.length} guild${monitoredGuilds.length === 1 ? "" : "s"} (${channelInfo}, ${webhookInfo}).`;
    refreshConfigVisibility();
    return;
  }

  if (safeMonitor.running) {
    monitorBadgeEl.textContent = "Connected";
    statusTextEl.textContent = hasConfig ? "Connected, no guilds available" : "Connected for discovery";
    configHelpEl.textContent = hasConfig
      ? "The bot is connected, but none of the selected servers are currently available to monitor."
      : "The bot is connected. Choose one or more discovered servers to begin monitoring.";
    refreshConfigVisibility();
    return;
  }

  if (safeMonitor.error) {
    monitorBadgeEl.textContent = "Error";
    monitorBadgeEl.classList.add("error");
    statusTextEl.textContent = "Monitor error";
    configHelpEl.textContent = safeMonitor.error;
    refreshConfigVisibility();
    return;
  }

  monitorBadgeEl.textContent = "Idle";
  statusTextEl.textContent = hasConfig ? "Saved, not running" : "Awaiting setup";
  configHelpEl.textContent = hasConfig
    ? "Saved locally. Press Save and Start to reconnect."
    : "Enter a bot token and select one or more servers to begin.";
  refreshConfigVisibility();
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
  const visibleChannels = channels.filter((channel) => channel.guild_id === state.selectedGuild);
  const groups = groupChannels(visibleChannels);
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
        if (isMobileViewport()) {
          applyMobileChannelsState(false);
        }
        fetchState();
      });
      groupEl.appendChild(button);
    }

    channelGroupsEl.appendChild(groupEl);
  }
}

function renderMessages(messages, channels) {
  const selected = channels.find((channel) => channel.id === state.selectedChannel);
  const selectedGuild = state.guilds.find((guild) => guild.id === state.selectedGuild);
  sidebarGuildTitleEl.textContent = selectedGuild ? selectedGuild.name : "Guild Logs";
  if (state.highlightOnly && selected) {
    channelTitleEl.textContent = `${selected.guild_name} / ${selected.category} / #${selected.name} / Highlights`;
  } else {
    channelTitleEl.textContent = selected
      ? `${selected.guild_name} / ${selected.category} / #${selected.name}`
      : "No channel selected";
  }

  const visibleMessages = messages;
  messageCountEl.textContent = `${visibleMessages.length} result${visibleMessages.length === 1 ? "" : "s"}`;

  const shouldStickToBottom =
    messageListEl.scrollHeight - messageListEl.scrollTop - messageListEl.clientHeight < 80;

  messageListEl.innerHTML = "";

  if (visibleMessages.length === 0) {
    emptyStateEl.classList.remove("hidden");
    return;
  }

  emptyStateEl.classList.add("hidden");

  for (const message of visibleMessages) {
    const row = document.createElement("article");
    const matchKeyword = hasKeywordMatch(message.content, state.keywords);
    row.className = `message-row${message.mentions_me ? " mention-highlight" : ""}${matchKeyword ? " keyword-highlight" : ""}`;
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

function hasProtectedMessageSelection() {
  const selection = window.getSelection?.();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return false;
  }

  const anchorNode = selection.anchorNode?.nodeType === Node.TEXT_NODE
    ? selection.anchorNode.parentNode
    : selection.anchorNode;
  const focusNode = selection.focusNode?.nodeType === Node.TEXT_NODE
    ? selection.focusNode.parentNode
    : selection.focusNode;

  return Boolean(
    anchorNode &&
    focusNode &&
    messageListEl.contains(anchorNode) &&
    messageListEl.contains(focusNode)
  );
}

function flushDeferredMessageRender() {
  if (!deferredMessageRender || hasProtectedMessageSelection()) {
    return;
  }

  renderMessages(deferredMessageRender.messages, deferredMessageRender.channels);
  deferredMessageRender = null;
}

function renderMessageContent(container, content) {
  container.textContent = "";

  if (state.formatData) {
    renderFormattedMessageContent(container, content);
    return;
  }

  renderPlainMessageContent(container, content);
}

function renderFormattedMessageContent(container, content) {
  const segments = content.split(" | ").filter(Boolean);
  let renderedAny = false;

  for (const segment of segments) {
    if (segment.startsWith("[attachments] ")) {
      const attachmentUrls = segment.replace("[attachments] ", "").split(", ").filter(Boolean);
      for (const url of attachmentUrls) {
        const block = document.createElement("div");
        block.className = "message-aux-block";

        const label = document.createElement("span");
        label.className = "message-aux-label";
        label.textContent = "Attachment";

        const link = document.createElement("a");
        link.className = "message-link";
        link.href = url;
        link.target = "_blank";
        link.rel = "noreferrer noopener";
        link.textContent = url;

        block.appendChild(label);
        block.appendChild(link);
        container.appendChild(block);
        renderedAny = true;
      }
      continue;
    }

    if (segment.startsWith("[embeds] ")) {
      const badge = document.createElement("div");
      badge.className = "message-aux-block";

      const label = document.createElement("span");
      label.className = "message-aux-label";
      label.textContent = "Embed";

      const text = document.createElement("span");
      text.textContent = segment.replace("[embeds] ", "");

      badge.appendChild(label);
      badge.appendChild(text);
      container.appendChild(badge);
      renderedAny = true;
      continue;
    }

    const textBlock = document.createElement("div");
    textBlock.className = "message-text-block";
    renderPlainMessageContent(textBlock, segment);
    container.appendChild(textBlock);
    renderedAny = true;
  }

  if (!renderedAny) {
    renderPlainMessageContent(container, content);
  }
}

function renderPlainMessageContent(container, content) {
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

function buildStateRequestParams(options = {}) {
  const { beforeLine = null, limitOverride = null } = options;
  const params = new URLSearchParams();
  if (state.selectedGuild) {
    params.set("guild", state.selectedGuild);
  }
  if (state.highlightOnly && state.selectedChannel) {
    params.set("channel", state.selectedChannel);
    params.set("highlight_only", "1");
    for (const keyword of state.keywords) {
      params.append("keyword", keyword);
    }
  } else if (state.selectedChannel) {
    params.set("channel", state.selectedChannel);
  }
  if (state.searchQuery) {
    params.set("q", state.searchQuery);
  }
  params.set("limit", String(limitOverride || state.messagePageSize));
  if (beforeLine) {
    params.set("before_line", String(beforeLine));
  }
  return params;
}

function currentQueryKey() {
  return [
    state.selectedGuild || "",
    state.highlightOnly ? `__channel_highlights__:${state.selectedChannel || ""}` : (state.selectedChannel || ""),
    state.searchQuery || "",
  ].join("|");
}

function mergeMessages(existing, incoming) {
  const byLine = new Map();
  for (const message of existing) {
    byLine.set(message.line_number, message);
  }
  for (const message of incoming) {
    byLine.set(message.line_number, message);
  }
  return Array.from(byLine.values()).sort((a, b) => a.line_number - b.line_number);
}

function updateLoadedMessageBounds() {
  if (!state.loadedMessages.length) {
    state.oldestLoadedLine = null;
    state.newestLoadedLine = null;
    return;
  }
  state.oldestLoadedLine = state.loadedMessages[0].line_number;
  state.newestLoadedLine = state.loadedMessages[state.loadedMessages.length - 1].line_number;
}

function applyMessagePage(payload, { appendMode = false } = {}) {
  if (!appendMode) {
    state.loadedMessages = payload.messages;
    state.hasMoreOlder = payload.has_more_older;
    updateLoadedMessageBounds();
    return;
  }

  state.loadedMessages = mergeMessages(payload.messages, state.loadedMessages);
  state.hasMoreOlder = payload.has_more_older;
  updateLoadedMessageBounds();
}

async function fetchState(options = {}) {
  const { beforeLine = null, appendMode = false } = options;
  const requestParams = buildStateRequestParams({ beforeLine });
  const response = await fetch(`/api/state?${requestParams.toString()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }

  const payload = await response.json();
  const queryKey = currentQueryKey();
  const selectionChanged = state.queryKey !== queryKey && !appendMode;
  if (selectionChanged) {
    state.loadedMessages = [];
    state.oldestLoadedLine = null;
    state.newestLoadedLine = null;
    state.hasMoreOlder = false;
  }
  state.queryKey = queryKey;

  const monitorGuilds = getMonitorGuilds(payload.monitor);
  state.monitorGuilds = monitorGuilds;
  const guilds = mergeGuilds(payload.guilds, monitorGuilds);
  state.guilds = guilds;
  state.selectedGuild = payload.selected_guild;
  state.selectedChannel = payload.selected_channel;
  updateUnreadGuilds(payload.channels);
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
  renderGuildSelector(monitorGuilds);
  renderServers(guilds);
  renderChannels(payload.channels);
  state.latestChannels = payload.channels;

  if (appendMode) {
    applyMessagePage(payload, { appendMode: true });
  } else {
    state.loadedMessages = mergeMessages(state.loadedMessages, payload.messages);
    if (!state.loadedMessages.length) {
      applyMessagePage(payload);
    } else {
      updateLoadedMessageBounds();
      if (state.hasMoreOlder === false) {
        state.hasMoreOlder = payload.has_more_older;
      } else {
        state.hasMoreOlder = state.hasMoreOlder || payload.has_more_older;
      }
    }
  }

  if (hasProtectedMessageSelection()) {
    deferredMessageRender = {
      messages: state.loadedMessages,
      channels: payload.channels,
    };
    return;
  }

  renderMessages(state.loadedMessages, payload.channels);
  deferredMessageRender = null;
}

async function fetchOlderMessages() {
  if (state.loadingOlder || !state.hasMoreOlder || !state.oldestLoadedLine) {
    return;
  }
  state.loadingOlder = true;
  const previousHeight = messageListEl.scrollHeight;
  const previousTop = messageListEl.scrollTop;

  try {
    await fetchState({
      beforeLine: state.oldestLoadedLine,
      appendMode: true,
    });
    const delta = messageListEl.scrollHeight - previousHeight;
    messageListEl.scrollTop = previousTop + delta;
  } finally {
    state.loadingOlder = false;
  }
}

async function fetchLatestState() {
  await fetchState({ appendMode: false });
}

async function tick() {
  try {
    await fetchLatestState();
  } catch (error) {
    statusTextEl.textContent = "Connection issue";
    refreshTextEl.textContent = error.message;
  }
}

/*
 * Keep history loading lazy: when users scroll near the top, fetch older chunks.
 */
messageListEl.addEventListener("scroll", () => {
  if (messageListEl.scrollTop < 140) {
    fetchOlderMessages().catch((error) => {
      statusTextEl.textContent = "Connection issue";
      refreshTextEl.textContent = error.message;
    });
  }
});

async function fetchConfig() {
  const response = await fetch("/api/config", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Config request failed with ${response.status}`);
  }

  const payload = await response.json();
  tokenInputEl.value = payload.config.token || "";
  state.configuredGuildIds = (payload.config.guild_ids || []).map((guildId) => String(guildId));
  state.configuredChannelIds = (payload.config.channel_ids || []).map((channelId) => String(channelId));
  state.draftGuildIds = [...state.configuredGuildIds];
  state.draftChannelIds = [...state.configuredChannelIds];
  state.guildSelectionDirty = false;
  state.channelSelectionDirty = false;
  state.webhookUrl = payload.config.webhook_url || "";
  state.webhookEnabled = Boolean(payload.config.webhook_enabled);
  state.keywords = (payload.config.keywords || []).map((keyword) => String(keyword).trim()).filter(Boolean);
  webhookInputEl.value = state.webhookUrl;
  keywordsInputEl.value = state.keywords.join(", ");
  if (channelWebhookToggleEl) {
    channelWebhookToggleEl.checked = state.webhookEnabled;
  }
  state.configExpanded = !(payload.config.token && (payload.config.guild_ids || []).length > 0);
  applySettingsState(shouldAutoOpenSettings(payload.config, payload.monitor));
  updateMonitorUI(payload.monitor);
  const monitorGuilds = getMonitorGuilds(payload.monitor);
  state.monitorGuilds = monitorGuilds;
  renderGuildSelector(monitorGuilds);
}

async function saveConfigAndStart() {
  const guildIds = getSelectedGuildIdsForSave();
  const previousGuildIds = [...state.configuredGuildIds];
  const channelIds = includeAllChannelsForNewGuilds(
    guildIds,
    getChannelIdsForSave(),
    previousGuildIds,
  );
  const webhookUrl = webhookInputEl.value.trim();
  const webhookEnabled = Boolean(state.webhookEnabled);
  const keywords = parseKeywords(keywordsInputEl.value);

  const response = await fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: tokenInputEl.value.trim(),
      guild_ids: guildIds,
      channel_ids: channelIds,
      webhook_url: webhookUrl,
      webhook_enabled: webhookEnabled,
      keywords,
      start_monitor: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Save failed with ${response.status}`);
  }

  const payload = await response.json();
  state.configuredGuildIds = guildIds;
  state.configuredChannelIds = channelIds;
  state.draftGuildIds = [...guildIds];
  state.draftChannelIds = [...channelIds];
  state.guildSelectionDirty = false;
  state.channelSelectionDirty = false;
  state.webhookUrl = webhookUrl;
  state.webhookEnabled = webhookEnabled;
  state.keywords = keywords;
  state.configExpanded = false;
  applySettingsState(false);
  updateMonitorUI(payload.monitor);
}

async function addSelectedGuildToMonitoring() {
  const selectedGuildId = state.selectedGuild ? String(state.selectedGuild) : null;
  if (!selectedGuildId) {
    return;
  }

  const nextGuildSet = new Set(getEffectiveGuildSelection().map(String));
  nextGuildSet.add(selectedGuildId);
  state.draftGuildIds = Array.from(nextGuildSet);
  state.configuredGuildIds = [...state.draftGuildIds];
  state.guildSelectionDirty = false;
  await saveConfigAndStart();
}

async function saveChannelFilterFromModal() {
  const selectedGuildId = state.selectedGuild ? String(state.selectedGuild) : null;
  if (!selectedGuildId) {
    return;
  }

  const guild = state.monitorGuilds.find((item) => String(item.id) === selectedGuildId);
  if (!guild) {
    return;
  }

  const selectedForGuild = new Set(
    Array.from(channelFilterListEl.querySelectorAll("input[type='checkbox']:checked"))
      .map((input) => String(input.value))
      .filter(Boolean)
  );

  const allGuildChannelIds = new Set((guild.channels || []).map((channel) => String(channel.id)));
  const nextSelected = new Set(getEffectiveChannelSelection().map(String));
  for (const channelId of allGuildChannelIds) {
    nextSelected.delete(channelId);
  }
  for (const channelId of selectedForGuild) {
    nextSelected.add(channelId);
  }

  state.draftChannelIds = Array.from(nextSelected);
  state.configuredChannelIds = [...state.draftChannelIds];
  state.channelSelectionDirty = false;
  if (channelWebhookToggleEl) {
    state.webhookEnabled = Boolean(channelWebhookToggleEl.checked);
  }

  await saveConfigAndStart();
  applyChannelFilterState(false);
}

async function stopMonitor() {
  const response = await fetch("/api/monitor/stop", { method: "POST" });
  if (!response.ok) {
    throw new Error(`Stop failed with ${response.status}`);
  }

  const payload = await response.json();
  updateMonitorUI(payload.monitor);
}

// Legacy function retained temporarily for patch context; do not call.

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
  applyMobileHeaderMenuState(false);
});

saveConfigEl.addEventListener("click", () => {
  setButtonLoading(saveConfigEl, true);
  saveConfigAndStart()
    .catch((error) => {
      monitorBadgeEl.textContent = "Error";
      monitorBadgeEl.classList.remove("live");
      monitorBadgeEl.classList.add("error");
      configHelpEl.textContent = error.message;
    })
    .finally(() => {
      setButtonLoading(saveConfigEl, false);
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

toggleConfigEl.addEventListener("click", () => {
  state.configExpanded = !state.configExpanded;
  if (!state.configExpanded && !state.guildSelectionDirty) {
    state.draftGuildIds = [...state.configuredGuildIds];
  }
  refreshConfigVisibility();
});

tokenInputEl.addEventListener("input", () => {
  renderGuildSelector(state.monitorGuilds);
  refreshConfigVisibility();
});

webhookInputEl.addEventListener("input", () => {
  refreshConfigVisibility();
});

formatDataToggleEl.addEventListener("change", (event) => {
  applyFormatData(event.target.checked);
  fetchState().catch((error) => {
    statusTextEl.textContent = "Connection issue";
    refreshTextEl.textContent = error.message;
  });
});

toggleSidebarEl.addEventListener("click", () => {
  applySidebarState(!state.sidebarCollapsed);
});

toggleServersEl.addEventListener("click", () => {
  applyMobileServersState(!appShellEl.classList.contains("mobile-servers-open"));
  applyMobileHeaderMenuState(false);
  applyMobileSearchState(false);
});

toggleChannelsEl.addEventListener("click", () => {
  applyMobileChannelsState(!appShellEl.classList.contains("mobile-channels-open"));
  applyMobileHeaderMenuState(false);
  applyMobileSearchState(false);
});

function handleHighlightFilterToggle() {
  const nextHighlightState = !state.highlightOnly;
  applyHighlightFilterState(nextHighlightState);
  setMessageViewLoading(true, nextHighlightState ? "Loading highlights..." : "Loading messages...");
  applyMobileHeaderMenuState(false);
  applyMobileSearchState(false);
  fetchState().catch((error) => {
    statusTextEl.textContent = "Connection issue";
    refreshTextEl.textContent = error.message;
  }).finally(() => {
    setMessageViewLoading(false);
  });
}

if (toggleHighlightFilterEl) {
  toggleHighlightFilterEl.addEventListener("click", handleHighlightFilterToggle);
}

document.addEventListener("click", (event) => {
  const target = event.target?.closest?.("#toggle-highlight-filter");
  if (!target) {
    return;
  }
  if (toggleHighlightFilterEl && target === toggleHighlightFilterEl) {
    return;
  }
  handleHighlightFilterToggle();
});

openSettingsEl.addEventListener("click", () => {
  applySettingsState(!state.settingsOpen);
});

closeSettingsEl.addEventListener("click", () => {
  applySettingsState(false);
});

openHelpEl.addEventListener("click", () => {
  applyHelpState(!state.helpOpen);
});

closeHelpEl.addEventListener("click", () => {
  applyHelpState(false);
});

if (openChannelFilterEl) {
  openChannelFilterEl.addEventListener("click", () => {
    applyChannelActionsMenuState(false);
    renderChannelFilterModal();
    applyChannelFilterState(true);
  });
}

if (addGuildMonitorEl) {
  addGuildMonitorEl.addEventListener("click", () => {
    applyChannelActionsMenuState(false);
    addSelectedGuildToMonitoring().catch((error) => {
      monitorBadgeEl.textContent = "Error";
      monitorBadgeEl.classList.remove("live");
      monitorBadgeEl.classList.add("error");
      configHelpEl.textContent = error.message;
    });
  });
}

if (toggleChannelActionsEl) {
  toggleChannelActionsEl.addEventListener("click", () => {
    applyChannelActionsMenuState(!state.channelActionsMenuOpen);
  });
}

if (mobileMenuToggleEl) {
  mobileMenuToggleEl.addEventListener("click", () => {
    applyMobileHeaderMenuState(!state.mobileHeaderMenuOpen);
    applyMobileSearchState(false);
  });
}

if (mobileSearchToggleEl) {
  mobileSearchToggleEl.addEventListener("click", () => {
    applyMobileSearchState(!state.mobileSearchOpen);
    applyMobileHeaderMenuState(false);
  });
}

if (cancelMobileSearchEl) {
  cancelMobileSearchEl.addEventListener("click", () => {
    cancelMobileSearch();
  });
}

closeChannelFilterEl.addEventListener("click", () => {
  applyChannelFilterState(false);
});

applyChannelFilterEl.addEventListener("click", () => {
  setButtonLoading(applyChannelFilterEl, true);
  saveChannelFilterFromModal()
    .catch((error) => {
      configHelpEl.textContent = error.message;
      applyChannelFilterState(false);
    })
    .finally(() => {
      setButtonLoading(applyChannelFilterEl, false);
    });
});

settingsModalEl.addEventListener("click", (event) => {
  if (event.target === settingsModalEl) {
    applySettingsState(false);
  }
});

helpModalEl.addEventListener("click", (event) => {
  if (event.target === helpModalEl) {
    applyHelpState(false);
  }
});

channelFilterModalEl.addEventListener("click", (event) => {
  if (event.target === channelFilterModalEl) {
    applyChannelFilterState(false);
  }
});

document.addEventListener("click", (event) => {
  if (!state.channelActionsMenuOpen || !channelActionsMenuEl || !toggleChannelActionsEl) {
    return;
  }
  const target = event.target;
  if (channelActionsMenuEl.contains(target) || toggleChannelActionsEl.contains(target)) {
    return;
  }
  applyChannelActionsMenuState(false);
});

document.addEventListener("click", (event) => {
  if (!state.mobileHeaderMenuOpen || !isMobileViewport() || !mobileActionsMenuEl || !mobileMenuToggleEl) {
    return;
  }
  const target = event.target;
  if (mobileActionsMenuEl.contains(target) || mobileMenuToggleEl.contains(target)) {
    return;
  }
  applyMobileHeaderMenuState(false);
});

document.addEventListener("click", (event) => {
  if (!state.mobileSearchOpen || !isMobileViewport() || !searchWrapEl || !mobileSearchToggleEl) {
    return;
  }
  const target = event.target;
  if (searchWrapEl.contains(target) || mobileSearchToggleEl.contains(target)) {
    return;
  }
  applyMobileSearchState(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  if (state.channelActionsMenuOpen) {
    applyChannelActionsMenuState(false);
    return;
  }

  if (state.mobileHeaderMenuOpen) {
    applyMobileHeaderMenuState(false);
    return;
  }

  if (state.mobileSearchOpen && isMobileViewport()) {
    applyMobileSearchState(false);
    return;
  }

  if (state.helpOpen) {
    applyHelpState(false);
    return;
  }

  if (state.settingsOpen) {
    applySettingsState(false);
    return;
  }

  if (state.channelFilterOpen) {
    applyChannelFilterState(false);
  }
});

document.addEventListener("selectionchange", () => {
  flushDeferredMessageRender();
});

window.addEventListener("resize", () => {
  applyChannelActionsMenuState(false);
  if (!isMobileViewport()) {
    applyMobileHeaderMenuState(false);
    applyMobileSearchState(false);
    applyMobileServersState(false);
    applyMobileChannelsState(false);
  }
});

applyTheme(localStorage.getItem("viewer-theme") || "dark");
applyFormatData(localStorage.getItem("viewer-format-data") !== "0");
syncHighlightFilterButtons();
applySidebarState(localStorage.getItem("viewer-sidebar-collapsed") === "1");
applyHelpState(false);
applySettingsState(false);
applyChannelFilterState(false);
applyChannelActionsMenuState(false);
applyMobileHeaderMenuState(false);
applyMobileSearchState(false);
fetchConfig().catch((error) => {
  configHelpEl.textContent = error.message;
});
tick();
setInterval(tick, 2000);
