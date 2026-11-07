# LEFT: No ticket behind

_Look, Every Fix Tracked._

For each OCISDEV sprint (or date range), this dashboard shows every ticket with
its GitHub PRs, the GitHub issues they close and their backports per
`stable-*` branch. It flags the tickets that need attention:

| Flag                     | Meaning                                                                          |
| ------------------------ | -------------------------------------------------------------------------------- |
| `No PR`                  | No PR found in the selected repos.                                               |
| `PR open`                | The main PR is not merged yet (warning).                                         |
| `Backport missing`       | A fixVersion like `Frances - 9.0.0` requires `stable-9.0`, but no PR targets it. |
| `Backport open`          | The required backport exists but isn't merged (warning).                         |
| `Backport stale`         | The open backport is older than 7 days, besides `Backport open` (see below).     |
| `Not linked in Jira`     | The PR belongs to the ticket, but the ticket's Jira links don't list it.         |
| `No key in PR`           | The PR belongs to the ticket, but its title and branch lack the key.             |
| `Issue not linked to PR` | A GitHub issue mentions the key, but none of the ticket's PRs is linked to it.   |

Everyone signs in with their **own** Atlassian and GitHub accounts and sees only
what those accounts can see. The dashboard only reads, unless you turn on
[Link in Jira](#linking-prs-in-jira). Nothing is stored: links are worked out on every
request, and results are cached in memory for 5 minutes per user.

## How tickets and PRs are matched

Jira is the starting point: only tickets in the chosen sprint (or updated in
the chosen dates) are shown, in any status. For each ticket, the dashboard then
looks on GitHub:

1. It searches each selected repo for the key. GitHub searches PR titles,
   descriptions and comments, but **not branch names**.
2. It fetches the PRs the ticket's Jira links point to that the search missed.
3. It searches for PRs whose description mentions a found PR's number, to find
   backports without the key (repeated, so backports of backports are found).

A PR belongs to a ticket if **any** of these is true:

1. The PR title contains the key (`[OCISDEV-1464]`). A key in the branch name
   (`fix/ocisdev-1464`) counts too, but only for PRs found another way.
2. The ticket's Jira remote links point to the PR.
3. It is a backport whose description says e.g. `backports: #N`,
   `Backport of #N` or `Backports #N` (a link to the PR works too), and PR #N
   belongs to the ticket.

A key that appears only in a PR's description is shown under "Only mentioned
in": such a PR is listed for information, but it doesn't count as the ticket's
PR, isn't checked, and doesn't affect branches. "See also OCISDEV-1473" doesn't
mean the PR fixes that ticket.

**Where the fix is** comes from each PR's target branch on GitHub, not from the
branch's commits. A PR into `stable-9.0` that is merged makes `stable-9.0`
**merged**; one that is open makes it **open**. Any PR into a release branch
(`stable-X.Y`) counts as a backport, whether or not Jira lists it. Commit IDs
aren't used, so a cherry-pick pushed straight to a branch without a PR isn't
seen.

**GitHub issues:** an issue belongs to a ticket when its title or description
has the key, e.g. `## [OCISDEV-1600]`. The same search that finds the PRs finds
these issues, so this costs no extra requests. If the ticket has PRs but none
of them is linked to an **open** issue (`Fixes owner/repo#N` in the PR
description, or the PR's Development sidebar), the ticket gets `Issue not
linked to PR`. Closed issues are skipped: a linked issue closes when its PR is
merged, so a forgotten link leaves the issue open. Links from PRs closed
without merging don't count.

"Master" below means the repo's default branch (`master` for oCIS, `main` for
reva).

**fixVersion → branch:** the version number is read from the name
(`Curie S9 - 8.0.10` → `stable-8.0`). A name without a number (`Ghez`) means
the fix ships from master, so no backport is expected. Backports are only
expected in repos where the ticket has a PR and the branch exists.

**Already on the branch:** a stable branch already contains a fix when every
master PR of the ticket (except PRs closed without merging) was merged before
the branch was cut from master. The dashboard asks GitHub for each branch's
merge base, and shows such branches as **included** instead of asking for a
backport. Example: #11152 was merged in July 2025, and `stable-8.1` was cut in
May 2026, so `stable-8.1` already has the fix. If a follow-up PR was merged
after the cut, or is still open, the branch lacks part of the fix, so a
backport is still asked for.

PRs closed without merging still show in the ticket's details, but they are
not checked for Jira links or keys.

## Try it without any setup

```bash
pnpm install
pnpm demo           # or: DEMO_MODE=true docker compose up --build
```

Open <http://localhost:5173>. Demo mode serves sample tickets and PRs, so you
don't need OAuth apps or secrets. The sample data includes small delays so the
loading progress is visible.

## Setup

You need Node 22+ and pnpm (or Docker), plus two OAuth apps. The pnpm version
is pinned in `package.json`; `corepack enable` (bundled with Node) or any
recent pnpm picks it up. Registering them doesn't
need admin rights.

### 1. Atlassian OAuth 2.0 (3LO) app

1. Go to <https://developer.atlassian.com/console/myapps/> and choose
   **Create → OAuth 2.0 integration**.
2. Under **Permissions**, add the Jira API and the scopes listed in
   `ATLASSIAN_SCOPES` in `.env.example`. These are Jira read access, Jira
   Software board and sprint read access, and `offline_access`. The scopes in
   the console and in `.env` must match. Optionally add `write:jira-work` to
   both for [Link in Jira](#linking-prs-in-jira); `setup.sh` includes it.
3. Under **Authorization**, set the callback URL to
   `http://localhost:5173/auth/atlassian/callback`.
4. Under **Distribution**, enable sharing so teammates can sign in, not just
   the app owner.
5. Under **Settings**, copy the client ID and secret.

### 2. GitHub OAuth App

1. Go to <https://github.com/settings/developers> and choose **New OAuth App**.
2. Set the callback URL to `http://localhost:5173/auth/github/callback`.
3. Copy the client ID and generate a client secret.

### 3. Configure

```bash
cp .env.example .env   # fill in both apps, ATLASSIAN_SITE_URL and SESSION_SECRET (openssl rand -hex 32)
```

## Run

**Development** (hot reload; Vite on :5173 proxies `/api` and `/auth` to the server on :3000):

```bash
pnpm install
pnpm dev
```

**Docker** (one container serves the web app and the API):

```bash
docker compose up --build
```

Either way, open <http://localhost:5173>. Both modes use port 5173, so the same
OAuth callback URLs work for both.

## Using it

- **Choose tickets by sprint, by dates or by release.** Sprint mode starts on
  the current sprint. If the project has several scrum boards, a board picker
  appears. In dates mode, tickets updated in Jira within the range are shown;
  use **Single day** for one date. Release mode shows every ticket of one fix
  version with a go/no-go verdict; see [Release readiness](#release-readiness).
- **Repositories:** `owncloud/ocis` is the default. Use **Add repository** for
  others (e.g. `owncloud/reva`), and click a repo to leave it out without
  removing it. The list is saved in your browser.
- **Where the fix is:** each ticket lists only its own branches, so the table
  stays the same width however many stable branches exist. Each branch has
  one line, e.g. `stable-8.1 included`. The possible states are:
  - merged
  - included (merged to master before the branch was cut, so no backport is
    needed; the note reads e.g. "already in stable-8.1: merged to master 24 Jul
    2025, before the branch was cut 22 May 2026")
  - open
  - closed (only PRs closed without merging)
  - missing
  - no PR

  A stable branch that no fix version asks for (the ticket was backported
  there anyway) is marked "not asked for by a fix version". A PR into a
  feature branch gets its own line, marked "feature branch, not in master
  yet", so it never counts as merged into master.

  Long PR lists show two PRs and "N more"; **Details** lists them all.

- **Each ticket** shows its Jira status as a chip (outline for to do, light
  fill in progress, darker fill when done) and its assignee. A ticket that is
  done in Jira but still has something to fix says so in red, e.g. "Done · 1
  problem".
- **Filters** sit above the table:
  - The counts under the title filter by problem, grouped into things to fix
    and things to wait for.
  - **Any branch** narrows the list to one branch, e.g. "Missing on
    stable-8.0".
  - Search finds tickets by key or summary; press `/` to jump to it.
  - The assignee filter has "Assigned to me", which uses your Atlassian
    account. Press `i` to switch it on or off.
  - A filter that hides tickets is tinted, and the headline says what it
    keeps ("Showing 20 of 77 tickets: assigned to you"), with **Clear
    filters**.
- **Keyboard:** shortcuts work anywhere on the page except while you type in a
  field, and never with Ctrl, Cmd or Alt held.

  | Key            | Does                                                             |
  | -------------- | ---------------------------------------------------------------- |
  | `j` / `k`      | Move the highlight to the next / previous ticket                 |
  | `l` / `h`      | Open / close the highlighted ticket's Details                    |
  | `o` or `Enter` | Flip the Details (`Enter` leaves a focused link or button alone) |
  | `i`            | Switch "Assigned to me" on or off                                |
  | `/`            | Jump to search                                                   |
  | `Esc`          | Close all open Details                                           |

  `j` starts at the first ticket when nothing is highlighted. The highlight
  clears when its ticket leaves the list, e.g. through a filter.

- **Links:** the address bar holds the sprint (or dates) and the filters, so a
  link or bookmark opens the same view.
- **Sort:** newest first by one date; with a date sort on, each row shows it.
  The choice is saved in your browser.
  - **Jira order** (default): the board's order, or most recently updated
    first in dates mode.
  - **Updated in Jira:** changes with anything on the ticket (status, comment,
    assignee, fields, links).
  - **Created in Jira:** when the ticket was opened.
  - **Last PR activity:** the newest GitHub "updated" time of the ticket's PRs,
    which moves with pushes, reviews, comments, edits, merging and closing.
  - **Last PR merged:** the newest merge date of the ticket's PRs; tickets with
    nothing merged go last.
- **Mark fixed:** when you've checked a ticket by hand (e.g. a PR was
  reverted and the real fix is elsewhere), click **Mark fixed**. The ticket
  stays in the list (moved below the ones that still need attention), shows
  "Marked fixed by you" with its problems struck through, and no longer counts
  as needing attention. **Needs attention again** undoes it. If the ticket gets
  a new problem later, the mark stops counting and the row says so. Marks are
  saved in your browser only.
- **Other repositories:** when Jira links a ticket to PRs in a repository you
  haven't selected, the row says so. Click the repo name to add it.
- **Details** on a row explains what to fix, with links to act on it (**Open
  PR**, **Open in Jira**, **Copy PR link** to paste into the ticket's links),
  why each PR was matched, and which PRs only mention the key. `Esc` closes
  open details. Hovering a branch state explains it; hovering a PR number
  shows why it counts for the ticket and, for an open PR, its
  [health](#pr-health).
- **Link in Jira:** see [Linking PRs in Jira](#linking-prs-in-jira).
- **Progress:** while loading, the status line shows the current step (Jira
  tickets, Jira links, GitHub search, backports) with a count, and the Jira
  tickets are listed as soon as they arrive, before GitHub is checked. Results are
  cached for 5 minutes; **Refresh** fetches fresh data.
- **Theme:** the menu in the top bar switches between **System theme**
  (follows your OS), **Light** and **Dark**. The choice is saved in your
  browser.

### Release readiness

**Release** (next to Sprint and Dates) loads every ticket whose fix version is
the chosen one, in any status, and says whether the version can ship. The
picker lists unreleased versions first, the next release date at the top, then
released ones; archived versions are left out. It opens on the next release.

The verdict is **Go** when every ticket is done in Jira and its fix is where
the version ships from, and **No-go** otherwise. Under a No-go, the blocking
tickets are counted by reason, e.g. `Not done in Jira 87` · `Not on stable-9.0
21` · `No PR 12` (a ticket can count under several). Click a count, or **All
blockers**, to list those tickets in the table; the headline then says what is
shown, with **Clear filters**, and each listed row says why it blocks. Click
the count again to show every ticket.

- **Where a version ships from:** its release branch, e.g. `stable-9.0` for
  `Frances - 9.0.0` (or what `BRANCH_TEMPLATES` names for that repo). If the
  branch isn't cut yet, or the version has no number (`Ghez`), the repo's
  default branch is checked instead, and the verdict says so.
- **What blocks:** a ticket that isn't done in Jira; a ticket without a PR (PRs
  closed without merging don't count); a fix that isn't merged on that branch,
  or isn't already in it from before the branch was cut. Only repos the ticket
  has PRs in are checked.
- **What doesn't block:** missing Jira links, keys in PRs and linked issues are
  "things to tidy", counted under the verdict. Backports a ticket needs for
  _another_ fix version don't count for this one; the table still shows them.
- **Marked fixed** tickets don't block on their PRs, but still block if Jira
  says they aren't done.
- The verdict always covers every ticket of the version. Filters only narrow
  the table.
- The address bar holds the version and the chosen blockers
  (`?mode=release&version=…&blocking=not-done`), so a link opens the same view.

### Linking PRs in Jira

With `write:jira-work` in `ATLASSIAN_SCOPES` (and in the Atlassian console),
each "Not linked in Jira" problem in **Details** gets a **Link in Jira**
button. It adds the PR to the ticket as a web link titled `backport #11152`
for a backport and `PR #11152` for any other PR, with your own Atlassian account, and the problem
goes away. **Copy PR link** and **Open in Jira** stay next to it for linking by
hand. Without the scope the dashboard only reads, as before.

- The server first rebuilds the report and only links a PR that belongs to the
  ticket and is missing from its links. A PR listed under "Only mentioned in"
  can't be linked from the dashboard: the link would make it count as the
  ticket's PR.
- The server re-reads the ticket's links right before writing, so a link that
  someone just pasted by hand isn't duplicated. Linking twice adds nothing too:
  Jira updates the link it already has.
- After adding the scope, everyone signs in to Atlassian again once. Until
  then, or if you can't edit the ticket, the button says why it failed.
- This is the only thing the dashboard writes. Requests to it must come from
  the dashboard's own page (`PUBLIC_URL`).

### PR health

Open PRs show how healthy they are, so you know what to chase. In **Details**,
each open PR has small chips:

- **Age:** `Open 12 days` (whole days; `Opened today` for new ones).
- **Draft** when the PR isn't ready for review.
- **CI:** `CI passing`, `CI failing` or `CI running`, from the newest commit's
  checks. Nothing is shown when no checks ran.
- **Review:** `Approved`, `Changes requested` or `Review required`, from
  GitHub's review decision. Nothing is shown when the branch doesn't require
  reviews.

Hovering a PR number in the table shows the same facts on one line. Merged and
closed PRs show nothing.

**Backport stale:** an open backport that has waited longer than
`STALE_BACKPORT_DAYS` (default `7`) gets this problem as well as `Backport
open`. `Backport open` is something to wait for; `Backport stale` is
something to fix. The age is counted
in whole days from when the backport PR was opened; with several open PRs for
a branch, the oldest one counts. Set `STALE_BACKPORT_DAYS=0` to turn the flag
off, or any number of days to change the limit.

These facts come from the GitHub request the dashboard already makes (a few
more fields per PR). The sign-in asks for no new permissions.

### Branch names other than `stable-X.Y`

Set `BRANCH_TEMPLATES` in `.env`, for example
`BRANCH_TEMPLATES="owncloud/web=release-{major}.{minor}"`.

## Development

```bash
pnpm test          # unit tests (vitest)
pnpm check         # typecheck + lint + format check + tests
pnpm format        # prettier --write
```

### Requests per report

All with the signed-in user's own tokens, cached per user for 5 minutes.

- **Jira:** the sprint's tickets (`/rest/agile/1.0/sprint/{id}/issue`) or the
  tickets updated in the dates, or with the fix version (both
  `/rest/api/3/search/jql`), and the project's versions
  (`/rest/api/3/project/{key}/versions`, for the release picker), then each ticket's
  web links (`/rest/api/3/issue/{key}/remotelink`). **Link in Jira** posts to
  the same address.
- **GitHub GraphQL:** per repo, the default branch and which stable branches
  exist; per ticket, a search for the key (`repo:owner/name "OCISDEV-1464"`,
  10 searches per request), which returns PRs and issues; PRs known only from
  Jira links, by number; and the backport searches
  (`repo:owner/name is:pr in:body "13231"`). Every PR also carries its
  creation date, draft state, review decision and the newest commit's check
  state, for [PR health](#pr-health).
- **GitHub REST:** per stable branch, `compare/master...stable-9.0` for the
  merge base, whose date is used as the date the branch was cut.

### Layout

```
packages/
  core/    Pure domain logic, with no I/O: key extraction, backport parsing,
           fixVersion → branch, PR ↔ ticket linking, flag rules, release
           readiness, API types.
  server/  Fastify. auth/ (OAuth providers), jira/ and github/ (API clients
           behind the ports in report/ports.ts), demo/ (sample-data sources),
           report/service.ts (orchestration, caching and progress), api/
           (routes, the NDJSON progress stream, input parsing, error mapping).
  web/     Vite + Vue 3 (<script setup>, TypeScript). components/ (SFCs),
           composables/ (useReport streams progress, useTheme), lib/ (pure
           functions: filters, sorting, branch list, progress text, fixed marks,
           URL state, keyboard shortcuts, release picker).
```

The UI uses one typeface, Recursive (bundled, no external requests). Its mono
axis is used only for identifiers: ticket keys, PR numbers, branches and repos.
Colour is reserved for status: green for merged, ochre for waiting, red for
missing.

### Extending

- **New check:** add a `FlagRule` to `packages/core/src/flags.ts`, plus a
  label and hint in `packages/web/src/lib/view.ts`.
- **New login provider:** implement `OAuthProvider` (`server/src/auth/provider.ts`)
  and register it in `server/src/app.ts`.
- **New ticket or code source:** implement `TicketSource` / `SprintSource` /
  `CodeHost` from `server/src/report/ports.ts`, and choose it in
  `server/src/api/clients.ts`. The demo sources are a small example.

## Known limitations

- PRs are found through GitHub search on the ticket key. If a PR has the key
  **only in its branch name** and isn't linked in Jira, search won't find it.
  GitHub's `head:` filter only matches the start of a branch name
  (`head:ocisdev-1464` doesn't find `feat/ocisdev-1464-…`), so searching branch
  names would mean guessing every prefix for every ticket.
- Changes that reach a branch without a PR (direct pushes, cherry-picks pushed
  by hand) aren't detected; the branch shows as missing.
- Sessions live in server memory, so restarting the server signs everyone out.
- The Docker image runs TypeScript through `tsx`. That's fine for local use,
  but compile the code before any real deployment.
