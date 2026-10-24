# OpenCode in Shep

Select **OpenCode** in Shep's agent/model picker. Shep uses the real OpenCode v2 CLI for file edits, commands, background tasks and interactive task chat.

Install it with `npm install -g @opencode/cli`, or keep an existing v2 installation on your `PATH`. The installer in Shep's tools menu uses the same official package.

## Free models

Choose **DeepSeek V4.1 Flash Free**, identified by `opencode/deepseek-v4.1-flash-free`. It is the default when OpenCode has no explicitly selected model. OpenCode's free offers can change or end; consult its current model list. Shep does not silently switch an unavailable free model to a paid chat model.

## OpenCode Go

After subscribing, open `opencode`, run `/connect`, and connect **OpenCode Go** using your account. Reopen Shep's model picker after its short discovery cache expires (30 seconds). The available models are discovered from `opencode models`, preserving the complete provider/model identifiers, including Go models. The same executor, chat and session resume work for these selections.

Authentication stays in OpenCode. No separate OpenRouter key or new Shep integration is required to switch to Go. Picking a free model does not subscribe to Go or activate a paid fallback. Existing tasks keep their stored agent and model.

## Usage and cancellation

Background calls use a private OpenCode server so stopping Shep's task also stops its agent process. Saved native session counters supply complete usage, including the final response omitted by the JSON event stream. Resumed calls report the difference from their starting counters, avoiding repeated historical usage.

Sources: [OpenCode CLI](https://opencode.ai/v2/docs/cli/commands/), [models and free offers](https://opencode.ai/v2/docs/console/models/), [Go](https://opencode.ai/v2/docs/console/go/).
