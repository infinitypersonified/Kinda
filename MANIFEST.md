# Kinda patch 2: file manifest

This patch includes everything from the previous patch, so you can copy all of it over your project and let it
overwrite. Folders keep their original paths. Nothing else needs touching, and `package.json` is unchanged.

| File | Action | What changed |
|---|---|---|
| `src/App.jsx` | Replace | Fast start from saved data; no more forced splash; streak message fix; chat opens on the newest message; admins, removing members, assigning to chosen people; circle weekly report window; "Unauthenticated" no longer shown; moved tasks remember their original day. |
| `src/weekly.jsx` | Replace | Weekly summary now counts a task you moved without finishing as **not done** on the day you planned it; new circle weekly report (owner/admin) with PDF and CSV. |
| `src/styles.css` | Replace | Styles for member rows and menus, assign-to-people picker, circle report window. |
| `src/cloudApi.js` | Replace | New routes: set admin, remove member, circle weekly report. |
| `src/emoji.js` | Add (unchanged from patch 1) | Emoji data for the chat picker. |
| `convex/schema.ts` | Replace | `role` on circle members; `movedFrom` on tasks; (patch 1) assignments table and indexes. |
| `convex/workspace.ts` | Replace | Roles (owner / admin / member), `setCircleAdmin`, `removeCircleMember`, assigning to chosen people, `circleWeekly`, moved-task history, 80% streak (patch 1). |
| `convex/auth.ts` | Replace | Password reset email now goes through `mailer.ts`. Your existing Resend setup keeps working. |
| `convex/mailer.ts` | **Add** | Sends email through a Gmail script, Brevo, or Resend, whichever is configured. |

## Deploy steps (the order matters)

1. Copy the files in, keeping the paths.
2. Run `npx convex deploy` for the deployment your site uses (production if Vercel points at production).
   **The streak, roles, assignments and weekly report only work after this step.** If the streak shows
   "undefined%" or odd numbers, the backend has not been deployed yet.
3. Commit and push so Vercel rebuilds.

## Password reset without Resend

Set **one** of these in the Convex dashboard (Settings, Environment Variables). `SITE_URL` must stay set.

**Option A: send from your own Gmail (no domain, no sign-up)**
1. Go to script.google.com, then New project, and paste this (change the secret):
```js
const SECRET = "put-a-long-random-secret-here";
function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  if (data.secret !== SECRET) return ContentService.createTextOutput("forbidden");
  MailApp.sendEmail({ to: data.to, subject: data.subject, htmlBody: data.html, name: "Kinda" });
  return ContentService.createTextOutput("ok");
}
```
2. Deploy, then New deployment, type **Web app**, Execute as **Me**, Who has access **Anyone**. Approve the permissions and copy the Web app URL.
3. In Convex set `EMAIL_WEBHOOK_URL` to that URL and `EMAIL_WEBHOOK_SECRET` to the same secret.
Free Gmail allows roughly 100 recipients a day, and emails come from your Gmail address.

**Option B: Brevo (free, 300 emails a day)**
1. Create a Brevo account, add and verify one sender email address (a click in your inbox, no domain needed), then create an API key.
2. In Convex set `BREVO_API_KEY` and `EMAIL_FROM` (the verified address).

**Option C: Resend** keeps working with `RESEND_API_KEY` and `EMAIL_FROM` as before.

## Things to know

- **Weekly report history:** a task you move from now on remembers the day it was moved from. Tasks you moved before
  this patch have no record, so older weeks cannot be corrected.
- **Removed members** can only return with a new invite link. Use "Revoke" on the invite link if you also want the old link to stop working.
- **Admins** can assign tasks, remove regular members, add members, and download the circle report. Only the owner can
  make or remove admins, and only the owner can remove an admin.
- **Fast start:** after the first visit Kinda shows your last saved tasks immediately and refreshes them in the background.
  Saved data is removed when you log out.
