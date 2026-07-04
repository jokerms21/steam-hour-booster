# steam-hour-booster
> Farm your in-game hours on Steam
- You can farm hours for **multiple games** on **multiple accounts** at once.
- Accounts with **Steam Guard** enabled are **supported**.
- **GUI panel** with real-time monitoring, account management, QR login, and Steam Guard input.
- Uses [node-steam-user](https://github.com/DoctorMcKay/node-steam-user) library.

<sub>*This software is not affiliated with Valve Corporation or Steam.*</sub>

![Result of hours farming](./result.png)

## Table of contents
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [GUI Panel](#gui-panel)
- [Configuration](#configuration)
- [Environment variables](#environment-variables)
- [HTTPS / Domain](#https--domain)
- [Docker](#docker)
- [FAQ](#faq)

## Requirements
- [Bun](https://bun.sh/) (or [Docker](https://www.docker.com/))

## Quick start

Install dependencies:
```bash
bun install
```

Copy config:
```bash
cp config-example.json config.json
```

Run:
```bash
bun .
```

Open GUI: **http://localhost:3000/**

### First login
1. Add an account in GUI (or edit `config.json`)
2. For **credentials** mode: enter username/password, Steam Guard code will be asked in GUI or console
3. For **QR code** mode: click "QR Login" on the account card, scan QR with Steam Mobile App
4. Once logged in, a [refresh token](https://github.com/DoctorMcKay/node-steam-user?tab=readme-ov-file#using-refresh-tokens) is stored — no need to enter codes again

## GUI Panel

Open **http://localhost:3000/** in your browser.

### Features
- **Dashboard** — real-time status of all accounts (Playing, Paused, Logged Out)
- **Add / Edit / Delete** accounts without restarting
- **Pause / Resume** boosting per account
- **QR Login** — scan QR code from the GUI (auto-refreshes every 30 seconds)
- **Steam Guard** — enter Steam Guard codes directly in the GUI
- **Live logs** — filterable by level and username
- **Online Status** — set accounts to Online or Offline in Steam

### Account card
| Button | Action |
| --- | --- |
| **Pause** | Stops boosting, sets Steam status to Offline |
| **Resume** | Continues boosting with saved settings |
| **Edit** | Change password, games, online status, login method |
| **QR Login** | Show QR code for login (only for `qrcode` accounts) |
| **Delete** | Remove account from config |

## Configuration

Configuration is a JSON file with a list of accounts.

```jsonc
[
    {
        "username": "your_username",
        "password": "your_password",
        "games": [730],
        "online": true,
        "loginMethod": "credentials"
    }
]
```

### Fields
| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `username` | string | Yes | Steam username |
| `password` | string | For credentials | Steam password (not needed for QR login) |
| `games` | number[] | Yes | Game App IDs to farm (max 32). Find IDs on [SteamDB](https://steamdb.info/) |
| `online` | boolean | No | Appear online & in-game (default: `false`) |
| `loginMethod` | string | No | `"credentials"` (default) or `"qrcode"` |

## Environment variables
You can provide a `.env` file to configure environment variables.

Copy the template:
```bash
cp .env.template .env
```

| Name | Description | Default |
| --- | --- | --- |
| `CONFIG_PATH` | Path to config file | `./config.json` |
| `STEAM_DATA_DIRECTORY` | Steam data storage path | `./steam-data` |
| `TOKEN_STORAGE_DIRECTORY` | Refresh tokens storage path | `./tokens` |
| `MONITOR_PORT` | GUI server port | `3000` |
| `GUI_DOMAIN` | Domain name for HTTPS (optional) | — |
| `GUI_CERT_FILE` | Path to SSL certificate (optional) | — |
| `GUI_KEY_FILE` | Path to SSL private key (optional) | — |

## HTTPS / Domain

For production, you can run with a domain and SSL certificates directly (no nginx needed):

```bash
GUI_DOMAIN=boost.example.com \
GUI_CERT_FILE=/etc/letsencrypt/live/boost.example.com/fullchain.pem \
GUI_KEY_FILE=/etc/letsencrypt/live/boost.example.com/privkey.pem \
MONITOR_PORT=443 \
bun .
```

Or via `.env`:
```env
MONITOR_PORT=443
GUI_DOMAIN=boost.example.com
GUI_CERT_FILE=/etc/letsencrypt/live/boost.example.com/fullchain.pem
GUI_KEY_FILE=/etc/letsencrypt/live/boost.example.com/privkey.pem
```

If you use **nginx proxy manager**, just run on default port 3000 and point your reverse proxy to `http://localhost:3000`.

## Docker

For Docker usage, see [here](https://hub.docker.com/r/drwarpman/steam-hour-booster).

### Docker with HTTPS
```yaml
services:
  steam-hour-booster:
    image: drwarpman/steam-hour-booster
    ports:
      - "443:443"
    environment:
      - GUI_DOMAIN=boost.example.com
      - GUI_CERT_FILE=/certs/fullchain.pem
      - GUI_KEY_FILE=/certs/privkey.pem
      - MONITOR_PORT=443
    volumes:
      - ./config.json:/app/config.json
      - ./tokens:/app/tokens
      - ./steam-data:/app/steam-data
      - /etc/letsencrypt:/certs:ro
```

## FAQ

### Can I get banned?
People have been using these kinds of "hour boosters" for years, without issues.\
Don't take my word for it though, use at your own risk.

### Steam Guard code not showing in GUI?
If you refresh the page while the bot is waiting for Steam Guard, the modal will reappear automatically. If it doesn't, wait 5 seconds and it will fall back to console input.

### How to pause boosting?
Click **Pause** on the account card. The bot will stop playing games and appear offline in Steam. Click **Resume** to continue.
