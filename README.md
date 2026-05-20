# 🚀 KoboToolbox Dashboard — Complete Setup Guide
**For beginners. Every step explained.**

---

## 📦 What You'll End Up With

| Feature | Detail |
|---|---|
| Live dashboard | Updates every 5 minutes automatically |
| Charts & Analytics | Bar, Pie, Line charts for every field |
| Map View | All GPS locations shown as pins — tap any pin for details |
| Data Table | Search, filter, sort, select rows, download CSV or Excel |
| Online & public | Anyone with the link can view it |
| Code on GitHub | Version-controlled, editable |
| Hosting | **Vercel** (free tier, generous limits) |

---

## 🛠️ PHASE 1 — Install the tools on your computer (do once)

### Step 1 — Install Node.js
Node.js lets your computer run JavaScript.

1. Go to **https://nodejs.org**
2. Click the big **"LTS"** button to download
3. Run the installer — click Next through everything
4. When done, open **Terminal** (Mac/Linux) or **Command Prompt** (Windows)
5. Type this and press Enter to confirm it worked:
   ```
   node --version
   ```
   You should see something like `v20.11.0` ✅

### Step 2 — Install Git
Git is how you save code to GitHub.

1. Go to **https://git-scm.com/downloads**
2. Download and install for your OS
3. Confirm it works:
   ```
   git --version
   ```
   Should show `git version 2.x.x` ✅

### Step 3 — Create accounts (free)

| Account | Link | Why you need it |
|---|---|---|
| GitHub | https://github.com/signup | Stores your code |
| Vercel | https://vercel.com/signup | Hosts your dashboard online (sign up with GitHub) |

---

## 📁 PHASE 2 — Set up your project

### Step 4 — Put the project files on your computer

You received a folder called `kobo-dashboard/`. 

If you downloaded it as a ZIP:
1. Right-click the ZIP → **Extract All**
2. You'll get a folder called `kobo-dashboard`
3. Move it somewhere you'll remember (like your Desktop or Documents)

### Step 5 — Open the project in Terminal

**On Windows:**
1. Open the `kobo-dashboard` folder in File Explorer
2. Click the address bar at the top, type `cmd`, press Enter
3. A black window (Command Prompt) opens — you're inside the folder ✅

**On Mac:**
1. Open Terminal (search for it with Spotlight)
2. Type `cd ` (with a space), then drag-and-drop the `kobo-dashboard` folder into the Terminal window
3. Press Enter ✅

### Step 6 — Install project dependencies

In the terminal (make sure you're inside the `kobo-dashboard` folder), type:
```
npm install
```
This downloads all the libraries. It takes 1–3 minutes. ⏳

---

## 🔑 PHASE 3 — Connect to your KoboToolbox form

### Step 7 — Get your KoboToolbox API Token

1. Log in to **https://kf.kobotoolbox.org** (or your KoboToolbox server)
2. Click your profile picture → **Account Settings**
3. Scroll down to find **"API Key"** or **"Token"**
4. Copy that long string of letters/numbers — this is your token 🔑

### Step 8 — Get your Form UID

1. In KoboToolbox, open your form
2. Look at the URL in your browser:
   ```
   https://kf.kobotoolbox.org/#/forms/aXmNk9R3bDqT7wV2/summary
   ```
3. The part between `/forms/` and `/summary` is your Form UID
4. In the example above: `aXmNk9R3bDqT7wV2` — copy yours

### Step 9 — Edit the config file

1. Open the `kobo-dashboard` folder
2. Open `src/config.js` in any text editor (Notepad, VS Code, etc.)
3. Find these lines and fill them in:

```javascript
API_TOKEN: import.meta.env.VITE_KOBO_TOKEN || 'YOUR_API_TOKEN_HERE',
FORM_UID: import.meta.env.VITE_KOBO_FORM_UID || 'YOUR_FORM_UID_HERE',
```

Replace `YOUR_API_TOKEN_HERE` and `YOUR_FORM_UID_HERE` with your actual values.

4. Also update the map center to your survey area (find coordinates at maps.google.com):
```javascript
MAP_CENTER: [30.9010, 75.8573],  // Example: Patiala, Punjab
```

5. If your form has a GPS/location question, make sure `GPS_FIELD` matches the field name in KoboToolbox.
   - Usually it stays as `_geolocation` (the default) ✅

6. Save the file

### Step 10 — Test it locally

In your terminal:
```
npm run dev
```

Open your browser and go to: **http://localhost:5173**

You should see the dashboard loading your data! 🎉

Press `Ctrl+C` in the terminal to stop the local server when done.

---

## 🐙 PHASE 4 — Put your code on GitHub

### Step 11 — Create a GitHub repository

1. Go to **https://github.com/new**
2. Repository name: `kobo-dashboard`
3. Set it to **Public** (so Vercel can read it) or Private
4. **DO NOT** check "Add a README file"
5. Click **Create repository**
6. GitHub will show you a page with commands — keep it open

### Step 12 — Upload your code to GitHub

Back in your terminal (inside the `kobo-dashboard` folder):

```bash
git init
git add .
git commit -m "Initial KoboToolbox dashboard"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/kobo-dashboard.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

If asked for credentials, enter your GitHub username and password (or use a personal access token).

✅ Your code is now on GitHub!

---

## 🌐 PHASE 5 — Deploy online with Vercel (FREE)

### Step 13 — Connect Vercel to GitHub

1. Go to **https://vercel.com** and log in (you signed up with GitHub)
2. Click **"Add New…"** → **"Project"**
3. Find your `kobo-dashboard` repository and click **"Import"**

### Step 14 — Configure environment variables (SECURE WAY)

Instead of having your API token visible in the code, put it in Vercel's secure environment variables:

1. In the Vercel import screen, scroll down to **"Environment Variables"**
2. Add these one by one:

| Name | Value |
|---|---|
| `VITE_KOBO_TOKEN` | Your KoboToolbox API token |
| `VITE_KOBO_FORM_UID` | Your Form UID |
| `VITE_KOBO_SERVER` | `https://kf.kobotoolbox.org` |
| `VITE_DASHBOARD_TITLE` | Whatever title you want |

3. Then **go back to `src/config.js`** and replace your hardcoded token/UID with the placeholder text:
```javascript
API_TOKEN: import.meta.env.VITE_KOBO_TOKEN || 'YOUR_API_TOKEN_HERE',
FORM_UID:  import.meta.env.VITE_KOBO_FORM_UID || 'YOUR_FORM_UID_HERE',
```
(It already looks like this if you didn't change it — good!)

### Step 15 — Deploy!

1. Click **"Deploy"**
2. Vercel builds your app (1–2 minutes) ⏳
3. When it says **"Congratulations!"** → click **"Visit"**

🎉 **Your dashboard is now LIVE online!**

You'll get a URL like: `https://kobo-dashboard-abc123.vercel.app`

**Share this link with anyone — they can view it in their browser.**

---

## 🔄 PHASE 6 — Auto-updates (already built-in!)

The dashboard **automatically refreshes every 5 minutes** from the KoboToolbox API.

Whenever someone submits a new form → within 5 minutes → it appears on the dashboard.

To change the interval, edit `src/config.js`:
```javascript
REFRESH_INTERVAL: 300000,  // 300000ms = 5 minutes
                            // 60000 = 1 minute
                            // 600000 = 10 minutes
```

---

## 🔁 How to update the dashboard after making changes

1. Make your changes to the code
2. In terminal (inside the project folder):
```bash
git add .
git commit -m "Describe what you changed"
git push
```
3. Vercel automatically detects the GitHub push and rebuilds the site within 1 minute ✅

---

## 🗺️ GPS / Map Notes

KoboToolbox stores GPS as an array `[latitude, longitude, altitude, accuracy]`.

The default field name is `_geolocation`. If yours is different:
1. Submit a test form
2. In KoboToolbox → Data → Table view, look for the column that has numbers like `30.90, 75.85`
3. Copy that column name
4. Put it in `config.js` under `GPS_FIELD`

---

## 🔒 CORS Issue (if map or data doesn't load)

If your browser console shows a CORS error, it means KoboToolbox is blocking direct browser requests.

**Fix:** Add this to your KoboToolbox account settings → Under "REST Services" or check if your form has public access enabled. You may also need to enable **public sharing** on the form.

---

## ❓ Troubleshooting

| Problem | Fix |
|---|---|
| "API error: 401" | Your API token is wrong. Re-copy it from KoboToolbox settings |
| "API error: 404" | Your Form UID is wrong. Check the URL of your form |
| No data shows | Make sure you have submitted at least 1 form response |
| Map is empty | Your form doesn't have GPS or the field name is different |
| Dashboard won't load | Check browser console (F12) for errors |
| Build fails on Vercel | Check the Vercel build log for the error message |

---

## 📞 Summary of your URLs after setup

| What | URL |
|---|---|
| Live Dashboard | `https://your-project.vercel.app` |
| GitHub Code | `https://github.com/YOUR_USERNAME/kobo-dashboard` |
| Vercel Dashboard | `https://vercel.com/dashboard` |
| KoboToolbox | `https://kf.kobotoolbox.org` |

---

*Built with React + Recharts + Leaflet + Vercel. No monthly costs.*
