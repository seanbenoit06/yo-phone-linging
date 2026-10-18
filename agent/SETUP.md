# ElevenLabs agent setup ("Asian Parents")

The live agent was updated to match this folder on 2026-10-17 (via the ElevenLabs API, after Jay approved it).
To redo it by hand, follow the dashboard checklist below.

| File | Goes where |
|---|---|
| `system_prompt.md` | Agent tab → **System prompt** (paste the whole file) |
| `opening_lines.json` | Read by `caller.py` on every call to build `{{opening_line}}` |

## Contract with the code

The code sends **all** of these dynamic variables on **every** call, as strings.
It sends `"none"` when a value is unknown.

| Variable | Example | Notes |
|---|---|---|
| `user_name` | `Sean` | |
| `goal` | `CSE homework` | |
| `distraction` | `TikTok` | |
| `minutes_distracted` | `15` | Never `"0"`; `brain.py` sends at least `1` |
| `call_type` | `nudge` | `nudge`, `callback` or `snitch` (`CallType.value`) |
| `last_promise` | `open the CSE homework PDF and read problem 1` | `promised_step` from the previous call |
| `past_excuses` | `too tired after class; my code was compiling` | Earlier `excuse` values joined with `; ` |
| `opening_line` | `Sean! 15 min on TikTok?! ...` | Built by `caller.build_dynamic_variables()` from `opening_lines.json` |

Notes:

- `opening_lines.json` uses Python `{name}` placeholders (single braces) because the code fills them.
  The dashboard uses ElevenLabs `{{name}}` (double braces). Don't mix them up.
- Keep the keys `nudge` / `callback` / `snitch` and the placeholder names when editing the wording.
  Say "min", not "minutes", because `minutes_distracted` is often `1` in demo mode.
- A callback with `last_promise` = `"none"` uses the `nudge` line.
- Any `{{variable}}` in the prompt or first message that the code doesn't send makes the call fail
  with `Missing required dynamic variables`.
- Data Collection returns an empty value (not `"none"`) when there is no promise or excuse,
  e.g. on a snitch call, or a callback where the step was done.

## Dashboard checklist (all done on the live agent)

### 1. Agent tab

- [x] **System prompt**: the full content of `system_prompt.md`.
- [x] **First message**: exactly `{{opening_line}}` (nothing else).
- [x] **Disable interruptions during the first message**: on. The opener always plays fully, so a
  "Hello?" on pickup can't derail it. That's why the openers are kept short.
- [x] **Dynamic variables** placeholders (only used for dashboard tests):

| Variable | Placeholder |
|---|---|
| `user_name` | `Sean` |
| `goal` | `CSE homework` |
| `distraction` | `doomscroll` |
| `minutes_distracted` | `5` |
| `call_type` | `nudge` |
| `last_promise` | `none` |
| `past_excuses` | `too tired after class` |
| `opening_line` | `Sean! 5 min on doomscroll?! Cousin Kevin would never. What are you stuck on with CSE homework?` |

### 2. Tools (system tools)

- [x] **End call**: enabled, with this description:

  ```
  Hang up the call. Use it right after you say goodbye at the end of the flow, when the person says bye or wants to go, or when you reach a wrong number or a voicemail greeting. Say your goodbye before using it.
  ```

  and **Interruption mode** = `disable_during_tool` (API field `interruption_mode`). With the default
  `allow`, the user saying "Okay." during the goodbye cancelled the hang-up ("Tool execution was
  abandoned due to user input"), so Mom said goodbye twice and hung up 12s late.

- [x] **Voicemail detection**: enabled, **Voicemail message** empty, so Mom hangs up instead of
  talking to voicemail. `caller.to_call_result()` treats a voicemail as `answered=False`.

### 3. Analysis tab → Data collection

Identifiers must match exactly.

- [x] Identifier `promised_step`, data type `string`, description:

  ```
  Leave this EMPTY unless the user agreed, during this call, to a NEW small step for their own work. Leave it empty in all of these cases: (1) The person on the call is a friend, not the user. You can tell because Mom.exe opens with "This is Mom.exe, an AI accountability mom" and asks them to text someone. A friend agreeing to text the user is NOT a promised step. (2) Mom.exe is checking on an earlier promise and the user says they already did it. Repeating the earlier promise is NOT a new step. (3) The user did not clearly say yes, okay or I promise. Otherwise, write the new step as a short lowercase phrase that starts with a verb and has no period, so it reads naturally after "you'd". Example: "open the CSE homework PDF and read problem 1". Never write "none" or "N/A".
  ```

- [x] Identifier `excuse`, data type `string`, description:

  ```
  Leave this EMPTY if the user gave no reason, or if the person on the call is a friend, not the user (Mom.exe opens with "This is Mom.exe, an AI accountability mom" and asks them to text someone). Otherwise, write the reason the user gave for being distracted or for not doing their promised step, in a few words close to their own wording, under 12 words. Examples: "too tired after class", "don't know how to start problem 2". Never write "none" or "N/A".
  ```

### 4. Advanced tab

- [x] **Max conversation duration**: `120` seconds (was 600). The prompt aims for 30–60 seconds; this is only a safety net.
- [x] **Take turn after silence** (`turn_timeout`): `5` seconds (was 7). Less dead air on a quick call.
- [x] **End call after silence** (`silence_end_call_timeout`): `20` seconds (was off). Hangs up a silent pickup.
- Left as they were: turn eagerness `normal`, speculative turn on, interruptions on, expressive mode on (`eleven_v4_turbo`), LLM.

## Test results (text-only simulations, 2026-10-17)

Run with the ElevenLabs simulate-conversation API: an AI plays the user, no phone call.
Word counts are per Mom reply, after the opener.

| Test | Result |
|---|---|
| Nudge: "I don't know how to start problem 2" | One step, "Promise?", callback line, `end_call`. Replies 14–17 words |
| Old excuse: "too tired after class" | "You said that last time!", shrinks the step after pushback |
| Callback, done | Big praise, `end_call`. Both fields empty |
| Callback, not done | Asks what got in the way, 2-minute step, promise. No false "you said that last time" |
| Snitch | Thanks the friend, hangs up. Both fields empty |
| "Wait, are you an AI?" | "Yes sweetie, I'm an AI. Mom.exe, your AI mom, not the real one." |
| "Hello? Is it work?" | "It's Mom! Well, Mom.exe, your AI mom." Then repeats the question |
| "Stop, Mom. Okay okay, I get it." | "Okay okay, Mom stops." Straight to the question |
| Interrupts: "Wait wait, I was about to start" | Answers it, no restart of the opener |
| Truly stressed and sad | No jokes, no promise, stays with the user. Replies ~29 words, longer than other flows |
| Goodbye (v3.2, 5 flows) | One goodbye line, never a question ("Good! Mom calls back in five minutes. Bye bye!"), `end_call` in the same turn |
| Data Collection (v3.2) | Snitch and callback-done: both fields empty, 2 runs each. Nudge and callback-not-done still filled |

Real call (`conv_2401m56fh1pjey78zsvfwxs7v0g9`, prompt v3): 0/5 agent turns interrupted (before: 3/3),
turns 8–25 words, reply latency 0.50–1.01s, correct flow and Data Collection. The double goodbye
found there is fixed in v3.2 above.

Real call (`conv_4801m56ftfj7er39kt88f15zy0qn`, prompt v3.2): passed. Jay talked over Mom 3 times;
she answered each time and never restarted the opener. After two refusals she shrank the step twice,
then got a yes. One goodbye with `end_call` in the same turn; hung up 4s later. `promised_step` was the
final, smallest step. Reply latency 0.50–0.72s, except one 3.75s wait after a trailing "...so...".
