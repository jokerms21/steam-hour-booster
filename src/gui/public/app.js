const grid = document.getElementById("accounts-grid");
const onlineCount = document.getElementById("online-count");
const totalCount = document.getElementById("total-count");
const logsList = document.getElementById("logs-list");
const logFilter = document.getElementById("log-filter");
const logFilterUser = document.getElementById("log-filter-user");
const addBtn = document.getElementById("add-account-btn");
const modalOverlay = document.getElementById("modal-overlay");
const modalTitle = document.getElementById("modal-title");
const modalClose = document.getElementById("modal-close");
const form = document.getElementById("account-form");
const formUsername = document.getElementById("form-username");
const formPassword = document.getElementById("form-password");
const formGames = document.getElementById("form-games");
const gamesTagsContainer = document.getElementById("games-tags-container");
const gamesTags = document.getElementById("games-tags");
const formLoginMethod = document.getElementById("form-loginMethod");
const formOnline = document.getElementById("form-online");
const formCancel = document.getElementById("form-cancel");
const passwordGroup = document.getElementById("form-password").parentElement;

let gameIds = [];
const MAX_GAMES = 32;
const gamesCount = document.getElementById("games-count");

function togglePasswordField() {
	passwordGroup.style.display =
		formLoginMethod.value === "qrcode" ? "none" : "";
}

formLoginMethod.addEventListener("change", togglePasswordField);

function renderGameTags() {
	gamesTags.innerHTML = gameIds
		.map(
			(id) =>
				`<span class="game-tag-input">${id}<span class="game-tag-remove" onclick="removeGameTag(${id})">&times;</span></span>`,
		)
		.join("");
	gamesCount.textContent = `${gameIds.length}/${MAX_GAMES}`;
	gamesCount.classList.toggle("games-count-warn", gameIds.length >= MAX_GAMES);
	formGames.disabled = gameIds.length >= MAX_GAMES;
}

window.removeGameTag = (id) => {
	gameIds = gameIds.filter((g) => g !== id);
	renderGameTags();
};

gamesTagsContainer.addEventListener("click", () => {
	if (!formGames.disabled) formGames.focus();
});

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

const MAX_LOGS = 200;
const logs = [];
let editingUsername = null;
let qrCountdown = null;

function renderAccounts(accounts) {
	grid.innerHTML = accounts
		.map(
			(a) => `
        <div class="account-card" data-username="${a.username}">
            <div class="account-header">
                <span class="account-name">${a.username}</span>
                <span class="status-badge ${a.paused ? "Paused" : a.status}">${a.paused ? "Paused" : a.status}</span>
            </div>
            ${a.paused && a.pauseReason ? `<div class="pause-reason">${a.pauseReason}</div>` : ""}
            <div class="account-meta">
                <span>Uptime: ${a.uptime}</span>
            </div>
            <div class="games-list">
                ${a.games.map((g) => `<span class="game-tag">${g.name || g.appid}</span>`).join("")}
            </div>
            <div class="account-actions">
                ${
									a.status === "Playing" || a.paused
										? a.paused
											? `<button class="btn primary" onclick="resumeBot('${a.username}')">Resume</button>`
											: `<button class="btn warning" onclick="pauseBot('${a.username}')">Pause</button>`
										: ""
								}
                <button class="btn" onclick="editAccount('${a.username}')">Edit</button>
                ${a.loginMethod === "qrcode" ? `<button class="btn" onclick="startQRLogin('${a.username}')">QR Login</button>` : ""}
                <button class="btn danger" onclick="deleteAccount('${a.username}')">Delete</button>
            </div>
        </div>
    `,
		)
		.join("");

	const online = accounts.filter((a) => a.status === "Playing").length;
	onlineCount.textContent = online;
	totalCount.textContent = accounts.length;
	updateUserFilter(accounts);
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
	const filter = logFilter.value;
	const userFilter = logFilterUser.value;
	const filtered = logs.filter((l) => {
		if (filter !== "all" && l.level !== filter) return false;
		if (userFilter !== "all" && l.user !== userFilter) return false;
		return true;
	});

	logsList.innerHTML = filtered
		.map(
			(l) =>
				`<div class="log-entry ${l.level}">[${l.time}] [${l.user}] ${l.msg}</div>`,
		)
		.join("");

	logsList.scrollTop = logsList.scrollHeight;
}

function updateUserFilter(accounts) {
	const current = logFilterUser.value;
	const usernames = accounts.map((a) => a.username);

	logFilterUser.innerHTML = '<option value="all">All accounts</option>';
	for (const u of usernames) {
		const opt = document.createElement("option");
		opt.value = u;
		opt.textContent = u;
		logFilterUser.appendChild(opt);
	}

	if (usernames.includes(current)) {
		logFilterUser.value = current;
	}
}

// Account Modal
function openModal(username) {
	editingUsername = username || null;
	modalTitle.textContent = username ? "Edit Account" : "Add Account";

	if (username) {
		fetch("/api/accounts")
			.then((r) => r.json())
			.then((accounts) => {
				const acc = accounts.find(
					(a) => a.username.toLowerCase() === username.toLowerCase(),
				);
				if (acc) {
					formUsername.value = acc.username;
					formUsername.disabled = true;
					formPassword.value = "";
					formPassword.placeholder = "Enter new password (or leave blank)";
					gameIds = acc.games.map(Number);
					renderGameTags();
					formLoginMethod.value = acc.loginMethod;
					formOnline.value = String(acc.online);
					togglePasswordField();
				}
			});
	} else {
		form.reset();
		formUsername.disabled = false;
		formPassword.placeholder = "Enter password";
		gameIds = [];
		renderGameTags();
		togglePasswordField();
	}

	modalOverlay.classList.remove("hidden");
}

function closeModal() {
	modalOverlay.classList.add("hidden");
	form.reset();
	formUsername.disabled = false;
	gameIds = [];
	renderGameTags();
	editingUsername = null;
}

// QR Modal
let currentQRUsername = null;

function startQRCountdown() {
	clearQRCountdown();
	let remaining = 30;
	qrTimer.textContent = `${remaining}s`;
	qrTimer.className = "";

	qrCountdown = setInterval(() => {
		remaining--;
		if (remaining <= 0) {
			remaining = 30;
		}
		qrTimer.textContent = `${remaining}s`;
		qrTimer.className = remaining <= 10 ? "warning" : "";
	}, 1000);
}

function clearQRCountdown() {
	if (qrCountdown) {
		clearInterval(qrCountdown);
		qrCountdown = null;
	}
	qrTimer.textContent = "";
	qrTimer.className = "";
}

function openQRModal(username) {
	qrUsername.textContent = `@${username}`;
	qrImage.innerHTML = "";
	qrStatus.textContent = "Waiting for QR code...";
	qrStatus.className = "";
	qrOverlay.classList.remove("hidden");
	currentQRUsername = username;
	startQRCountdown();
}

function closeQRModal() {
	qrOverlay.classList.add("hidden");
	qrImage.innerHTML = "";
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
				qrStatus.textContent = data.error;
				qrStatus.className = "error";
			}
		})
		.catch((err) => {
			qrStatus.textContent = "Failed to start QR login";
			qrStatus.className = "error";
		});
};

window.editAccount = (username) => {
	openModal(username);
};

window.deleteAccount = async (username) => {
	if (!confirm(`Delete account '${username}'?`)) return;

	const res = await fetch(`/api/accounts/${encodeURIComponent(username)}`, {
		method: "DELETE",
	});
	const data = await res.json();

	if (data.ok) {
		addLog({
			level: "info",
			time: fmtTime(),
			user: username,
			msg: "Account deleted",
		});
	} else {
		addLog({
			level: "error",
			time: fmtTime(),
			user: username,
			msg: data.error,
		});
	}
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

form.addEventListener("submit", async (e) => {
	e.preventDefault();

	const body = {
		username: formUsername.value.trim(),
		password: formPassword.value || undefined,
		games: gameIds,
		loginMethod: formLoginMethod.value,
		online: formOnline.value === "true",
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

addBtn.addEventListener("click", () => openModal());
modalClose.addEventListener("click", closeModal);
formCancel.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", (e) => {
	if (e.target === modalOverlay) closeModal();
});

qrClose.addEventListener("click", closeQRModal);
qrOverlay.addEventListener("click", (e) => {
	if (e.target === qrOverlay) closeQRModal();
});

logFilter.addEventListener("change", renderLogs);
logFilterUser.addEventListener("change", renderLogs);

// Steam Guard Modal
function openSteamGuardModal(username) {
	sgUsername.textContent = `@${username}`;
	sgCode.value = "";
	sgError.textContent = "";
	sgError.classList.add("hidden");
	sgOverlay.classList.remove("hidden");
	sgCode.focus();
	sgOverlay.dataset.username = username;
}

function closeSteamGuardModal() {
	sgOverlay.classList.add("hidden");
	sgOverlay.dataset.username = "";
}

async function submitSteamGuard() {
	const username = sgOverlay.dataset.username;
	const code = sgCode.value.trim();

	if (!code) {
		sgError.textContent = "Please enter the Steam Guard code.";
		sgError.classList.remove("hidden");
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
		sgError.textContent = data.error || "Failed to submit code.";
		sgError.classList.remove("hidden");
	}
}

sgSubmit.addEventListener("click", submitSteamGuard);
sgCode.addEventListener("keydown", (e) => {
	if (e.key === "Enter") submitSteamGuard();
});

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
				qrImage.innerHTML = "";
				qrImage.appendChild(canvas);
				qrStatus.textContent = "Scan with Steam Mobile App";
				qrStatus.className = "";
				startQRCountdown();
			}

			if (msg.refreshToken) {
				qrStatus.textContent = "Login successful!";
				qrStatus.className = "success";
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
				qrStatus.textContent = msg.error;
				qrStatus.className = "error";
			}

			if (msg.type === "timeout") {
				qrStatus.textContent = "QR login timed out";
				qrStatus.className = "error";
			}
		}
	};

	ws.onclose = () => setTimeout(connect, 3000);
	ws.onerror = () => ws.close();
}

connect();
