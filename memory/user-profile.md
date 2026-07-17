---
name: user-profile
description: "User identity, skill level, environment, and preferences"
metadata: 
  node_type: memory
  type: user
  originSessionId: c075f06d-9298-424b-8a88-48e5f308dd7a
---

# User Profile

- **Name**: Encaron (git user)
- **Skill level**: Novice — does not use VS2022 or configure environments. However, as of 2026-06-15 the user has learned to compile via terminal: right-click → "在终端中打开" → `dotnet publish -c Release`. Exe output at `bin/Release/net8.0-windows/win-x64/publish/Serial Monitor.exe`
- **Workflow**: Default — AI compiles and copies exe to project root, user double-clicks to verify. If user explicitly says "我自己编译" or "别编译", AI only modifies code and skips compilation
- **Context**: Embedded developer (STM32), uses serial communication for debugging
- **Preferences**:
  - Baud rate: 115200 (not 9600)
  - Mode: Text (not HEX)
  - Encoding: UTF-8 (not GBK)
  - Theme: Dark mode
  - Tool should remember user preferences (JSON-based persistence)
- **Environment**:
  - Windows 11 Home China 10.0.26200
  - VS2022 MSBuild at `D:\Program Files\...\MSBuild\Current\Bin\MSBuild.exe`
  - Git bash shell
  - Project at `E:\serial\` (moved from `D:\STM32CubeIDE_1.17.0\serial\` on 2026-06-15)
- **Communication**: Chinese (commit messages, docs)

**Why:** Ensures AI produces deliverables the user can actually use.
**How to apply:** Always end tasks with a compiled .exe at project root. Don't assume CLI/IDE proficiency.

Related: [[project-status]] [[build-process]]
