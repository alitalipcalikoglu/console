# Rate limits from the console

**Rate limits** page (one per configured `ratelimit` service): totals for the last 24 hours (allowed, denied with the deny rate, live counters and database size) and every policy with its windows (`100/1min`, `20,000/1d`), override count, active subjects and 24-hour decisions. Viewers look; admins manage.

**Create policy** asks for a name (permanent), a description and the windows: each row is "limit / duration unit"; up to five rows with distinct lengths. Two rows with the same length, a negative limit or a zero duration are flagged inline and block saving.

## The policy page

The header shows the description, the windows and who created the policy. Four stats follow: allowed and denied in 24 hours (with the deny rate), active subjects, overrides.

**Decisions (hourly)** draws allowed and denied per hour for the last 24 hours, 3 days or 7 days (the range is kept in the URL). Hover a bar for the hour's numbers.

**Look up a subject**: type an identifier (or click one in *Top consumers* or *Overrides*) to see, per window, what is left, what is used and when the window resets, plus a badge when the subject is blocked or has an override. Admins can **Add override** / **Edit override** for that subject and **Reset usage** (confirmation), which removes the subject's counters so the next request starts from zero.

**Top consumers** lists the subjects with the highest usage right now in one window of the policy (switch windows with the segment control).

**Overrides** lists the subjects with custom limits or a block, with note and expiry (expired ones are marked until the service's cleanup removes them). Per row: **Edit override**, **Delete override** (confirmation; the subject returns to the policy limits, its usage is kept).

**Add override** (app bar or lookup panel): subject, kind (**Custom limits** with the same windows editor, prefilled from the policy, or **Block**), note, optional expiry. Saving replaces any existing override for that subject.

Actions in the app bar: **Edit** (description and windows; only changed fields are sent), **Add override**, and under ⋯: **Delete policy** (typed confirmation; removes overrides, counters and statistics; services checking the policy get 404 afterwards).

## Recorded in the console log

`ratelimit.policy.create`, `ratelimit.policy.update` (the patch), `ratelimit.policy.delete`, `ratelimit.override.set` (policy and body), `ratelimit.override.delete`, `ratelimit.subject.reset`, `ratelimit.check` (a consuming check run through the console API).
