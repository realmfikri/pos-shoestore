# Support & Escalation Procedures

## 1. How to report an issue
1. Check if the issue affects all devices or only one.
2. Capture a screenshot or screen recording (press volume down + power on Android).
3. Note the exact time, user account, and action taken (e.g., `Saving Quick Add for Nike Air Max`).
4. Post in WhatsApp group **POS Support** with the template:
   ```
   [ISSUE] <short title>
   Time: <HH:MM, date>
   User: <name>
   Screen: <POS / Quick Add / Reports / etc>
   Description: <what happened>
   Screenshot: <attach>
   Urgency: High/Medium/Low
   ```
5. Inventory Captain logs the issue in the internal tracker (Notion/Trello) with status `New`.

## 2. Password reset procedure
- **Self-service (recommended):**
  1. Go to login page, tap **Lupa Password?** (Forgot Password).
  2. Enter registered email; system sends reset link valid for 30 minutes.
  3. Create new password (minimum 8 chars, include number).
- **Admin-assisted:**
  1. Owner/Admin opens **Settings → Users**.
  2. Select user → **Reset Password** → temporary password generated.
  3. Share temporary password securely (WhatsApp direct message). User must change on next login.
- Record all resets in admin logbook (date, user, who initiated).

## 3. When the app is slow or offline
1. Check store Wi-Fi (speedtest). If <5 Mbps, restart router.
2. Verify API status: open `https://status.store-pos.local/health` (ping page).
3. If backend down:
   - Switch to offline queue mode (POS caches sales; Quick Add paused).
   - Notify developer immediately (see contact below).
   - Record manual sales on paper receipts until restored.
4. Once online, sync cached entries (POS prompts automatically). Confirm counts in stock ledger.

## 4. Data import errors
1. Review error message (e.g., duplicate SKU, missing price).
2. Fix rows in Google Sheets, re-export CSV.
3. Use **Import → Retry last upload** to save mapping time.
4. If import keeps failing, share CSV and error log with developer.

## 5. Contact tree
- **Store Admin (Primary):** Ayah – +62 xxx-xxx – approves escalations.
- **Technical Lead (Secondary):** You (agent) or delegated developer – email `dev@shoepos.local`, WhatsApp +62 xxx-yyy.
- **Emergency (System down during trading hours):** Call developer within 10 minutes. If unreachable, revert to manual sales and continue data capture offline.

## 6. Maintenance windows
- Scheduled deployments Tue & Thu, 21:00–22:00. Notify staff in WhatsApp group 1 hour before.
- During maintenance, POS may refresh; avoid mid-transaction.

## 7. Knowledge base updates
- Store new SOPs in `docs/operations/` folder in Git repo.
- Announce updates in WhatsApp with short summary and link.
- Archive obsolete docs by moving to `docs/archive/`.

## 8. Escalation SLAs
| Severity | Example | Response Time | Resolution Target |
|----------|---------|---------------|-------------------|
| Critical | POS cannot complete sales | 10 minutes | 2 hours or workaround |
| High | Quick Add cannot save items | 30 minutes | Same day |
| Medium | Import warnings, report misalignment | 4 hours | 2 business days |
| Low | UI copy change request | 1 business day | Backlog grooming |

## 9. Developer handoff checklist
- Include issue title, reproduction steps, screenshots/logs, time observed, accounts impacted.
- Confirm whether workaround exists.
- Prioritize in tracker with severity label.

Keep this procedure printed near the cashier PC and shared digitally with staff.
