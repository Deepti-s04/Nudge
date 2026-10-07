# 🧠 Nudge — Focus & Distraction Control Extension

Nudge is a Chrome browser extension designed to help users stay focused by controlling access to distracting websites during focused work sessions.

It provides two modes:

- 🚫 **Block Mode** — completely blocks selected distracting websites.
- ⏱️ **Restrict Mode** — allows access but tracks how much time is spent on selected distracting websites.

Nudge is being built with **React, TypeScript, WXT, and Chrome Extension APIs**, with a focus on understanding browser-extension architecture and real-time session tracking.

---

## ✨ Features

### 🎯 Focus Sessions

Start a focus session directly from the extension popup.

During a session, Nudge keeps track of:

- Session start time
- Current session duration
- Active focus mode
- Completed sessions

The session timer continues running independently of the popup UI.

---

### 🚫 Block Mode

In Block Mode, selected websites become inaccessible during an active focus session.

For example:

```text
Focus Session
      ↓
Block Mode
      ↓
instagram.com
      ↓
Access Blocked
