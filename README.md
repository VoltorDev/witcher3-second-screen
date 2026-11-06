# Witcher 3 Second Screen — companion app

Companion app (panel + installer) for the **Second Screen** mod for The Witcher 3: Wild Hunt Remastered (5.x).
It shows the minimap, big vitality bars, potions, oils, bombs, signs and quests on your second monitor (or your phone or tablet), with one-click actions.

**The mod itself is on Nexus Mods:** https://www.nexusmods.com/witcher3/mods/14439

## Why is the app here and not on Nexus?

Nexus automatically quarantines any file that contains scripts (`.py`, `.ps1`, `.bat`), even when they are clean, and the panel is a small Python app with a PowerShell installer. Earlier versions waited days for manual review. So the download is split in two:

| What | Where |
|---|---|
| The mod (one text script) | [Nexus Mods, main file](https://www.nexusmods.com/witcher3/mods/14439?tab=files) |
| The companion app (this) | [Releases](https://github.com/VoltorDev/witcher3-second-screen/releases/latest) |

Both must be the **same version**.

## Install

1. Install the mod from Nexus: with Vortex, or extract it into your game folder (the one with `bin` and `content`) so that you get `Mods\modSegundaPantalla`.
2. Download `Witcher3-SecondScreen-<version>-app.zip` from [Releases](https://github.com/VoltorDev/witcher3-second-screen/releases/latest) and extract it into the same game folder. You get `SegundaPantalla`.
3. Start the game once until the main menu and quit.
4. Run `SegundaPantalla\Install (Instalar).bat`. It downloads the official embeddable Python from python.org and checks its SHA-256 (nothing executable is shipped in the zip).
5. Steam: paste the launch option it copied into The Witcher 3 › Properties › Launch Options.

Full instructions, troubleshooting and uninstall: `SegundaPantalla\README.txt` inside the zip.

---

**Español.** El mod está en Nexus y esta app (panel e instalador) aquí, porque Nexus retiene automáticamente cualquier archivo con scripts. Instala primero el mod de Nexus, descomprime luego el zip de [Releases](https://github.com/VoltorDev/witcher3-second-screen/releases/latest) en la carpeta del juego y ejecuta `SegundaPantalla\Install (Instalar).bat`. Mod y app deben ser de la misma versión.

All rights reserved. Not affiliated with CD PROJEKT RED.
