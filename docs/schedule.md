# Tracking schedule

Settings has a **Schedule** section with an **Automatic timer** control. It has two rows, **Start tracking at** and **Stop tracking at**. Each row has a checkbox and a time field, and you can use either row alone.

| You set | What happens |
| --- | --- |
| Start only | Tracking starts at that time every day. You stop it yourself. |
| Stop only | Tracking stops at that time every day. You start it yourself. |
| Both | Tracking starts and stops at those times every day. |
| Both, same time | Tracking only stops at that time. |
| Start later than stop (for example 22:00 and 06:00) | Works across midnight. |
| Neither | No schedule. |

Ticking a row fills in a default (09:00 for start, 17:00 for stop). Unticking it clears the time. The explanation under the control always says in words what the current choice does.

## When it acts

- Times use the computer's local clock. They are stored as 24-hour ``HH:MM`` and shown in the clock format of the system locale.
- The schedule is checked every 30 seconds, and once 5 seconds after the app starts. An event fires within about 30 seconds of its time. The window is created with ``backgroundThrottling: false``, so hiding it to the tray does not slow the check.
- Each scheduled event fires once.
- Nothing happens while you are signed out. The latest missed event is applied after you sign in.

## What a scheduled start and stop do

| Event | Timer is stopped | Timer is running | Timer is paused |
| --- | --- | --- | --- |
| Start | Starts, with the current note and project | Nothing | Nothing, it resumes itself on activity |
| Stop | Nothing | Stops | Stops |

- An event that finds nothing to do is still counted as done, so it does not fire again later.
- A native notification says "Timer started by your schedule" or "Timer stopped by your schedule". It is separate from the screenshot notification setting.
- A start that cannot take effect (a missing operating system permission, or tracking stopped by your manager) leaves the timer stopped and shows no notification.

## Your own actions win

The schedule never undoes something you did by hand. If you start the timer after the stop time, it keeps running until the next scheduled event. If you stop it after the start time, it stays stopped.

## Changing the schedule

Saving a different time does not act on events that already passed. With a stop time of 17:00, saving it at 18:00 leaves a running timer alone, and the first stop happens the next day at 17:00.

## After sleep or a restart

If the computer was asleep, or the app was closed, when an event was due, the most recent missed event is applied at the next check, within about 35 seconds of the app becoming active. Only the latest event is applied, never several.

This also means that starting the app after the stop time, with **Automatically start tracking on app launch** on, stops the timer again right away and shows the notification.

## Stored settings

The schedule is stored for the installation, like **Idle detection**, and not per account. The keys are ``scheduleOnTime`` and ``scheduleOffTime``, plus two internal keys, ``scheduleApplied`` and ``scheduleSignature``, that record which event already fired and which times it was computed from.

## How it is built

The logic lives in ``patches/snippets/schedule.js.txt`` and the control in ``patches/snippets/scheduleRender.js.txt``. ``patches/12-schedule.renderer.json`` wires them into the renderer bundle and ``patches/12-schedule.css.txt`` adds the styles. ``scripts/verify.cjs`` runs the scheduler and the control from the patched bundle with a fake clock, a fake store and a fake workflow.
