# Operating the scheduler

**Scheduler** page (one per configured `scheduler` service): every job with its schedule, next and last run, the worker's state, and recent runs across all jobs. Viewers see everything; admins change.

## Numbers at the top

| Card | Meaning |
|---|---|
| Jobs | total, enabled and paused (`GET /v1/stats`) |
| Next firing | the earliest `nextRunAt` over enabled jobs, relative and absolute |
| Failed (24 h) | failed runs in the last day (red when above zero), succeeded count below |
| Running now | calls executing right now and the worker's concurrency; "worker stopped" in red if the loop is not running |

## The list

Columns: name with description, schedule (cron with timezone, or "One-shot" with the instant), next run, last run as a status badge with time, tags, and a **switch** that pauses or resumes the job (`PATCH { enabled }`). Filters: All / Enabled / Paused, name or description search, tag. Filters live in the URL.

**Recent runs** below lists runs of every job newest first, filterable by status, with attempt counters on retrying runs. Click a row for the run.

## Creating a job

**Create job** opens a dialog:

- name (permanent), description, tags;
- schedule: **Recurring (cron)** with expression and timezone (defaults to your browser's), and a live **Next firings** preview from `GET /v1/schedule/preview` that also shows cron errors as you type; or **One-shot** with a local date-time;
- target: URL, method, `X-*` headers one per line, JSON body (disabled for GET and DELETE, validated on the fly), **target key** from the service's `TARGET_KEYS` names (the console never sees the secrets), timeout, retries and first delay;
- *Start enabled*.

The console opens the new job's page. Validation errors from the service (`INVALID_SCHEDULE`, `INVALID_TARGET`, …) show as a toast with the reason.

## The job page

Badges (enabled/paused, last run), description, then schedule, next and last run, target with copy button, headers, body, target key, timeout and retry summary, creator and update time. Below, the job's runs with **Load more**.

Actions in the app bar: **Run now** (queues a manual run; refused with `RUN_ACTIVE` while one is queued, running or retrying), **Edit**, **Pause** (confirmation explains that missed firings are not made up) / **Resume**, delete (typed confirmation, removes run history too).

**Edit** sends only the fields you changed. Re-sending an unchanged schedule would recompute the next firing, and a one-shot that already fired would be rejected as "in the past", so the dialog diffs against the loaded job and says "No changes." when nothing differs.

## The run page

Status, trigger, attempt counter; job link, scheduled slot, start, finish and duration, next attempt while retrying, HTTP status, the error of the latest attempt and the first kilobyte of the response. The **Attempts** panel lists every attempt with its own duration, status and error.

**Cancel run** appears for queued and retrying runs (confirmation; a running attempt cannot be interrupted).

## Recorded in the console log

`scheduler.job.create` (schedule and URL), `scheduler.job.update` (the patch), `scheduler.job.delete`, `scheduler.job.run` (run id), `scheduler.run.cancel`.
