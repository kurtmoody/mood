# Mood — Employee Knowledge Base

**Who this is for:** everyone at Mood Agency — account managers, project managers, designers, content people, interns, and leadership. You do **not** need to be technical to read this.
**What it's for:** to explain what Mood is, how it works, what every part does, and to answer the questions people actually ask. If you're not sure how something behaves, search this document first.
**How to read it:** skim the table of contents, jump to what you need. The **FAQ at the end (§19)** answers the most common "why is it doing that?" questions — start there if you're stuck.

> Status: living document, current with the platform as built. If something here doesn't match what you see on screen, tell the dev team — the screen is right and the doc needs fixing.

---

## Table of contents
1. [What Mood is, in one minute](#1-what-mood-is-in-one-minute)
2. [The big idea (why we built it this way)](#2-the-big-idea)
3. [Who uses Mood, and the two sides](#3-who-uses-mood)
4. [Plain-English glossary](#4-plain-english-glossary)
5. [Logging in](#5-logging-in)
6. [What you see when you log in (by role)](#6-what-you-see-by-role)
7. [The calendar](#7-the-calendar)
8. [Creating and editing content (posts)](#8-creating-and-editing-content)
9. [The approval workflow — the heart of Mood](#9-the-approval-workflow)
10. [Versions — what happens when you edit an approved post](#10-versions)
11. [Media and attachments](#11-media-and-attachments)
12. [Comments and internal notes](#12-comments-and-internal-notes)
13. [The client portal — how clients experience Mood](#13-the-client-portal)
14. [Clients (the CRM)](#14-clients-the-crm)
15. [Per-client ownership & the RACI matrix](#15-ownership-and-raci)
16. [Tasks — the internal to-do system](#16-tasks)
17. [The dashboard](#17-the-dashboard)
18. [Notifications](#18-notifications)
19. [The Admin area (admins only)](#19-the-admin-area)
20. [Frequently asked questions](#20-faq)
21. [Who to ask](#21-who-to-ask)

---

## 1. What Mood is, in one minute

Mood is **our own internal tool** for planning content for clients and getting it approved. Instead of juggling spreadsheets, WhatsApp threads, email chains and "did the client see this?" — everything lives on **one calendar**. The team plans posts there; clients log in, see their content, and **approve or ask for changes** in seconds.

It covers **all content types on one calendar** — Instagram, Facebook, LinkedIn, blog articles, newsletters — not just social.

**What Mood does NOT do** (on purpose): it does **not** publish or schedule posts to the actual social networks, it has no analytics, no social inbox, no AI writing, and it isn't white-labelled. It's a **planning and approval** tool. Publishing still happens wherever you publish today.

---

## 2. The big idea

Two promises shape every decision in Mood:

1. **Make the agency team faster.** Fewer tools, fewer "where's the latest version?" moments, one source of truth.
2. **Make client interaction effortless.** Clients approve in seconds with no friction — they log in with a link (no password to remember) and only ever see *their* content, only when it's ready for them.

Everything else (versions, statuses, notifications, ownership, tasks) exists to serve those two promises.

---

## 3. Who uses Mood

There are **two sides** to the same app:

- **The agency team (us).** We plan content, manage clients, drive content through approval, upload media, comment, and run our internal tasks. We see everything for our clients.
- **Clients.** They log in to a **restricted** version that shows only their own content, and only once it's been sent to them. They can approve, request changes, and comment. They cannot see our internal drafts, our notes, our tasks, or other clients.

Within the agency team there are two permission levels:
- **Admin** — can do everything, **plus** the Admin area (settings: the RACI matrix, and who else is an admin).
- **Member** — full access to clients, the calendar, tasks, etc., but **not** the Admin area.

---

## 4. Plain-English glossary

| Term | What it means |
|---|---|
| **Post / content item** | One planned piece of content (an Instagram post, a blog article, a newsletter…). It sits on a date on the calendar. |
| **Channel** | Where a post is meant to go for a client — e.g. that client's Instagram, Facebook, LinkedIn, blog or newsletter. Each client has their own channels. |
| **Status** | Where a post is in its journey, from draft to posted (see §9). |
| **Version** | A saved snapshot of a post's text and media. Editing a post that's already been sent to the client creates a **new version** so nothing gets quietly changed under the client's feet (see §10). |
| **Approval** | The client (or internally, the team) signing off on a post. |
| **Request changes** | The client (or team) sending a post back with a note saying what needs fixing. |
| **Client portal** | The restricted view a client logs into. |
| **Magic link** | The email link you click to log in — no password. |
| **Media** | Images, videos or PDFs attached to a post. |
| **Asset link** | A labelled link on a post (e.g. "Drive folder", "Raw footage", "Final exports"). |
| **Task** | An internal to-do item for the team (clients never see tasks). |
| **Internal note** | A private team note on a post or a task. **Clients never see internal notes** — they're separate from the client-facing comments. |
| **RACI** | A grid of who's Responsible / Accountable / Supporting / Consulted / Informed for each type of work. |
| **Ownership** | Who on the team owns which role for a specific client (Lead PM, Creative Lead, etc.). |
| **Dashboard** | A one-glance summary of what needs attention across all clients. |
| **Archive** | Marking a client as no longer active. Their posts and tasks are then hidden from the team's working views by default (with a "Show archived" toggle to bring them back). Reversible — you can reactivate any time. **Does not affect what the client sees** in their own portal. |
| **Invite** | An email-based way to give a teammate or a client contact access. They sign in with the normal magic link and access is granted automatically. |
| **Export** | A downloadable backup (a ZIP of spreadsheets) of everything attached to a client — taken before permanently deleting them. |
| **Grid view** | An agency-only, spreadsheet-style view of the calendar's posts grouped by client, for tracking production (designer, links, boost, budget, posted). |
| **Production details** | The behind-the-scenes fields on a post — Designer, Design status, Drive/high-res/posted links, Boost, Ad budget, Date posted. Editable in the Grid or in the post drawer; clients never see them. |
| **Designer** | The team member doing the design for a post (can be anyone in the directory, even without a login). Set in Production details. |
| **Timesheet** | Internal logging of time spent on a client (timer or manual entry). Agency-only; clients never see it. |
| **Capacity** | A per-person view of planned hours (a task's estimate spread over its start→due weeks) against a 40-hour week, on the dashboard. Hours only — visible to everyone. |
| **Job value** | The agreed price of a job (a task), with an invoice status (not invoiced / invoiced / paid). Admin/agency-internal. |
| **Cost per hour** | The agency's blended internal hourly cost (admins set it). Used to estimate time-cost in profitability. |
| **Profitability / margin** | Value − time-cost for a job, shown on the admin-only Reports page. Margin % = margin ÷ value. |

---

## 5. Logging in

Mood uses **magic links** — there's no password.

1. Go to the Mood login page and enter your email.
2. You get an email with a link. Click it.
3. You're in. The link logs you in and sets up your access automatically.

If you're a **client contact** who's been given portal access, the first time you log in the system automatically connects your account to your client (it matches your email). After that you just see your content.

If a link expires or doesn't work, just request a new one from the login page.

---

## 6. What you see by role

Mood shows you different things depending on who you are:

- **Agency member:** Calendar (all clients), Dashboard, Tasks, Clients, Team. Full controls on every post.
- **Agency admin:** everything a member sees, **plus** an **Admin** item in the sidebar (settings).
- **Client:** only the Calendar, showing **only their own content**, and only the controls that make sense for them (approve, request changes, comment).

The navigation hides what you're not allowed to use, and the system also blocks direct access — a client can't reach our internal pages even by typing the address.

---

## 7. The calendar

The calendar is the home screen for the agency. It shows planned posts on real dates.

- **Combined view (default).** By default you see **all clients at once**, so you get the whole week/month across the agency in one place.
- **Week / Month / Grid toggle.** Switch between week, month, and **Grid** (agency-only — a dense production tracker; see below). Dates are **Malta time**, and weeks start on **Monday**.
- **Move around.** Prev / Today / Next to change the week or month.
- **Colours.** Each client has a **calendar colour**. Every post is filled with its client's colour, with a small **status dot** showing where it is in the workflow. In the combined view there's a **colour → client legend** so you know whose is whose.
- **Filter by client.** Use the Clients filter to narrow to one or several clients. Your selection is saved in the page address, so you can bookmark or share a filtered view.
- **Open a post.** Click any post to open its detail panel (the "drawer") on the right, where everything about that post lives.
- **Drag to reschedule.** Agency users can **drag a post onto another day** (week or month view) to change its planned date — it keeps its time of day. If you drop it on a date in the past, Mood asks you to confirm, and (for approved/scheduled posts only) offers to mark it as posted. Clients can't drag.
- **Other filters.** You can filter by status, by channel, and there's a "Needs my review" toggle that shows just the posts waiting on you.
- **Archived clients.** Posts belonging to **archived** clients are hidden by default. A **"Show archived"** toggle brings them back (shown greyed out with an "Archived" tag). This is agency-only housekeeping — see §14.

### The Grid view (production tracker)

**Grid** (agency-only, third tab on the calendar) is a dense, spreadsheet-style tracker of the **same posts** as the calendar (the month you're on), **grouped by client** — like the old Monday board. Columns: post title, scheduled date, platform, **Designer**, **Design status**, overall status, **Boost**, **Ad budget**, **Drive link**, **High-res link**, Posted (Yes/No), **Posted link**, **Date posted**, and **PM**.

- **Edit production fields right in the grid** — Designer (any active team member, including directory-only people without a login), design status, the links, boost, ad budget, dates. Changes save as you go (on leaving a cell or toggling). These are the same "Production details" you'll find in a post's drawer.
- **Read-only in the grid:** the post title, scheduled date, the overall approval **status**, Posted (which is just "is the status Posted?"), and the PM (taken from the client's Lead PM). To change those, click the post title to open the full drawer (approval flow, caption, comments, etc.).
- It's the **same data as the calendar** — same posts, same client filter, archived clients hidden unless "Show archived". Clients never see the grid.

Clients see the same calendar idea, but only their own posts, and only from the point a post is sent to them onward. (Archiving a client never changes what that client sees in their own portal.)

---

## 8. Creating and editing content

**Create a post:** from the calendar, start a new post. You set the client, the channel, a title, the date it's planned for, and the body (the actual copy). You can attach media and add asset links.

**Edit a post:** open the post and edit it. **Important:** *how* an edit behaves depends on the post's status:
- If the post is still **internal** (draft, internal review, or changes-requested), your edit just updates it in place.
- If the post has **already been sent to the client** (client review, approved, scheduled, posted), editing creates a **new version** and sends the post back round for internal review first. This is on purpose — see §10. The app warns you before you do this.

This protects everyone: a client never has the thing they approved silently changed underneath them.

---

## 9. The approval workflow

This is the core of Mood. Every post moves through a series of **statuses**. Think of it as a track:

```
Draft → Internal review → Client review → (Approved or Changes requested) → Scheduled → Posted
```

Here's what each one means and who moves it:

| Status | What it means | Who moves it on |
|---|---|---|
| **Draft** | Being worked on internally. Not visible to the client. | Agency |
| **Internal review** | Ready for someone on the team to check before it goes to the client. | Agency |
| **Client review** | Sent to the client. **This is the first point the client can see it.** They're asked to approve or request changes. | Client |
| **Changes requested** | The client (or an internal reviewer) sent it back with a note on what to fix. | Agency picks it up, fixes, resubmits |
| **Approved** | The client signed off. | Agency |
| **Scheduled** | Approved and lined up to go out. | Agency |
| **Posted** | It's live (you published it on the actual platform). | Agency |

Key rules:
- **Clients only ever see posts from "Client review" onward.** Drafts and internal review are invisible to them.
- **Clients can only do two things:** approve, or request changes — and only while a post is in "Client review".
- **A note is required when requesting changes** (so the team knows what to fix). This applies to clients and to internal reviewers.
- **Every move is logged.** Each post has a history timeline in its detail panel showing who moved it where and when, with any notes.

---

## 10. Versions

A **version** is a saved snapshot of a post's body text, internal note, and media.

- While a post is **internal** (draft / internal review / changes requested), editing just updates the current version — no new versions pile up.
- Once a post has been **sent to the client** (client review and beyond), editing **forks a new version**: it makes a fresh copy, applies your changes there, and sends the post **back to internal review** so the team checks the new version before it goes to the client again.

Why: so that what a client saw and approved is preserved exactly. If you need to change an approved post, Mood treats that as "a new version that needs re-checking," not a silent edit.

**History:**
- The team can see **all versions** of a post.
- A client can only see versions that were **actually sent to them** — never internal drafts or in-between versions. (Internal notes are hidden from clients entirely.)

---

## 11. Media and attachments

**Media** = images, videos (MP4) and PDFs attached to a post. Only the agency uploads media; clients view it.

- Upload from the post's detail panel. Files are stored **privately** — they're never on a public link. Mood generates secure, temporary links to display them.
- You can **drag to reorder** media; the order is saved and is what the client sees.
- Posts with media show a thumbnail on the week view and a small image icon on the month view.

**Asset links** are different from media — they're **labelled links** (not uploaded files). Use them to point at a Drive folder, raw footage, final exports, etc. Presets are provided ("Drive folder", "Raw footage", "Final exports", or a free-text label). The agency manages them; clients can see them (read-only) once the post is in their view.

---

## 12. Comments and internal notes

There are **two** separate places to write on a post — don't mix them up:

- **Comments** — the **client-facing** thread. The agency and the client (once the post is visible to them) can both comment. Comments trigger notifications to the other side (see §18). You can delete your own comments (and the agency can moderate).
- **Internal notes** — a **private team-only** section on the post, clearly labelled "Internal notes — not visible to the client". Use this for anything you don't want the client to read. Only agency users see it; you can edit or delete your **own** notes. Tasks have the same internal-notes section (see §16).

Rule of thumb: if it's for the client, it's a **comment**; if it's for the team, it's an **internal note**.

---

## 13. The client portal

This is how a client experiences Mood. It's deliberately tiny and friction-free.

- **They log in with a magic link** (no password). The first login automatically links their account to their client (by email).
- **They see only their own content**, and only from "Client review" onward. They never see drafts, internal review, internal notes, our tasks, or any other client.
- **They can:** approve a post, request changes (with a note), comment, and view the media and asset links on posts that are visible to them.
- **They cannot:** create or edit posts, change statuses beyond approve/request-changes, see internal anything, or reach agency-only pages.

**Giving a client access:** two ways, both by email — the person just signs in with the normal magic link and access is granted automatically:
- The **portal access** toggle on a client's contact record (turn it on for that contact), or
- An **invite** on the client's page ("Invite to portal", choose Approver or Viewer). Pending invites are listed with a Revoke option.

**Removing access:** turning the portal-access toggle off **immediately** removes their access — even if they're already logged in. It only affects that one client (it won't touch any other access they have).

**Archived clients:** if a client is archived (§14), it makes **no difference to what that client sees** — their portal works exactly as before. Archiving only tidies *our* internal working views.

---

## 14. Clients (the CRM)

The **Clients** area is where we keep everything about a client.

- **Client list** and **create a new client.**
- **Client detail / edit:** name, status (prospect / active / paused / archived), website, industry, brand colour, calendar colour, and the account owner.
- **Internal info** (agency-only, never shown to the client): billing email, VAT number, billing address, payment terms, currency, retainer amount, internal notes.
- **Contacts:** the people at the client. One is marked primary. Each contact can be given portal access.
- **Brand assets:** logos, colours, fonts, guidelines, and other brand references.
- **Channels:** the client's Instagram / Facebook / LinkedIn / blog / newsletter etc.
- **Ownership:** who on our team owns which role for this client (see §15).
- **Invites:** invite a client contact to the portal by email (see §13).

> **Brand colour vs calendar colour:** these are two different things. **Brand colour** is the client's actual brand identity colour. **Calendar colour** is just the tag colour their posts get on the calendar — chosen for visual clarity, and it can differ from their brand.

### Archiving, reactivating, and deleting a client

From the **Clients list**, each row has an actions menu:

- **Archive** (any team member): tidies a client away when the engagement is dormant. Their posts and tasks drop out of the team's working views (calendar, tasks, dashboard) by default — but nothing is deleted, and the **client's own portal is unaffected**. There's a quick confirm.
- **Reactivate** (any team member): brings an archived client back; everything reappears automatically.
- **Delete permanently** (**admins only**, and only on **archived** clients): this is the irreversible one. It opens a two-step dialog:
  1. **Export client data** — download a ZIP backup (spreadsheets of the client, contacts, posts, comments, internal notes and tasks). Do this first; it's your only chance.
  2. **Confirm by typing the client's name**, then delete. This wipes the client and *all* their content, comments, notes and tasks for good.

You must **archive before you can delete** — there's no one-click delete of an active client.

### Managing the team

The **Team** page is the agency staff directory. You can add a member, **edit** their name/role/email, and **deactivate** (and later reactivate) them — deactivated members drop out of assignment dropdowns (task owner, ownership, RACI) but keep any login. There's an **Active / All** view so deactivated people aren't lost. Admins can also **permanently delete** a member, which first asks you to pick a **successor** to inherit their tasks, ownership and RACI.

### Timesheets (internal time logging)

If an admin switches on **Timesheet** for a client (on the client's page), a Timesheet section appears for logging internal time against that client. **Clients never see this.**

- **Timer** — hit **Start** to run a live timer; **Stop** saves it. The timer lives on the server, so it keeps running if you refresh or move around the app, and you can adjust the end time when you stop (handy if you forgot to stop it). You can only have **one timer running at a time**.
- **Manual entry** — log a block of time with a start and end (and an optional task + note) after the fact.
- **Entries list** — everyone's logged time for the client; you can edit or delete **your own** entries.

Time can be logged against a specific task for that client, or just against the client generally. (Logged time also feeds the profitability report — §19.)

---

## 15. Ownership and RACI

Two related things describe "who does what".

**Per-client ownership** (on each client's page, under "Ownership"): eight roles you can assign to team members for that specific client —
Lead PM, Comms backup, Creative lead, Design owner, Content owner, Video owner, Sales / ops, Intern support.
There's also a read-only **Ownership matrix** (linked from the Clients page) showing every client against those roles in one grid.

One nice automation: when you create a task for a client, Mood **suggests that client's Lead PM as the task owner** by default (you can change it).

**The RACI matrix** (in the Admin area) is the agency-wide responsibility grid: for each **type of work** (15 task types) it records who is **R**esponsible / **A**ccountable / **S**upporting / **C**onsulted / **I**nformed (and A/R = both accountable and responsible). It's seeded with our actual team and can be edited by admins.

In short: **ownership** = who owns roles for a *specific client*; **RACI** = who's responsible for each *type of work* across the agency.

---

## 16. Tasks

Tasks are the team's internal to-do system. **Clients never see tasks** — they're entirely internal.

Each task has: a title, an optional client (or "Internal" for non-client work), a task type, an owner, a status, a priority, a due date, a "next action", and notes — plus, for planning and reporting: an **estimated hours**, a **start date** (used by the capacity planner, §17), and a **value** with an **invoice status** (not invoiced / invoiced / paid) and a "value visible to client" toggle (used by the profitability report, §19; the toggle is a future gate — clients don't see values yet).

- **Statuses:** Not Started, In Progress, Waiting on Client, Ready for Review, Complete, On Hold.
- **Priorities:** Low, Medium, High, Urgent.

**Three ways to look at the same tasks** (a switcher at the top of the Tasks page; your choice is saved in the address bar so it's shareable):
- **List** — a sortable table. Filter by owner (including "My tasks"), status, and client. You can **customise the columns** — a "Columns" button lets you show/hide and drag to reorder them; your choice is remembered for you (the Task column always stays).
- **Kanban** — columns by status; **drag a card to another column** to change its status.
- **Calendar** — tasks plotted by due date on a month grid, with a "No date" tray for tasks without a due date. Overdue tasks are highlighted.

**Internal notes on a task:** open a task to add private team notes (the same internal-notes feature as on posts — see §12). Clients never see tasks or their notes.

**Archived clients:** tasks belonging to archived clients are hidden by default, with a "Show archived" toggle (same as the calendar). Internal tasks (no client) are never affected.

**Task notifications (who gets pinged).** Each task quietly has a few **subscribers**: the **owner**, the person **accountable** (the client's Lead PM, or whoever's Accountable for that task type in the RACI matrix), and the **creator**. They get a notification when the task is **assigned** and whenever its **status changes** — except you never get pinged for your own action. To keep it calm, **emails** only go out for the meaningful moments (a task assigned to you, or moved to **Complete**, **Waiting on Client**, **On Hold**, or **Ready for Review**); every other status change shows in the in-app bell only, no email. Clicking a task notification opens the Tasks page.

**Linking a task to a post:** a task can "serve" a specific post. From a post's detail panel you can **"Add task for this post"** (it pre-fills the client and links the task to that post). On the task side, you'll see which post it serves, with a link back to it. This connects the planning (calendar) and the doing (tasks).

**Filtering & sharing:** the filters and view are saved in the page address, so a filtered Tasks view can be bookmarked or shared. The dashboard's task breakdowns link straight into a pre-filtered Tasks page.

---

## 17. The dashboard

The **Dashboard** (agency-only) is a one-glance "what needs attention across all clients" view:

- **Needs your action** — posts in internal review or changes-requested.
- **Awaiting client** — posts in client review, flagging any that have been waiting more than a few days.
- **Tasks summary** — a prominent **overdue** count, plus open tasks broken down **by status**, **by owner**, and **by client**. Each breakdown links straight into a pre-filtered Tasks page.
- **Capacity** — a per-person, per-week view of **planned hours vs a 40-hour week**. Each task's estimated hours are spread evenly across its start→due weeks, so you can see who's overloaded and who has room. A range control switches between weeks and (further out) months. Alongside each person it shows honesty notes — hours that are estimated-but-undated ("unscheduled"), tasks with no estimate, and on-hold tasks — so the weekly numbers are upfront about what they leave out. This is about **hours only** — everyone on the team can see it; it never shows money.

It's read-only — it's there to tell you where to look, then you click through. Archived clients' posts and tasks are left out of these counts by default (there's a **"Show archived"** toggle), so the numbers match what you see on the calendar and Tasks views. (Capacity deliberately *does* count archived clients' tasks — committed work is still work.)

---

## 18. Notifications

Mood notifies the right people at the moments that matter (it's deliberately quiet — only meaningful events):

- A post is **sent to a client** → the client is notified ("ready for your review").
- A client **approves** or **requests changes** → the agency is notified.
- A **comment** is added → the other side is notified.
- A **task** is **assigned** or its **status changes** → the task's subscribers are notified (see §16). To stay quiet, only the meaningful task moments are emailed (assigned, Complete, Waiting on Client, On Hold, Ready for Review); the rest are in-app only.

You're never notified about your **own** action.

**Where notifications show up:**
- **The bell** (top bar, in-app): an unread count and a dropdown of recent items; click one to jump straight to the post — or to the Tasks page for a task notification. You can mark items read. The bell shows **everything**, including the in-app-only task nudges.
- **Email** (via our email service, Resend): **live**. When an email-worthy notification fires, the recipient also gets an email with the same message and an "Open in Mood" button. Some in-app items (minor task status changes) deliberately **don't** email.

---

## 19. The Admin area

Only **admins** see the **Admin** item in the sidebar. It's for agency-level settings:

- **RACI matrix** — edit the responsibility grid (who's A/R/S/C/I for each task type). It's a grid of dropdowns; set them and save.
- **Team access** — promote or demote team members between **Admin** and **Member**. There's a safety rule: **you can't remove the last admin** — at least one admin must always exist (the control is disabled for the final admin). This page also has the **invite a teammate** panel (invite an agency member by email; pending invites listed with Revoke).
- **Cost per hour** — set the agency's blended internal hourly cost. This is sensitive and **admins only** — it feeds the profitability report's cost side. Leave it blank if you don't want margins calculated.

If you need to be made an admin, ask one of the current admins (Michelle or Sandrina).

### Reports — profitability (admins only)

A separate **Reports** item in the sidebar (admins only) shows **profitability per job**: for each job (task with a value or logged time), grouped by client — its **Value** (the full agreed price), the **Cost** (time logged in the selected date range × the cost-per-hour rate), the **Margin** and margin %, and its **invoice status**. Each client gets a subtotal, an "**Unattributed time**" line for time logged against the client but not a specific job, and a **"to invoice"** figure (the value of jobs not yet invoiced). There's a grand total and date-range presets (day/week/month/quarter/year/custom).

Two honesty points it shows you:
- **Value isn't split across dates** — it's the full price, while cost only counts time logged in the chosen range. So for a job still in progress, a narrow range shows only part of its cost, and the margin is partial. Margins are accurate for fully-logged jobs.
- If **no cost rate is set**, costs and margins can't be calculated — it says so (rather than pretending everything is 100% margin) and points you to Admin → Cost per hour.

**Money lives only here.** The dashboard's capacity view (hours) is for everyone; **euros — value, cost, margin — are admin-only and appear only on Reports.**

---

## 20. FAQ

**General**

**Q: Is Mood where I actually publish posts to Instagram/Facebook?**
No. Mood is for **planning and approval**. Publishing still happens wherever you publish today. Mood doesn't connect to the social networks.

**Q: Do I need a password?**
No — you log in with a magic link sent to your email. If the link doesn't work, request a new one.

**Q: Can clients see other clients' content?**
Never. A client only sees their own content, and only once it's been sent to them.

**Q: Can clients see our internal notes, drafts, or tasks?**
No. Drafts and internal review are invisible to clients, internal notes are hidden, and tasks are entirely internal.

**The calendar & posts**

**Q: Why is a post a certain colour?**
Each client has a **calendar colour**; posts are filled with their client's colour. The little dot on the post shows its **status**.

**Q: The calendar looks empty / won't load — what do I do?**
If there's genuinely nothing planned, it'll be empty. If you see a "Couldn't load — please refresh" notice, refresh the page; if it persists, tell the dev team (it means a real error, not just "no posts").

**Q: Why can't I edit this post normally — it warned me about a "new version"?**
Because the post has already been sent to the client (it's in client review or beyond). Editing it creates a **new version** and sends it back for internal review, so the client's approved version is preserved. That's intended.

**Q: I edited an approved post and now it's back in "internal review" — is that a bug?**
No. Editing a post that the client had already seen forks a new version and bounces it back for re-checking before it returns to the client. See §10.

**Q: What's the difference between brand colour and calendar colour?**
Brand colour = the client's real brand identity colour. Calendar colour = the tag colour their posts get on the calendar. They're separate on purpose.

**Q: Can I move a post to a different day?**
Yes — drag it onto another day in the week or month view (agency only). It keeps its time. Dropping it on a past date asks you to confirm.

**Q: A client's posts vanished from my calendar / dashboard.**
The client was probably **archived**. Their posts and tasks are hidden by default from our working views — flip **"Show archived"** to see them (greyed, tagged "Archived"), or reactivate the client. The client's own portal is unaffected either way.

**Internal notes**

**Q: What's the difference between a comment and an internal note?**
A **comment** is client-facing (the client can see and reply). An **internal note** is team-only and clearly labelled "not visible to the client". Both live on the post; tasks also have internal notes. If it's for the client, comment; if it's for the team, internal note.

**Q: Can the client see internal notes?**
No — never. They're agency-only.

**Approval workflow**

**Q: What does "Changes requested" mean?**
The client (or an internal reviewer) sent the post back with a note saying what to fix. Pick it up, make the changes, and resubmit it through internal review.

**Q: A client requested changes but I can't see why.**
A note is required when requesting changes — check the post's history timeline / comments in its detail panel.

**Q: Who can approve a post?**
Internally, the team moves posts from draft up to "client review". From "client review", the **client** approves or requests changes. The team then schedules and marks as posted.

**Q: Can I approve on the client's behalf?**
The client approval is theirs to give from their portal. If you need to record sign-off differently, talk to your PM — don't work around the workflow.

**Clients & access**

**Q: How do I give a client access to the portal?**
Either turn on **portal access** on the contact record, or use **Invite to portal** on the client's page (Approver or Viewer). Either way they log in with their email and are connected automatically on first login.

**Q: I turned off a client's access — when does it take effect?**
Immediately, even if they're currently logged in. It only affects that one client.

**Q: How do I archive a client, and what happens?**
From the Clients list, use the row's actions menu → **Archive**. Their posts and tasks drop out of our calendar/tasks/dashboard by default; nothing is deleted and their portal is unaffected. **Reactivate** any time to bring it all back.

**Q: How do I permanently delete a client?**
First archive it. Then (admins only) open the archived client's delete dialog: **export the data** (a ZIP backup), then **type the client's name** to confirm. This is irreversible and removes all their posts, comments, notes and tasks.

**Q: What's in the client export?**
A ZIP of spreadsheets (CSVs): the client, contacts, posts, comments, internal notes, and tasks — everything you're allowed to see. It's meant as a backup to take before deleting.

**Team**

**Q: Someone left the team — what do I do?**
**Deactivate** them on the Team page (they drop out of assignment lists but keep their login). Use the **Active / All** toggle to find deactivated people. Admins can **permanently delete** a member, which asks you to choose a **successor** to inherit their tasks, ownership and RACI first.

**Q: How do I customise the Tasks columns?**
On the Tasks **List** view, click **Columns** to show/hide and drag to reorder. Your layout is saved for you. (The Task title column always stays.)

**Q: Will I get pinged about tasks?**
Yes — if you're a task's owner, the accountable person (the client's Lead PM), or its creator, you're notified when it's assigned and when its status changes. You won't be notified about your own changes, and only the meaningful status moves (Complete, Waiting on Client, On Hold, Ready for Review) send an email — the rest are bell-only.

**Content grid**

**Q: What's the Grid view on the calendar?**
An agency-only, spreadsheet-style tracker of the same posts as the calendar, grouped by client, where you edit production fields (designer, links, boost, budget, posted) inline. It's the modern replacement for the Monday content board. Clients never see it.

**Q: Why can't I change a post's status or date from the Grid?**
Those are read-only in the grid on purpose — status changes go through the approval flow and dates through the calendar/drawer. Click the post title in the grid to open its drawer for everything else.

**Q: Two of us edited the same post's production fields — whose wins?**
Last save wins for the whole row. It's fine at our size, but if you and a colleague are editing the *same* post's production details at the same moment, coordinate so one doesn't overwrite the other.

**Q: A client says they logged in but see nothing.**
They'll only see posts that are in "client review" or later. If everything for them is still internal, there's nothing for them to see yet. Also confirm their contact has portal access and their login email matches the contact email.

**Timesheets & reporting**

**Q: How do I log time on a client?**
If the client has Timesheet switched on (an admin does that on the client's page), use the Timesheet section there — Start/Stop the timer, or add a manual entry. Clients never see any of it.

**Q: My timer is still running from yesterday — did I lose the time?**
No. The timer runs on the server, so it survives refreshes and navigation. When you Stop it, you can correct the end time to when you actually finished.

**Q: Who can see job values, costs and margins?**
Only **admins**, and only on the **Reports** page. The dashboard's capacity view (hours) is for everyone, but money — value, cost, margin — is admin-only. Clients never see values.

**Q: The Reports margins look too good / show no cost.**
Two likely reasons: no **cost-per-hour** is set (Admin → Cost per hour) so cost can't be calculated; or you're looking at a narrow date range — value is the full price but cost only counts time logged in that range, so an in-progress job shows a partial (over-stated) margin. Margins are accurate for fully-logged jobs.

**Q: Why is a person shown as overloaded on the capacity view?**
Their assigned tasks' estimated hours, spread across each task's start→due weeks, exceed 40 in that week. Adjust estimates, dates, or who owns what.

**Tasks**

**Q: Can clients see tasks?**
No — tasks are internal only.

**Q: How do I change a task's status quickly?**
In the **Kanban** view, drag the card to another column. Or open the task and change its status. In the list there's also a one-click "mark complete".

**Q: Why did a new task default to a particular owner?**
If the task is for a client, Mood suggests that client's **Lead PM** as the default owner. You can change it.

**Q: How do I link a task to a specific post?**
Open the post, use **"Add task for this post"** — it pre-fills the client and links them. The task will then show which post it serves.

**Q: I filtered the Tasks page — can I share that view?**
Yes. Filters and the chosen view are saved in the page address, so you can copy the link.

**Notifications**

**Q: A client didn't get an email notification.**
Email delivery is **live** (via Resend). A few reasons one might not arrive: the recipient's account has no email on file; it landed in spam; or **the action was yours** — Mood skips emailing the person who did the thing (you won't be emailed about your own change). The in-app bell is the source of truth — if the bell shows it but no email arrived, tell the dev team (they can check the Resend send logs).

**Q: I'm getting too few/too many notifications.**
Mood is deliberately quiet — it only notifies on meaningful events (sent to client, approved, changes requested, comments). Per-person notification preferences are a planned future feature.

**Admin & permissions**

**Q: What's the difference between Admin and Member?**
Members have full access to clients, the calendar, and tasks. **Admins** can additionally use the **Admin area** (RACI editor and Team access). Today Michelle and Sandrina are admins.

**Q: How do I make someone an admin?**
An admin goes to **Admin → Team access** and switches that person to Admin.

**Q: Why can't I demote the last admin?**
There must always be at least one admin. The control is disabled on the final admin to prevent locking everyone out.

**Q: I can't see the Admin area.**
You're a Member, not an Admin. Ask an admin if you need access.

**Something's wrong**

**Q: A page says I'm not allowed / sent me back to the calendar.**
You tried to reach a page your role can't use (e.g. a client reaching an agency page, or a member reaching Admin). That's expected.

**Q: Something looks broken or behaves unexpectedly.**
Note what you did and what happened, and tell the dev team (see §21). If you saw an error notice, mention it.

---

## 21. Who to ask

- **How to use Mood / process questions** → your PM, or whoever owns the relevant client (see that client's **Ownership**).
- **Access / "make me an admin" / portal invites** → an agency admin (currently **Michelle** or **Sandrina**).
- **Something is broken, slow, or wrong** → the dev team. Include: what you were doing, what you expected, what happened, and any on-screen error.
- **"Who's responsible for this kind of work?"** → the **RACI matrix** in the Admin area, or ask an admin.

> This document describes how Mood behaves today. The platform evolves — if reality and this guide ever disagree, the platform is right; please flag it so we can update this.
