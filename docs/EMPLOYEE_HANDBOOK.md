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
12. [Comments](#12-comments)
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
| **RACI** | A grid of who's Responsible / Accountable / Supporting / Consulted / Informed for each type of work. |
| **Ownership** | Who on the team owns which role for a specific client (Lead PM, Creative Lead, etc.). |
| **Dashboard** | A one-glance summary of what needs attention across all clients. |

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
- **Week / Month toggle.** Switch between a week view and a month view. Dates are **Malta time**, and weeks start on **Monday**.
- **Move around.** Prev / Today / Next to change the week or month.
- **Colours.** Each client has a **calendar colour**. Every post is filled with its client's colour, with a small **status dot** showing where it is in the workflow. In the combined view there's a **colour → client legend** so you know whose is whose.
- **Filter by client.** Use the Clients filter to narrow to one or several clients. Your selection is saved in the page address, so you can bookmark or share a filtered view.
- **Open a post.** Click any post to open its detail panel (the "drawer") on the right, where everything about that post lives.
- **Other filters.** You can filter by status, by channel, and there's a "Needs my review" toggle that shows just the posts waiting on you.

Clients see the same calendar idea, but only their own posts, and only from the point a post is sent to them onward.

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

## 12. Comments

Each post has a comments thread. The agency and the client (once the post is visible to them) can both comment. Comments trigger notifications to the other side (see §18). You can delete your own comments (and the agency can moderate).

---

## 13. The client portal

This is how a client experiences Mood. It's deliberately tiny and friction-free.

- **They log in with a magic link** (no password). The first login automatically links their account to their client (by email).
- **They see only their own content**, and only from "Client review" onward. They never see drafts, internal review, internal notes, our tasks, or any other client.
- **They can:** approve a post, request changes (with a note), comment, and view the media and asset links on posts that are visible to them.
- **They cannot:** create or edit posts, change statuses beyond approve/request-changes, see internal anything, or reach agency-only pages.

**Giving a client access:** on a client's contact record there's a "portal access" toggle. Turning it on invites that contact; when they log in, they're connected automatically.

**Removing access:** turning the toggle off **immediately** removes their access — even if they're already logged in. It only affects that one client (it won't touch any other access they have).

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

> **Brand colour vs calendar colour:** these are two different things. **Brand colour** is the client's actual brand identity colour. **Calendar colour** is just the tag colour their posts get on the calendar — chosen for visual clarity, and it can differ from their brand.

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

Each task has: a title, an optional client (or "Internal" for non-client work), a task type, an owner, a status, a priority, a due date, a "next action", and notes.

- **Statuses:** Not Started, In Progress, Waiting on Client, Ready for Review, Complete, On Hold.
- **Priorities:** Low, Medium, High, Urgent.

**Three ways to look at the same tasks** (a switcher at the top of the Tasks page; your choice is saved in the address bar so it's shareable):
- **List** — a sortable table. Filter by owner (including "My tasks"), status, and client.
- **Kanban** — columns by status; **drag a card to another column** to change its status.
- **Calendar** — tasks plotted by due date on a month grid, with a "No date" tray for tasks without a due date. Overdue tasks are highlighted.

**Linking a task to a post:** a task can "serve" a specific post. From a post's detail panel you can **"Add task for this post"** (it pre-fills the client and links the task to that post). On the task side, you'll see which post it serves, with a link back to it. This connects the planning (calendar) and the doing (tasks).

**Filtering & sharing:** the filters and view are saved in the page address, so a filtered Tasks view can be bookmarked or shared. The dashboard's task breakdowns link straight into a pre-filtered Tasks page.

---

## 17. The dashboard

The **Dashboard** (agency-only) is a one-glance "what needs attention across all clients" view:

- **Needs your action** — posts in internal review or changes-requested.
- **Awaiting client** — posts in client review, flagging any that have been waiting more than a few days.
- **Tasks summary** — a prominent **overdue** count, plus open tasks broken down **by status**, **by owner**, and **by client**. Each breakdown links straight into a pre-filtered Tasks page.

It's read-only — it's there to tell you where to look, then you click through.

---

## 18. Notifications

Mood notifies the right people at the moments that matter (it's deliberately quiet — only meaningful events):

- A post is **sent to a client** → the client is notified ("ready for your review").
- A client **approves** or **requests changes** → the agency is notified.
- A **comment** is added → the other side is notified.

**Where notifications show up:**
- **The bell** (top bar, in-app): an unread count and a dropdown of recent items; click one to jump straight to the post. You can mark items read.
- **Email** (via our email service): the same message, by email. *Note:* email delivery is the one piece still being finalised — the in-app bell works today; email goes live once the email integration is switched on.

---

## 19. The Admin area

Only **admins** see the **Admin** item in the sidebar. It's for agency-level settings:

- **RACI matrix** — edit the responsibility grid (who's A/R/S/C/I for each task type). It's a grid of dropdowns; set them and save.
- **Team access** — promote or demote team members between **Admin** and **Member**. There's a safety rule: **you can't remove the last admin** — at least one admin must always exist (the control is disabled for the final admin).

If you need to be made an admin, ask one of the current admins (Michelle or Sandrina).

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
On the client's contact record, turn on **portal access** for that contact. They'll be able to log in with their email, and they're connected automatically on first login.

**Q: I turned off a client's access — when does it take effect?**
Immediately, even if they're currently logged in. It only affects that one client.

**Q: A client says they logged in but see nothing.**
They'll only see posts that are in "client review" or later. If everything for them is still internal, there's nothing for them to see yet. Also confirm their contact has portal access and their login email matches the contact email.

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
The in-app **bell** works now; **email delivery is still being switched on**. Until then, don't rely on email reaching the client — the bell and a nudge are your friends. (Ask the dev team for the current status.)

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
