# Orders Dashboard — Setup Guide

Your order form already emails you every order through Web3Forms. This adds a
**`/orders` dashboard** that also saves each order to a **Google Sheet** so you can
view them, mark status (New → Confirmed → Baking → Done), search/filter, and see totals.

It's free and uses your existing Google account. One-time setup, ~15 minutes.

---

## What you'll end up with

```
Customer places order
   ├─►  Web3Forms  ──►  email to you   (already working)
   └─►  Google Apps Script  ──►  Google Sheet
                                     │
                       ddscookies.com/orders  reads & updates the Sheet
```

---

## Step 1 — Create the Google Sheet

1. Go to <https://sheets.google.com> and create a **blank spreadsheet**.
2. Name it something like **"DD Cookies Orders"**.
3. Look at the URL. The long code between `/d/` and `/edit` is the **Sheet ID**:
   `https://docs.google.com/spreadsheets/d/`**`1AbC...the-long-id...xyz`**`/edit`
4. **Copy that Sheet ID** — you'll need it in Step 2.

*(You don't need to add column headers — the script creates them automatically.)*

---

## Step 2 — Create the Apps Script

1. Go to <https://script.google.com> → **New project**.
2. Delete the sample code in the editor.
3. Open the file **`apps-script.gs`** from this project, copy **all** of it, and paste it in.
4. At the top, edit the two CONFIG lines:
   ```js
   const SHEET_ID = "PASTE_YOUR_SHEET_ID_HERE";       // ← from Step 1
   const SECRET   = "CHANGE_ME_to_a_long_random_string"; // ← make up a long random string
   ```
   - Pick any long random string for `SECRET` (e.g. mash the keyboard: `k7f9Qx2mPzR4nW8vL`).
     **Write it down** — you'll paste the *same* value into `orders.js` in Step 4.
5. Click **Save** (💾).

---

## Step 3 — Deploy it as a Web App

1. In the Apps Script editor, click **Deploy** → **New deployment**.
2. Click the gear ⚙ next to "Select type" → choose **Web app**.
3. Set:
   - **Description:** `orders backend`
   - **Execute as:** **Me**
   - **Who has access:** **Anyone**  ← important (the website calls it without logging in)
4. Click **Deploy**.
5. Google will ask you to **authorize** — approve it (it's your own script).
   - If you see "Google hasn't verified this app," click **Advanced** → **Go to (your project)** → **Allow**. This is normal for your own scripts.
6. Copy the **Web app URL** it gives you. It looks like:
   `https://script.google.com/macros/s/AKfy...long.../exec`
   **Copy this URL** — you'll need it twice in Step 4.

---

## Step 4 — Connect the website

Edit two files in this project:

**`script.js`** (near the top):
```js
const ORDERS_ENDPOINT = "https://script.google.com/macros/s/AKfy.../exec";  // ← paste the Web app URL
```

**`orders.js`** (the CONFIG block at the top):
```js
const ENDPOINT = "https://script.google.com/macros/s/AKfy.../exec";  // ← same Web app URL
const TOKEN    = "k7f9Qx2mPzR4nW8vL";   // ← the SAME value you used for SECRET in Step 2
const VIEW_PASSWORD = "cookies";        // ← change to your own dashboard password
```

Save both files and re-upload them to your host.

---

## Step 5 — Test it

1. On your live site, click **Order Now** and place a **test order**.
2. Open **`ddscookies.com/orders`**, enter your `VIEW_PASSWORD`, and you should see the order.
3. Open the Google Sheet — the order should be a new row there too.
4. On the dashboard, change the order's **status** dropdown, then refresh the Sheet to confirm it updated.

---

## Notes & gotchas

- **The email still works.** Web3Forms keeps emailing you — the Sheet is an *additional* copy.
  If the Sheet ever fails, the order still goes through by email.
- **`/orders` URL:** if your host serves `orders.html` at `/orders` (most do, or with a small
  rewrite rule), great. Otherwise the page is reachable at `ddscookies.com/orders.html`.
- **Security is light.** The password gate is client-side — good enough to keep casual eyes out,
  but don't treat order data as highly confidential behind it. Keep `noindex` (already set) so it
  won't show up in Google. For stronger protection later, we can move to a real login (Supabase).
- **If you ever re-deploy the script** with code changes, use **Deploy → Manage deployments →
  ✏️ edit → New version** so the URL stays the same. Creating a *new* deployment gives a new URL
  you'd have to paste again.
- **Changing the SECRET/TOKEN** later means updating it in both `apps-script.gs` and `orders.js`.
