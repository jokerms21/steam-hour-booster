// Theme
const themeToggle = document.getElementById("theme-toggle");
const themeToggleM = document.getElementById("theme-toggle-m");
const savedTheme = localStorage.getItem("theme") || "dark";
if (savedTheme === "light") {
	document.body.classList.add("light-theme");
	if (themeToggle) themeToggle.textContent = "🌙";
	if (themeToggleM) themeToggleM.textContent = "🌙";
}

function toggleTheme() {
	const isLight = document.body.classList.toggle("light-theme");
	const icon = isLight ? "🌙" : "☀️";
	if (themeToggle) themeToggle.textContent = icon;
	if (themeToggleM) themeToggleM.textContent = icon;
	localStorage.setItem("theme", isLight ? "light" : "dark");
}

if (themeToggle) themeToggle.addEventListener("click", toggleTheme);
if (themeToggleM) themeToggleM.addEventListener("click", toggleTheme);

const grid = document.getElementById("accounts-grid");
const onlineCount = document.getElementById("online-count");
const totalCount = document.getElementById("total-count");
const logsList = document.getElementById("logs-list");
const logFilter = document.getElementById("log-filter");
const logFilterUser = document.getElementById("log-filter-user");
const logFilterM = document.getElementById("log-filter-m");
const logFilterUserM = document.getElementById("log-filter-user-m");
const addBtn = document.getElementById("add-account-btn");
const pauseAllBtn = document.getElementById("pause-all-btn");
const resumeAllBtn = document.getElementById("resume-all-btn");
const bulkActions = document.getElementById("bulk-actions");
const selectedCount = document.getElementById("selected-count");
const bulkPauseBtn = document.getElementById("bulk-pause-btn");
const bulkResumeBtn = document.getElementById("bulk-resume-btn");
const bulkDeleteBtn = document.getElementById("bulk-delete-btn");
const bulkDeselectBtn = document.getElementById("bulk-deselect-btn");
const modalOverlay = document.getElementById("modal-overlay");
const modalTitle = document.getElementById("modal-title");
const modalClose = document.getElementById("modal-close");
const modalBack = document.getElementById("modal-back");
const form = document.getElementById("account-form");
const formUsername = document.getElementById("form-username");
const formPassword = document.getElementById("form-password");
const formGames = document.getElementById("form-games");
const gamesTagsContainer = document.getElementById("games-tags-container");
const gamesTags = document.getElementById("games-tags");
const formLoginMethod = document.getElementById("form-loginMethod");
const loginMethodBtns = document.querySelectorAll(".login-method-btn");
const formOnline = document.getElementById("form-online");
const formCancel = document.getElementById("form-cancel");
const formNext = document.getElementById("form-next");
const formBack = document.getElementById("form-back");
const formSave = document.getElementById("form-save");
const passwordGroup = document.querySelector(".password-group");
const gameSearch = document.getElementById("game-search");
const gameSearchResults = document.getElementById("game-search-results");
const wizardSteps = document.getElementById("wizard-steps");
const bugReportBtn = document.getElementById("bug-report-btn");
const bugReportBtnM = document.getElementById("bug-report-btn-m");

let gameIds = [];
const MAX_GAMES = 32;
const gamesCount = document.getElementById("games-count");
const selectedAccounts = new Set();

const gameSearchBtn = document.getElementById("game-search-btn");

// ---- FAB ----
const fab = document.getElementById("fab");
const fabToggle = document.getElementById("fab-toggle");
const fabMenu = document.getElementById("fab-menu");
const fabAdd = document.getElementById("fab-add");
const fabPauseAll = document.getElementById("fab-pause-all");
const fabResumeAll = document.getElementById("fab-resume-all");

if (fabToggle) {
	fabToggle.addEventListener("click", () => {
		fabToggle.classList.toggle("open");
		fabMenu.classList.toggle("hidden");
	});

	fabAdd.addEventListener("click", () => {
		fabToggle.click();
		openModal();
	});

	fabPauseAll.addEventListener("click", async () => {
		fabToggle.click();
		await fetch("/api/bot/pause-all", { method: "POST" });
	});

	fabResumeAll.addEventListener("click", async () => {
		fabToggle.click();
		await fetch("/api/bot/resume-all", { method: "POST" });
	});

	document.addEventListener("click", (e) => {
		if (!fab.contains(e.target)) {
			fabToggle.classList.remove("open");
			fabMenu.classList.add("hidden");
		}
	});
}

// ---- Logs Accordion ----
const logsPanel = document.getElementById("logs-panel");
const logsHeader = document.getElementById("logs-header");
const logsToggleIcon = document.getElementById("logs-toggle-icon");

// Auto-collapse logs on mobile
if (logsPanel && window.innerWidth <= 768) {
	logsPanel.classList.add("collapsed");
}

if (logsHeader) {
	logsHeader.addEventListener("click", (e) => {
		if (e.target.closest("select") || e.target.closest(".btn-icon")) return;
		logsPanel.classList.toggle("collapsed");
	});
}

// Sync mobile filters with desktop filters
function syncFilters() {
	if (logFilterM) logFilterM.value = logFilter.value;
	if (logFilterUserM) logFilterUserM.value = logFilterUser.value;
}

if (logFilterM) {
	logFilterM.addEventListener("change", () => {
		logFilter.value = logFilterM.value;
		renderLogs();
	});
}
if (logFilterUserM) {
	logFilterUserM.addEventListener("change", () => {
		logFilterUser.value = logFilterUserM.value;
		renderLogs();
	});
}

// ---- Bottom Sheet ----
let bsUsername = null;

const bsOverlay = document.getElementById("bottom-sheet-overlay");
const bsUsernameEl = document.getElementById("bottom-sheet-username");
const bsEdit = document.getElementById("bs-edit");
const bsQrLogin = document.getElementById("bs-qr-login");
const bsDelete = document.getElementById("bs-delete");

function closeBottomSheet() {
	if (bsOverlay) bsOverlay.classList.add("hidden");
	bsUsername = null;
}

function openBottomSheet(username) {
	bsUsername = username;
	if (bsUsernameEl) bsUsernameEl.textContent = username;

	// Show/hide QR Login based on account's loginMethod
	const acc = lastAccounts?.find(
		(a) => a.username.toLowerCase() === username.toLowerCase(),
	);
	if (bsQrLogin) {
		bsQrLogin.classList.toggle("hidden", acc?.loginMethod !== "qrcode");
	}

	if (bsOverlay) bsOverlay.classList.remove("hidden");
}

if (bsOverlay) {
	bsOverlay.addEventListener("click", (e) => {
		if (e.target === bsOverlay) closeBottomSheet();
	});
}

if (bsEdit) {
	bsEdit.addEventListener("click", () => {
		const u = bsUsername;
		closeBottomSheet();
		if (u) openModal(u);
	});
}

if (bsQrLogin) {
	bsQrLogin.addEventListener("click", () => {
		const u = bsUsername;
		closeBottomSheet();
		if (u) window.startQRLogin(u);
	});
}

if (bsDelete) {
	bsDelete.addEventListener("click", () => {
		const u = bsUsername;
		closeBottomSheet();
		if (u) openConfirmDialog(u);
	});
}

// ---- Delete Confirmation ----
let confirmUsername = null;
const confirmOverlay = document.getElementById("confirm-overlay");
const confirmUsernameEl = document.getElementById("confirm-username");
const confirmCancel = document.getElementById("confirm-cancel");
const confirmDelete = document.getElementById("confirm-delete");

function openConfirmDialog(username) {
	confirmUsername = username;
	if (confirmUsernameEl) confirmUsernameEl.textContent = username;
	if (confirmOverlay) confirmOverlay.classList.remove("hidden");
}

function closeConfirmDialog() {
	if (confirmOverlay) confirmOverlay.classList.add("hidden");
	confirmUsername = null;
}

if (confirmOverlay) {
	confirmOverlay.addEventListener("click", (e) => {
		if (e.target === confirmOverlay) closeConfirmDialog();
	});
}

if (confirmCancel) {
	confirmCancel.addEventListener("click", closeConfirmDialog);
}

if (confirmDelete) {
	confirmDelete.addEventListener("click", async () => {
		const u = confirmUsername;
		closeConfirmDialog();
		if (u) {
			const res = await fetch(`/api/accounts/${encodeURIComponent(u)}`, {
				method: "DELETE",
			});
			const data = await res.json();
			if (data.ok) {
				addLog({
					level: "info",
					time: fmtTime(),
					user: u,
					msg: "Account deleted",
				});
			} else {
				addLog({
					level: "error",
					time: fmtTime(),
					user: u,
					msg: data.error,
				});
			}
		}
	});
}

// ---- Game Search ----
async function doGameSearch() {
	const query = gameSearch.value.trim();
	if (query.length < 2) {
		gameSearchResults.innerHTML = `<div class="game-search-item" style="color:var(--text-muted);cursor:default">Type at least 2 characters</div>`;
		gameSearchResults.classList.remove("hidden");
		return;
	}
	gameSearchResults.innerHTML = `<div class="game-search-item" style="color:var(--text-muted);cursor:default">Searching...</div>`;
	gameSearchResults.classList.remove("hidden");
	try {
		const resp = await fetch(
			`/api/games/search?q=${encodeURIComponent(query)}`,
		);
		if (!resp.ok) {
			console.error("[Search] HTTP", resp.status, resp.statusText);
			gameSearchResults.innerHTML = `<div class="game-search-item" style="color:var(--red);cursor:default">Server error ${resp.status} — restart the server</div>`;
			return;
		}
		const data = await resp.json();
		if (data.games.length === 0) {
			gameSearchResults.innerHTML = `<div class="game-search-item" style="color:var(--text-muted);cursor:default">No results found</div>`;
			return;
		}
		gameSearchResults.innerHTML = data.games
			.map(
				(g) =>
					`<div class="game-search-item" data-appid="${g.appid}"><span>${g.name}</span><span class="appid">${g.appid}</span></div>`,
			)
			.join("");
	} catch {
		gameSearchResults.innerHTML = `<div class="game-search-item" style="color:var(--red);cursor:default">Search failed</div>`;
	}
}

if (gameSearchBtn) gameSearchBtn.addEventListener("click", doGameSearch);

if (gameSearch) {
	gameSearch.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			doGameSearch();
		}
	});
}

if (gameSearchResults) {
	gameSearchResults.addEventListener("click", (e) => {
		const item = e.target.closest(".game-search-item");
		if (!item) return;
		const appid = Number(item.dataset.appid);
		if (appid > 0 && !gameIds.includes(appid) && gameIds.length < MAX_GAMES) {
			gameIds.push(appid);
			renderGameTags();
		}
		gameSearch.value = "";
		gameSearchResults.classList.add("hidden");
	});
}

document.addEventListener("click", (e) => {
	if (!e.target.closest(".game-search-wrapper")) {
		if (gameSearchResults) gameSearchResults.classList.add("hidden");
	}
});

function togglePasswordField() {
	if (passwordGroup) {
		passwordGroup.style.display =
			formLoginMethod.value === "qrcode" ? "none" : "";
	}
}

for (const btn of loginMethodBtns) {
	btn.addEventListener("click", () => {
		for (const b of loginMethodBtns) b.classList.remove("active");
		btn.classList.add("active");
		formLoginMethod.value = btn.dataset.method;
		togglePasswordField();
	});
}

// Schedule toggle
const scheduleEnabled = document.getElementById("form-schedule-enabled");
const scheduleFields = document.getElementById("schedule-fields");

if (scheduleEnabled) {
	scheduleEnabled.addEventListener("change", () => {
		scheduleFields.classList.toggle("hidden", !scheduleEnabled.checked);
	});
}

function renderGameTags() {
	if (!gamesTags) return;
	gamesTags.innerHTML = gameIds
		.map(
			(id, i) =>
				`<span class="game-tag-input" draggable="true" data-idx="${i}"><span class="game-tag-drag">⠿</span>${id}<span class="game-tag-remove" onclick="removeGameTag(${id})">&times;</span></span>`,
		)
		.join("");
	if (gamesCount) gamesCount.textContent = `${gameIds.length}/${MAX_GAMES}`;
	if (formGames) formGames.disabled = gameIds.length >= MAX_GAMES;

	let dragIdx = null;
	for (const tag of gamesTags.querySelectorAll(".game-tag-input")) {
		tag.addEventListener("dragstart", (e) => {
			dragIdx = Number(tag.dataset.idx);
			tag.classList.add("dragging");
			e.dataTransfer.effectAllowed = "move";
		});
		tag.addEventListener("dragend", () => {
			tag.classList.remove("dragging");
			dragIdx = null;
		});
		tag.addEventListener("dragover", (e) => {
			e.preventDefault();
			e.dataTransfer.dropEffect = "move";
		});
		tag.addEventListener("drop", (e) => {
			e.preventDefault();
			const dropIdx = Number(tag.dataset.idx);
			if (dragIdx !== null && dragIdx !== dropIdx) {
				const item = gameIds.splice(dragIdx, 1)[0];
				gameIds.splice(dropIdx, 0, item);
				renderGameTags();
			}
		});
	}
}

window.removeGameTag = (id) => {
	gameIds = gameIds.filter((g) => g !== id);
	renderGameTags();
};

if (gamesTagsContainer) {
	gamesTagsContainer.addEventListener("click", () => {
		if (formGames && !formGames.disabled) formGames.focus();
	});
}

if (formGames) {
	formGames.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			const val = Number(formGames.value.trim());
			if (val > 0 && !gameIds.includes(val) && gameIds.length < MAX_GAMES) {
				gameIds.push(val);
				renderGameTags();
			}
			formGames.value = "";
		}

		if (e.key === "Backspace" && formGames.value === "" && gameIds.length > 0) {
			gameIds.pop();
			renderGameTags();
		}
	});
}

const qrOverlay = document.getElementById("qr-overlay");
const qrClose = document.getElementById("qr-close");
const qrUsername = document.getElementById("qr-username");
const qrImage = document.getElementById("qr-image");
const qrStatus = document.getElementById("qr-status");
const qrTimer = document.getElementById("qr-timer");

const sgOverlay = document.getElementById("sg-overlay");
const sgUsername = document.getElementById("sg-username");
const sgCode = document.getElementById("sg-code");
const sgError = document.getElementById("sg-error");
const sgSubmit = document.getElementById("sg-submit");
const sgConsole = document.getElementById("sg-console");

let lastAccounts = null;
const MAX_LOGS = 200;
const logs = [];
let editingUsername = null;
let qrCountdown = null;
let wizardStep = 1;

// ---- Wizard Navigation ----
function setWizardStep(step) {
	wizardStep = step;
	const panels = document.querySelectorAll(".wizard-panel");
	const steps = document.querySelectorAll(".wizard-step");
	const connectors = document.querySelectorAll(".wizard-connector");

	panels.forEach((p, i) => {
		p.classList.toggle("active", i + 1 === step);
	});

	steps.forEach((s, i) => {
		s.classList.remove("active", "done");
		if (i + 1 < step) s.classList.add("done");
		if (i + 1 === step) s.classList.add("active");
	});

	// Update connectors
	connectors.forEach((c, i) => {
		c.style.background = i + 1 < step ? "var(--green)" : "var(--border)";
	});

	// Show/hide buttons
	const isLast = step === 3;
	const isFirst = step === 1;

	if (modalBack) modalBack.classList.toggle("hidden", isFirst);
	if (formBack) formBack.classList.toggle("hidden", isFirst);
	if (formNext) formNext.classList.toggle("hidden", isLast);
	if (formSave) formSave.classList.toggle("hidden", !isLast);
}

if (formNext) {
	formNext.addEventListener("click", () => {
		if (wizardStep < 3) setWizardStep(wizardStep + 1);
	});
}

if (formBack) {
	formBack.addEventListener("click", () => {
		if (wizardStep > 1) setWizardStep(wizardStep - 1);
	});
}

if (modalBack) {
	modalBack.addEventListener("click", () => {
		if (wizardStep > 1) setWizardStep(wizardStep - 1);
	});
}

// ---- Render Accounts ----
function renderAccounts(accounts) {
	lastAccounts = accounts;
	if (!grid) return;
	grid.innerHTML = accounts
		.map(
			(a) => `
		<div class="account-card" data-username="${a.username}">
			<input type="checkbox" class="account-select" data-username="${a.username}" ${selectedAccounts.has(a.username) ? "checked" : ""}>
			<div class="kebab-wrapper">
				<button class="kebab-btn" onclick="openBottomSheet('${a.username}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></button>
			</div>
			<div class="account-header">
				<div class="account-header-left">
					<div class="account-avatar">${a.username.charAt(0)}</div>
					<span class="account-name">${a.username}</span>
				</div>
				<span class="status-badge ${a.paused ? "Paused" : a.status}">${a.paused ? "Paused" : a.status}</span>
			</div>
			${a.paused && a.pauseReason ? `<div class="pause-reason">${a.pauseReason}</div>` : ""}
			<div class="account-meta">
				<span><span class="meta-icon">🕐</span> ${a.uptime}</span>
			</div>
			${
				a.games.length > 0
					? `<div class="games-list"><span class="game-tag-icon">🎮</span>${a.games.map((g) => `<span class="game-tag">${g.name || g.appid}</span>`).join("")}</div>`
					: ""
			}
			<div class="account-actions">
				<div class="actions-primary">
					${
						a.status === "Playing" || a.paused
							? a.paused
								? `<button class="btn primary btn-sm" onclick="resumeBot('${a.username}')">▶ Resume</button>`
								: `<button class="btn warning btn-sm" onclick="pauseBot('${a.username}')">⏸ Pause</button>`
							: ""
					}
				</div>
				<div class="actions-secondary desktop-card-actions">
					<button class="btn-icon-sm" onclick="editAccount('${a.username}')" title="Edit"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
					${a.loginMethod === "qrcode" ? `<button class="btn-icon-sm" onclick="startQRLogin('${a.username}')" title="QR Login"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg></button>` : ""}
					<button class="btn-icon-sm danger" onclick="deleteAccount('${a.username}')" title="Delete"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
				</div>
			</div>
		</div>
	`,
		)
		.join("");

	for (const cb of grid.querySelectorAll(".account-select")) {
		cb.addEventListener("change", (e) => {
			const username = e.target.dataset.username;
			if (e.target.checked) {
				selectedAccounts.add(username);
			} else {
				selectedAccounts.delete(username);
			}
			updateBulkActions();
		});
	}

	const online = accounts.filter((a) => a.status === "Playing").length;
	if (onlineCount) onlineCount.textContent = online;
	if (totalCount) totalCount.textContent = accounts.length;
	updateUserFilter(accounts);
}

function updateBulkActions() {
	const count = selectedAccounts.size;
	if (bulkActions) bulkActions.classList.toggle("hidden", count === 0);
	if (selectedCount) selectedCount.textContent = `${count} selected`;
}

window.pauseBot = async (username) => {
	await fetch("/api/bot/pause", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ username }),
	});
};

window.resumeBot = async (username) => {
	await fetch("/api/bot/resume", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ username }),
	});
};

function addLog(entry) {
	logs.push(entry);
	if (logs.length > MAX_LOGS) logs.shift();
	renderLogs();
}

function renderLogs() {
	const filter = logFilter ? logFilter.value : "all";
	const userFilter = logFilterUser ? logFilterUser.value : "all";
	const filtered = logs.filter((l) => {
		if (filter !== "all" && l.level !== filter) return false;
		if (userFilter !== "all" && l.user !== userFilter) return false;
		return true;
	});

	if (logsList) {
		logsList.innerHTML = filtered
			.map(
				(l) =>
					`<div class="log-entry"><span class="log-time">[${l.time}]</span><span class="log-user">[${l.user}]</span><span class="log-level ${l.level}">[${l.level.toUpperCase()}]</span><span class="log-msg">${escapeHtml(l.msg)}</span></div>`,
			)
			.join("");
		logsList.scrollTop = logsList.scrollHeight;
	}

	syncFilters();
}

function escapeHtml(str) {
	const div = document.createElement("div");
	div.textContent = str;
	return div.innerHTML;
}

function updateUserFilter(accounts) {
	const current = logFilterUser ? logFilterUser.value : "all";
	const usernames = accounts.map((a) => a.username);

	function populate(select) {
		if (!select) return;
		const prev = select.value;
		select.innerHTML = '<option value="all">All accounts</option>';
		for (const u of usernames) {
			const opt = document.createElement("option");
			opt.value = u;
			opt.textContent = u;
			select.appendChild(opt);
		}
		if (usernames.includes(prev)) select.value = prev;
	}

	populate(logFilterUser);
	populate(logFilterUserM);
}

// ---- Account Modal ----
function openModal(username) {
	editingUsername = username || null;
	wizardStep = 1;
	setWizardStep(1);

	if (modalTitle)
		modalTitle.textContent = username ? "Edit Account" : "Add Account";

	if (username) {
		fetch("/api/accounts")
			.then((r) => r.json())
			.then((accounts) => {
				const acc = accounts.find(
					(a) => a.username.toLowerCase() === username.toLowerCase(),
				);
				if (acc) {
					if (formUsername) {
						formUsername.value = acc.username;
						formUsername.disabled = true;
					}
					if (formPassword) {
						formPassword.value = "";
						formPassword.placeholder = "Enter new password (or leave blank)";
					}
					gameIds = acc.games.map(Number);
					renderGameTags();
					formLoginMethod.value = acc.loginMethod;
					for (const b of loginMethodBtns) {
						b.classList.toggle("active", b.dataset.method === acc.loginMethod);
					}
					if (formOnline) formOnline.value = String(acc.online);
					togglePasswordField();

					const sched = acc.schedule || {};
					if (scheduleEnabled) scheduleEnabled.checked = sched.enabled || false;
					if (scheduleFields)
						scheduleFields.classList.toggle("hidden", !sched.enabled);
					document.getElementById("form-schedule-start-hour").value =
						sched.startHour ?? 0;
					document.getElementById("form-schedule-start-minute").value =
						sched.startMinute ?? 0;
					document.getElementById("form-schedule-end-hour").value =
						sched.endHour ?? 0;
					document.getElementById("form-schedule-end-minute").value =
						sched.endMinute ?? 0;
					document.getElementById("form-schedule-timezone").value =
						sched.timezone || "UTC";
				}
			});
	} else {
		if (form) form.reset();
		if (formUsername) {
			formUsername.disabled = false;
		}
		if (formPassword) formPassword.placeholder = "Enter password";
		formLoginMethod.value = "credentials";
		for (const b of loginMethodBtns) {
			b.classList.toggle("active", b.dataset.method === "credentials");
		}
		gameIds = [];
		renderGameTags();
		togglePasswordField();
		if (scheduleFields) scheduleFields.classList.add("hidden");
	}

	if (modalOverlay) modalOverlay.classList.remove("hidden");
}

function closeModal() {
	if (modalOverlay) modalOverlay.classList.add("hidden");
	if (form) form.reset();
	if (formUsername) formUsername.disabled = false;
	gameIds = [];
	renderGameTags();
	editingUsername = null;
	setWizardStep(1);
}

// QR Modal
let currentQRUsername = null;

function startQRCountdown() {
	clearQRCountdown();
	let remaining = 30;
	if (qrTimer) qrTimer.textContent = `${remaining}s`;
	if (qrTimer) qrTimer.className = "";

	qrCountdown = setInterval(() => {
		remaining--;
		if (remaining <= 0) remaining = 30;
		if (qrTimer) qrTimer.textContent = `${remaining}s`;
		if (qrTimer) qrTimer.className = remaining <= 10 ? "warning" : "";
	}, 1000);
}

function clearQRCountdown() {
	if (qrCountdown) {
		clearInterval(qrCountdown);
		qrCountdown = null;
	}
	if (qrTimer) qrTimer.textContent = "";
	if (qrTimer) qrTimer.className = "";
}

function openQRModal(username) {
	if (qrUsername) qrUsername.textContent = `@${username}`;
	if (qrImage) qrImage.innerHTML = "";
	if (qrStatus) {
		qrStatus.textContent = "Waiting for QR code...";
		qrStatus.className = "";
	}
	if (qrOverlay) qrOverlay.classList.remove("hidden");
	currentQRUsername = username;
	startQRCountdown();
}

function closeQRModal() {
	if (qrOverlay) qrOverlay.classList.add("hidden");
	if (qrImage) qrImage.innerHTML = "";
	clearQRCountdown();

	if (currentQRUsername) {
		fetch("/api/qr-stop", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ username: currentQRUsername }),
		}).catch(() => {});
		currentQRUsername = null;
	}
}

window.startQRLogin = (username) => {
	openQRModal(username);

	fetch("/api/qr-login", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ username }),
	})
		.then((r) => r.json())
		.then((data) => {
			if (!data.ok) {
				if (qrStatus) {
					qrStatus.textContent = data.error;
					qrStatus.className = "error";
				}
			}
		})
		.catch(() => {
			if (qrStatus) {
				qrStatus.textContent = "Failed to start QR login";
				qrStatus.className = "error";
			}
		});
};

window.editAccount = (username) => {
	openModal(username);
};

window.deleteAccount = (username) => {
	openConfirmDialog(username);
};

function fmtTime() {
	return new Date().toLocaleTimeString();
}

function generateQRCode(url) {
	const qr = qrcode(0, "M");
	qr.addData(url);
	qr.make();

	const size = 200;
	const cellCount = qr.getModuleCount();
	const cellSize = size / cellCount;

	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext("2d");

	ctx.fillStyle = "#ffffff";
	ctx.fillRect(0, 0, size, size);

	ctx.fillStyle = "#000000";
	for (let y = 0; y < cellCount; y++) {
		for (let x = 0; x < cellCount; x++) {
			if (qr.isDark(y, x)) {
				ctx.fillRect(
					x * cellSize,
					y * cellSize,
					cellSize + 0.5,
					cellSize + 0.5,
				);
			}
		}
	}

	return canvas;
}

if (form) {
	form.addEventListener("submit", async (e) => {
		e.preventDefault();

		if (gameIds.length === 0) {
			addLog({
				level: "error",
				time: fmtTime(),
				user: formUsername.value.trim() || "—",
				msg: "Add at least one game (step 2)",
			});
			setWizardStep(2);
			return;
		}

		const schedEnabled = document.getElementById(
			"form-schedule-enabled",
		).checked;

		const body = {
			username: formUsername.value.trim(),
			password: formPassword.value || undefined,
			games: gameIds,
			loginMethod: formLoginMethod.value,
			online: formOnline.value === "true",
			schedule: {
				enabled: schedEnabled,
				startHour: Number(
					document.getElementById("form-schedule-start-hour").value,
				),
				startMinute: Number(
					document.getElementById("form-schedule-start-minute").value,
				),
				endHour: Number(
					document.getElementById("form-schedule-end-hour").value,
				),
				endMinute: Number(
					document.getElementById("form-schedule-end-minute").value,
				),
				timezone: document.getElementById("form-schedule-timezone").value,
			},
		};

		const url = editingUsername
			? `/api/accounts/${encodeURIComponent(editingUsername)}`
			: "/api/accounts";
		const method = editingUsername ? "PUT" : "POST";

		const res = await fetch(url, {
			method,
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		const data = await res.json();

		if (data.ok) {
			addLog({
				level: "info",
				time: fmtTime(),
				user: body.username,
				msg: editingUsername ? "Account updated" : "Account added",
			});
			closeModal();
		} else {
			addLog({
				level: "error",
				time: fmtTime(),
				user: body.username,
				msg: data.error,
			});
		}
	});
}

// Bug report
function handleBugReport() {
	try {
		const resp = fetch("/api/info");
		resp
			.then((r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return r.json();
			})
			.then((info) => {
				const report = [
					"## Bug Report",
					"",
					`**Version:** ${info.version || "unknown"}`,
					`**Platform:** ${info.platform} ${info.arch}`,
					`**Bun:** ${info.bunVersion}`,
					`**Uptime:** ${info.uptime}`,
					`**Accounts:** ${info.accounts}`,
					"",
					"### Dependencies",
					...Object.entries(info.dependencies || {}).map(
						([k, v]) => `- ${k}: ${v}`,
					),
					"",
					"### Description",
					"<!-- Describe the bug here -->",
					"",
					"### Steps to Reproduce",
					"1. ...",
					"2. ...",
					"3. ...",
					"",
					"### Expected Behavior",
					"<!-- What you expected -->",
					"",
					"### Actual Behavior",
					"<!-- What actually happened -->",
				].join("\n");

				const blob = new Blob([report], { type: "text/markdown" });
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = `bug-report-${new Date().toISOString().slice(0, 10)}.md`;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
			})
			.catch((err) => {
				console.error("Bug report error:", err);
				alert(`Failed to generate bug report: ${err.message}`);
			});
	} catch (err) {
		console.error("Bug report error:", err);
	}
}

if (bugReportBtn) bugReportBtn.addEventListener("click", handleBugReport);
if (bugReportBtnM) bugReportBtnM.addEventListener("click", handleBugReport);

if (addBtn) addBtn.addEventListener("click", () => openModal());

if (pauseAllBtn) {
	pauseAllBtn.addEventListener("click", async () => {
		await fetch("/api/bot/pause-all", { method: "POST" });
	});
}

if (resumeAllBtn) {
	resumeAllBtn.addEventListener("click", async () => {
		await fetch("/api/bot/resume-all", { method: "POST" });
	});
}

// Bulk actions
if (bulkPauseBtn) {
	bulkPauseBtn.addEventListener("click", async () => {
		for (const username of selectedAccounts) {
			await fetch("/api/bot/pause", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username }),
			});
		}
	});
}

if (bulkResumeBtn) {
	bulkResumeBtn.addEventListener("click", async () => {
		for (const username of selectedAccounts) {
			await fetch("/api/bot/resume", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username }),
			});
		}
	});
}

if (bulkDeleteBtn) {
	bulkDeleteBtn.addEventListener("click", async () => {
		if (!confirm(`Delete ${selectedAccounts.size} account(s)?`)) return;
		for (const username of selectedAccounts) {
			await fetch(`/api/accounts/${encodeURIComponent(username)}`, {
				method: "DELETE",
			});
		}
		selectedAccounts.clear();
		updateBulkActions();
	});
}

if (bulkDeselectBtn) {
	bulkDeselectBtn.addEventListener("click", () => {
		selectedAccounts.clear();
		for (const cb of grid.querySelectorAll(".account-select")) {
			cb.checked = false;
		}
		updateBulkActions();
	});
}

if (modalClose) modalClose.addEventListener("click", closeModal);
if (formCancel) formCancel.addEventListener("click", closeModal);
if (modalOverlay) {
	modalOverlay.addEventListener("click", (e) => {
		if (e.target === modalOverlay) closeModal();
	});
}

if (qrClose) qrClose.addEventListener("click", closeQRModal);
if (qrOverlay) {
	qrOverlay.addEventListener("click", (e) => {
		if (e.target === qrOverlay) closeQRModal();
	});
}

if (logFilter) logFilter.addEventListener("change", renderLogs);
if (logFilterUser) logFilterUser.addEventListener("change", renderLogs);

// Log export
const logExportBtn = document.getElementById("log-export-btn");
const logExportBtnM = document.getElementById("log-export-btn-m");

function handleLogExport() {
	const filter = logFilter ? logFilter.value : "all";
	const userFilter = logFilterUser ? logFilterUser.value : "all";
	const filtered = logs.filter((e) => {
		if (filter !== "all" && e.level !== filter) return false;
		if (userFilter !== "all" && e.user !== userFilter) return false;
		return true;
	});
	const text = filtered
		.map((e) => `[${e.time}] [${e.level.toUpperCase()}] [${e.user}] ${e.msg}`)
		.join("\n");
	const blob = new Blob([text], { type: "text/plain" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `logs-${new Date().toISOString().slice(0, 10)}.txt`;
	a.click();
	URL.revokeObjectURL(url);
}

if (logExportBtn) logExportBtn.addEventListener("click", handleLogExport);
if (logExportBtnM) logExportBtnM.addEventListener("click", handleLogExport);

// Steam Guard Modal
function openSteamGuardModal(username) {
	if (sgUsername) sgUsername.textContent = `@${username}`;
	if (sgCode) sgCode.value = "";
	if (sgError) {
		sgError.textContent = "";
		sgError.classList.add("hidden");
	}
	if (sgOverlay) sgOverlay.classList.remove("hidden");
	if (sgCode) sgCode.focus();
	if (sgOverlay) sgOverlay.dataset.username = username;
}

function closeSteamGuardModal() {
	if (sgOverlay) {
		sgOverlay.classList.add("hidden");
		sgOverlay.dataset.username = "";
	}
}

async function submitSteamGuard() {
	const username = sgOverlay.dataset.username;
	const code = sgCode.value.trim();

	if (!code) {
		if (sgError) {
			sgError.textContent = "Please enter the Steam Guard code.";
			sgError.classList.remove("hidden");
		}
		return;
	}

	const res = await fetch("/api/steam-guard", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ username, code }),
	});
	const data = await res.json();

	if (data.ok) {
		closeSteamGuardModal();
	} else {
		if (sgError) {
			sgError.textContent = data.error || "Failed to submit code.";
			sgError.classList.remove("hidden");
		}
	}
}

if (sgSubmit) sgSubmit.addEventListener("click", submitSteamGuard);
if (sgCode) {
	sgCode.addEventListener("keydown", (e) => {
		if (e.key === "Enter") submitSteamGuard();
	});
}

if (sgConsole) {
	sgConsole.addEventListener("click", async () => {
		const username = sgOverlay.dataset.username;
		if (username) {
			await fetch("/api/steam-guard-cancel", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username }),
			}).catch(() => {});
		}
		closeSteamGuardModal();
	});
}

// WebSocket
let ws;
function connect() {
	const proto = location.protocol === "https:" ? "wss:" : "ws:";
	ws = new WebSocket(`${proto}//${location.host}/ws`);

	ws.onmessage = (e) => {
		const msg = JSON.parse(e.data);

		if (msg.type === "init" || msg.type === "status") {
			renderAccounts(msg.data);
		}

		if (msg.type === "logs_init") {
			for (const entry of msg.data) {
				logs.push(entry);
			}
			renderLogs();
		}

		if (msg.type === "log") {
			addLog(msg.data);
		}

		if (msg.type === "steamGuard") {
			openSteamGuardModal(msg.username);
		}

		if (msg.qr) {
			if (msg.url) {
				const canvas = generateQRCode(msg.url);
				if (qrImage) {
					qrImage.innerHTML = "";
					qrImage.appendChild(canvas);
				}
				if (qrStatus) {
					qrStatus.textContent = "Scan with Steam Mobile App";
					qrStatus.className = "";
				}
				startQRCountdown();
			}

			if (msg.refreshToken) {
				if (qrStatus) {
					qrStatus.textContent = "Login successful!";
					qrStatus.className = "success";
				}
				clearQRCountdown();
				addLog({
					level: "info",
					time: fmtTime(),
					user: msg.username,
					msg: "QR login successful",
				});
				setTimeout(closeQRModal, 2000);
			}

			if (msg.error) {
				if (qrStatus) {
					qrStatus.textContent = msg.error;
					qrStatus.className = "error";
				}
			}

			if (msg.type === "timeout") {
				if (qrStatus) {
					qrStatus.textContent = "QR login timed out";
					qrStatus.className = "error";
				}
			}
		}
	};

	ws.onclose = () => setTimeout(connect, 3000);
	ws.onerror = () => ws.close();
}

connect();
