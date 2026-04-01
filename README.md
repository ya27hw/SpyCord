# SpyCord

<p align="center">
  <b>A local Discord guild monitor with a live web dashboard.</b>
</p>

<p align="center">
  Watch messages from one or more guilds, search logs, switch channels, and browse everything from a Discord-inspired UI.
</p>

---

## What This Does

SpyCord is a small Python app that:

- monitors messages from one or more Discord guilds using a bot token
- saves message activity to a local log file
- opens a local web dashboard to browse those logs
- lets you search messages and switch between channels
- highlights mentions inside the viewer

Everything runs on your own machine.

---

## Before You Start

You need:

- `Python 3.10+`
- a Discord bot token
- the bot added to the server(s) you want to monitor
Developer Portal

If you are brand new to this, do not worry. Just follow the steps below one by one.

---

## Step 1: Open The Project Folder

Open PowerShell in the SpyCord folder.

Example:

```powershell
cd "C:\Users\yousu\Documents\Personal Coding\Test"
```

---

## Step 2: Create A Virtual Environment

This keeps the Python packages for this project separate from everything else on your computer.

```powershell
python -m venv venv
```

---

## Step 3: Activate The Virtual Environment

In PowerShell:

```powershell
.\venv\Scripts\Activate.ps1
```

If it works, you will usually see `(venv)` appear at the start of your terminal line.

---

## Step 4: Install The Required Package

SpyCord uses `discord.py`.

```powershell
pip install discord.py
```

If `pip` asks to upgrade itself, that is optional.

---

## Step 5: Start SpyCord

Run:

```powershell
python app.py
```

After that, open this address in your browser:

```text
http://127.0.0.1:8765
```

---

## Step 6: Enter Your Bot Token And Guild IDs

When the page opens:

1. Paste your Discord bot token into the `Bot Token` box.
2. Paste one or more guild IDs into the `Guild IDs` box.
3. You can enter guild IDs:
   - one per line
   - or comma-separated
4. Click `Save and Start`.

SpyCord will then begin monitoring and the dashboard will start filling with messages.

---

## Finding Your Guild ID

If you do not know your guild ID:

1. Open Discord.
2. Go to `User Settings > Advanced`.
3. Turn on `Developer Mode`.
4. Right-click the server you want to monitor.
5. Click `Copy Server ID`.

Paste that number into SpyCord.

---

## What You Will See In The Dashboard

The dashboard includes:

- a setup panel for your token and guild IDs
- a live/idle status badge
- a channel list grouped by category
- a search box for filtering messages
- dark mode by default
- a light mode toggle
- message entries with timestamps, channels, and mentions

---

## Where Settings Are Saved

SpyCord saves your local settings in:

```text
spycord_config.json
```

This file stores:

- your bot token
- your guild IDs

Keep that file private.

---

## Important Notes

- SpyCord only works with a Discord bot account.
- Your bot must be inside the guild(s) you want to monitor.
- Your bot needs permission to view the channels you care about.
- The dashboard reads from local logs, so if the monitor is stopped, no new messages will appear.

---

## Troubleshooting

### The page opens, but no messages appear

Check these:

- the bot token is correct
- the guild ID is correct
- the bot is actually in that server
- the bot can see the target channels

### PowerShell blocks the virtual environment activation

Try this command in PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
```

Then run:

```powershell
.\venv\Scripts\Activate.ps1
```

### The app says monitor error

Usually this means one of these:

- the token is invalid
- the bot cannot access the guild
- Discord rejected the connection

Re-check the token and guild IDs first.

---

## Quick Start

If you just want the shortest version:

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install discord.py
python app.py
```

Then open `http://127.0.0.1:8765`, enter your bot token and guild IDs, and click `Save and Start`.

---

## Project Files

- `app.py` starts the local web app and monitor controller
- `monitor.py` connects to Discord and writes logs
- `log_viewer.py` handles log parsing and viewer API responses
- `viewer/` contains the web dashboard files

---

## Final Reminder

This project stores monitoring data locally on your computer. Be careful with:

- your bot token
- your saved config file
- your generated logs

Treat them like private data.
