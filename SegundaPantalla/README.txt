WITCHER 3 SECOND SCREEN  ·  SEGUNDA PANTALLA            version 1.2.1
=============================================================================

Shows the minimap, big vitality/stamina bars, tracked quest, active quests,
potions, oils, bombs, food, signs and active effects on your second monitor,
with clickable quick actions. Hide those modules from the game screen (the
wolf medallion too, if you like) and play with a lighter HUD.

TWO DOWNLOADS: this is the companion app (panel + installer). The mod itself
is on Nexus: https://www.nexusmods.com/witcher3/mods/14439
They are split because Nexus automatically quarantines any file that
contains scripts (.py, .ps1, .bat), even when they are clean.
DOS DESCARGAS: esto es la app (panel + instalador); el mod está en Nexus.
Van por separado porque Nexus retiene cualquier archivo con scripts.

----------------------------------------------------------------- ENGLISH ---

REQUIREMENTS
  - The Witcher 3: Wild Hunt Remastered (5.x) on Windows. Tested on Steam.
    GOG should work but has not been tested.
  - Microsoft Edge or Google Chrome (Edge comes with Windows).
  - Internet once, during installation: the installer downloads the official
    Python 3.14.4 embeddable package from python.org (about 12 MB) and checks
    its SHA-256 before using it. Nothing else to install.

INSTALL
  1. Install the mod from Nexus (main file): with Vortex, or extract it INTO
     your game folder (the one with "bin" and "content") so that you get
     "Mods\modSegundaPantalla".
  2. Extract this archive INTO the same game folder. You get "SegundaPantalla".
     Mod and app must have the same version.
  3. Start the game once until the main menu and quit (it creates its settings).
  4. Run "SegundaPantalla\Install (Instalar).bat". It adds 12 hidden key
     bindings (F13-F24) to input.settings, can hide the in-game minimap/quests/
     buffs and the wolf medallion (vitality, stamina, toxicity, adrenaline and
     sign, all on the panel), downloads Python from python.org into
     "SegundaPantalla\python" (checking its SHA-256) and copies a launch option
     to your clipboard. Offline? Download the file it shows on another
     computer, open PowerShell in "SegundaPantalla" and run (one line):
     powershell -ExecutionPolicy Bypass -File instalar.ps1 -Preguntar
         -PythonZip "C:\path\python-3.14.4-embed-amd64.zip"
  5. Steam: The Witcher 3 > Properties > General > Launch Options > paste.
     From then on, pressing Play opens the game and the panel together.
     GOG / other: add -debugscripts as a game argument and run
     "Open panel (Abrir panel).bat" after starting the game.

USE
  - Click a potion to drink it, Steel/Silver on an oil to apply it, a bomb to
    equip it, food to eat it, a sign to select it, a quest to track it.
  - While you play, Witcher 3 keeps the mouse on the game screen (it moves the
    camera), so you can't simply move it to the panel. The fastest ways:
      * Quick slots with hotkeys (Customize > quick slots, e.g. Ctrl+1): the
        game keeps focus, so there is no pause and no Alt+Tab.
      * Phone, tablet or touchscreen monitor: touching the panel doesn't take
        focus from the game, so actions apply without pausing.
  - Clicking the panel with the mouse (after Alt+Tab) works too, but pauses
    the game (Witcher 3 opens its pause menu when it loses focus); the app
    resumes it and runs the action in about a second. Use Display Mode
    "Borderless Window": in "Full Screen" the game minimizes on Alt+Tab and
    commands may not arrive.
  - "Customize" (bottom corner, or key E): move/resize/hide panels, monitor,
    language, side of the vitality bars, quick slots with optional hotkeys.
  - No second monitor? Customize > "Phone or tablet": tick the box and type
    the address it shows into the browser of a phone or tablet on the same
    Wi-Fi. If Windows asks, allow Python on private networks.

UNINSTALL
  Run "Uninstall (Desinstalar).bat" (removes the mod, the key bindings and the
  downloaded Python, and restores the HUD), remove the launch option, delete
  the "SegundaPantalla" folder. If you installed the mod with Vortex, remove
  it in Vortex too. Your settings files were backed up as
  *.antes-segunda-pantalla in Documents\The Witcher 3.

HOW IT WORKS / PRIVACY
  The mod writes game data to the game's own debug log (that is why
  -debugscripts is needed). A small local server reads it and shows it in a
  browser window. Commands go back to the game as F13-F24 key presses.
  The panel never connects to the internet (only the installer does, once, to
  download Python from python.org); with phone access on, the panel is also
  reachable on your home network, only with the key in the address. User settings: %LOCALAPPDATA%\Witcher3SecondScreen

TROUBLESHOOTING
  - "No game data": check the launch option, load a save, and that
    Mods\modSegundaPantalla exists. If Documents\The Witcher 3\scriptslog.txt
    only has one line, the game reused scripts compiled without -debugscripts:
    the Steam launcher fixes this automatically on the next start.
  - A command doesn't arrive: first check Options > Video > Display Mode is
    "Borderless Window", not "Full Screen". Then raise "key press duration"
    in Customize > Advanced.
    Tutorial pop-ups and menus block commands, like they block the keyboard.
  - The installer can't download Python, or says its SHA-256 doesn't match:
    it stops without changing anything. Check your connection and run it
    again, or use the offline option in INSTALL step 4.
  - The installer says the mod is missing: install the Nexus file first
    (step 1) and run it again.
  - "Open panel (Abrir panel).bat" says Python is missing: run
    "Install (Instalar).bat" first.

----------------------------------------------------------------- ESPAÑOL ---

REQUISITOS
  - The Witcher 3: Wild Hunt Remastered (5.x) en Windows. Probado en Steam;
    GOG debería funcionar pero no está probado.
  - Microsoft Edge o Google Chrome.
  - Internet una vez, al instalar: el instalador descarga de python.org el
    Python 3.14.4 embebido oficial (unos 12 MB) y comprueba su SHA-256.

INSTALACIÓN
  1. Instala el mod de Nexus (archivo principal): con Vortex, o descomprímelo
     DENTRO de la carpeta del juego (la que tiene "bin" y "content") para que
     quede "Mods\modSegundaPantalla".
  2. Descomprime este archivo DENTRO de la misma carpeta del juego: queda
     "SegundaPantalla". Mod y app deben ser de la misma versión.
  3. Abre el juego una vez hasta el menú principal y ciérralo.
  4. Ejecuta "SegundaPantalla\Install (Instalar).bat": añade 12 teclas ocultas
     (F13-F24), puede ocultar del HUD minimapa/misiones/efectos y el medallón
     (vida, aguante, toxicidad, adrenalina y señal, todo en el panel),
     descarga Python de python.org en "SegundaPantalla\python" (comprobando su
     SHA-256) y copia al portapapeles la opción de lanzamiento. ¿Sin internet?
     Descarga en otro equipo el archivo que indica, abre PowerShell en
     "SegundaPantalla" y ejecuta (en una línea):
     powershell -ExecutionPolicy Bypass -File instalar.ps1 -Preguntar
         -PythonZip "C:\ruta\python-3.14.4-embed-amd64.zip"
  5. Steam: The Witcher 3 > Propiedades > General > Opciones de lanzamiento >
     pegar. Desde entonces, Jugar abre el juego y el panel a la vez.
     GOG u otros: añade -debugscripts como argumento y abre
     "Open panel (Abrir panel).bat" tras arrancar el juego.

USO
  - Clic en una poción para beberla, en Acero/Plata para aplicar un aceite, en
    una bomba para equiparla, en comida para tomarla, en una señal para
    elegirla o en una misión para seguirla.
  - Mientras juegas, Witcher 3 retiene el ratón en su pantalla (mueve la
    cámara), así que no puedes llevarlo al panel sin más. Lo más cómodo:
      * Accesos rápidos con atajo (Personalizar > accesos rápidos, p. ej.
        Ctrl+1): el juego no pierde el foco, ni se pausa ni hace falta Alt+Tab.
      * Móvil, tableta o monitor táctil: tocar el panel no quita el foco al
        juego, así que las órdenes se aplican sin pausa.
  - Con el ratón (tras Alt+Tab) también funciona, pero el juego se pausa (abre
    su menú al perder el foco); la app lo reanuda y ejecuta la orden en un
    segundo aproximadamente. Usa el modo "Ventana sin bordes": en "Pantalla
    completa" el juego se minimiza con Alt+Tab y las órdenes pueden perderse.
  - "Personalizar" (esquina inferior o tecla E): mover, redimensionar u ocultar
    paneles, monitor, idioma, lado de las barras y accesos rápidos con atajos.
  - ¿Sin segundo monitor? Personalizar > "Móvil o tableta": marca la casilla
    y escribe la dirección que aparece en el navegador de un móvil o tableta
    conectado al mismo wifi. Si Windows pregunta, permite Python en redes privadas.

DESINSTALAR
  "Uninstall (Desinstalar).bat" (quita el mod, las teclas y el Python
  descargado, y restaura el HUD), quitar la opción de lanzamiento y borrar la
  carpeta "SegundaPantalla" (si instalaste el mod con Vortex, quítalo también
  ahí). Los ajustes tocados tienen copia
  *.antes-segunda-pantalla en Documentos\The Witcher 3.
