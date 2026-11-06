# Witcher 3 Second Screen / Segunda Pantalla — instalador.
#   .\instalar.ps1               copia el mod (si hace falta) y añade F13-F24 a input.settings
#   .\instalar.ps1 -OcultarHud   además apaga minimapa, misiones y efectos del HUD del juego
#   .\instalar.ps1 -OcultarMedallon  además apaga el medallón (vida, aguante, toxicidad, adrenalina y señal)
#   .\instalar.ps1 -Preguntar    pregunta lo anterior (lo usa 'Install (Instalar).bat')
#   .\instalar.ps1 -Desinstalar  quita el mod y las teclas, restaura el HUD y borra el Python descargado
#   .\instalar.ps1 -PythonZip RUTA  usa un python-3.14.4-embed-amd64.zip ya descargado (sin internet)
# Funciona desde el proyecto (mod\ y app\ junto a este archivo) y desde el paquete de Nexus
# (este archivo en <juego>\SegundaPantalla y el mod en <juego>\Mods). Hace copia de cada
# archivo de ajustes que toca (*.antes-segunda-pantalla).
# El paquete no lleva Python (Nexus pone en cuarentena los paquetes con ejecutables): este
# instalador descarga el embebido oficial de python.org en SegundaPantalla\python y comprueba
# su SHA-256 antes de descomprimirlo. Compatible con Windows PowerShell 5.1 y PowerShell 7.

param(
    [switch]$OcultarHud,
    [switch]$OcultarMedallon,
    [switch]$Preguntar,
    [switch]$Desinstalar,
    [string]$RutaJuego = "",
    [string]$RutaDocs = "",
    [string]$PythonZip = ""
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"   # la barra de progreso hace lentísima la descarga en PowerShell 5.1
$es = (Get-UICulture).TwoLetterISOLanguageName -eq "es"
function M($textoEs, $textoEn) { if ($es) { $textoEs } else { $textoEn } }

# Python embebido oficial (python.org). SHA-256 publicado por python.org para la 3.14.4.
$pyVersion = "3.14.4"
$pyArchivo = "python-$pyVersion-embed-amd64.zip"
$pyUrl = "https://www.python.org/ftp/python/$pyVersion/$pyArchivo"
$pySha = "cda80a9b1e75c0f1b4f9872ca1b417f0d19bce32facc811aea9180e70fad5fb9"
# La app solo usa la biblioteca estándar básica (http.server, json, ctypes, socket, threading, zlib).
# Fuera lo que no usa: SSL/cifrado, SQLite, compresores, XML, decimal, asyncio... (~10 MB menos).
# El ._pth se deja como viene (python314.zip y .): servidor.py añade su carpeta a sys.path.
$pySobrantes = "libcrypto-3.dll", "libssl-3.dll", "_ssl.pyd", "_hashlib.pyd", "sqlite3.dll", "_sqlite3.pyd",
               "_zstd.pyd", "_lzma.pyd", "_bz2.pyd", "_decimal.pyd", "pyexpat.pyd", "_elementtree.pyd",
               "_asyncio.pyd", "_overlapped.pyd", "_remote_debugging.pyd", "_zoneinfo.pyd", "_wmi.pyd",
               "_multiprocessing.pyd", "winsound.pyd", "_uuid.pyd"
$script:pyTemporal = $null

function Abortar($mensaje) {
    if ($script:pyTemporal -and (Test-Path -LiteralPath $script:pyTemporal)) {
        Remove-Item -Recurse -Force -LiteralPath $script:pyTemporal -ErrorAction SilentlyContinue
    }
    Write-Host ""
    Write-Host $mensaje -ForegroundColor Red
    Write-Host (M "No se ha cambiado nada: ni el mod ni tus ajustes." "Nothing was changed: neither the mod nor your settings.") -ForegroundColor Red
    exit 1
}

$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
# Paquete de Nexus: SegundaPantalla\ sin mod\ al lado. En el proyecto se usa el Python del sistema.
$esPaquete = -not (Test-Path (Join-Path $raiz "mod\modSegundaPantalla"))
$pyDir = Join-Path $raiz "python"
$docs = if ($RutaDocs) { $RutaDocs } else { Join-Path ([Environment]::GetFolderPath("MyDocuments")) "The Witcher 3" }
$inputSettings = Join-Path $docs "input.settings"
# La versión DX12 guarda los ajustes en dx12user.settings; las antiguas, en user.settings.
$userSettings = @("dx12user.settings", "user.settings") | ForEach-Object { Join-Path $docs $_ } | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $userSettings) { $userSettings = Join-Path $docs "dx12user.settings" }
$contextos = @("Exploration", "Exploration_Replacer_Ciri", "JumpClimb", "Swimming", "Diving", "Combat",
               "Combat_Replacer_Ciri", "Horse", "Horse_Replacer_Ciri", "BoatPassenger", "Boat")
$teclas = 13..24 | ForEach-Object { "IK_F$_=(Action=SP_K$($_ - 13))" }
$modulosHud = @("Minimap2Module", "QuestsModule", "BuffsModule")
# Cabeza de lobo: el juego traduce este ajuste a WolfHeadModule (hud.ws, UpdateHudConfig).
$moduloMedallon = "WolfMedalion"

function Es-Juego($p) {
    $p -and ((Test-Path (Join-Path $p "bin\x64_dx12\witcher3.exe")) -or (Test-Path (Join-Path $p "bin\x64\witcher3.exe")))
}

function Buscar-Juego {
    if ($RutaJuego) {
        if (Es-Juego $RutaJuego) { return (Resolve-Path $RutaJuego).Path }
        throw (M "En '$RutaJuego' no está The Witcher 3." "The Witcher 3 was not found in '$RutaJuego'.")
    }
    # Paquete descomprimido dentro de la carpeta del juego.
    $padre = Split-Path -Parent $raiz
    if (Es-Juego $padre) { return $padre }
    # Steam: todas las bibliotecas.
    $steam = (Get-ItemProperty "HKCU:\Software\Valve\Steam" -ErrorAction SilentlyContinue).SteamPath
    $libs = @("C:\Program Files (x86)\Steam")
    if ($steam) { $libs += $steam.Replace("/", "\") }
    foreach ($s in $libs | Select-Object -Unique) {
        $vdf = Join-Path $s "steamapps\libraryfolders.vdf"
        if (Test-Path $vdf) {
            Select-String -Path $vdf -Pattern '"path"\s+"([^"]+)"' | ForEach-Object { $libs += $_.Matches[0].Groups[1].Value.Replace("\\", "\") }
        }
    }
    foreach ($l in $libs | Select-Object -Unique) {
        $p = Join-Path $l "steamapps\common\The Witcher 3"
        if (Es-Juego $p) { return $p }
    }
    # GOG.
    $gog = Get-ItemProperty "HKLM:\SOFTWARE\WOW6432Node\GOG.com\Games\*" -ErrorAction SilentlyContinue |
        Where-Object { $_.gameName -match "Witcher 3" -and (Es-Juego $_.path) } | Select-Object -First 1
    if ($gog) { return $gog.path }
    throw (M "No encuentro The Witcher 3. Indica la carpeta: .\instalar.ps1 -RutaJuego 'D:\Juegos\The Witcher 3'" `
             "The Witcher 3 was not found. Pass its folder: .\instalar.ps1 -RutaJuego 'D:\Games\The Witcher 3'")
}

function Copia-Seguridad($archivo) {
    $bak = "$archivo.antes-segunda-pantalla"
    if ((Test-Path $archivo) -and -not (Test-Path $bak)) { Copy-Item $archivo $bak }
}

function Codificacion-Original($archivo) {
    $b = [IO.File]::ReadAllBytes($archivo)
    if ($b.Length -ge 2 -and $b[0] -eq 0xFF -and $b[1] -eq 0xFE) { return (New-Object Text.UnicodeEncoding $false, $true) }
    if ($b.Length -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB) { return (New-Object Text.UTF8Encoding $true) }
    return (New-Object Text.UTF8Encoding $false)
}

# Python utilizable: python.exe y pythonw.exe presentes, arranca, es la versión esperada y tiene
# los módulos que usa la app.
function Python-Utilizable($dir) {
    $exe = Join-Path $dir "python.exe"
    if (-not ((Test-Path -LiteralPath $exe) -and (Test-Path -LiteralPath (Join-Path $dir "pythonw.exe")))) { return $false }
    try {
        $v = & $exe -I -c "import sys, http.server, ctypes, socket, json, zlib; print('%d.%d.%d' % sys.version_info[:3])" 2>$null
        return ($LASTEXITCODE -eq 0 -and "$v".Trim() -eq $pyVersion)
    } catch { return $false }
}

function Instalar-Python {
    if (Python-Utilizable $pyDir) {
        Write-Host (M "Python $pyVersion ya está en $pyDir." "Python $pyVersion is already in $pyDir.")
        return
    }
    $script:pyTemporal = Join-Path $raiz "python.descarga"
    if (Test-Path -LiteralPath $script:pyTemporal) { Remove-Item -Recurse -Force -LiteralPath $script:pyTemporal }
    New-Item -ItemType Directory -Force $script:pyTemporal | Out-Null
    $zip = Join-Path $script:pyTemporal $pyArchivo
    if ($PythonZip) {
        if (-not (Test-Path -LiteralPath $PythonZip)) {
            Abortar (M "No existe el archivo indicado en -PythonZip: $PythonZip" "The file passed in -PythonZip does not exist: $PythonZip")
        }
        Copy-Item -LiteralPath $PythonZip $zip
    } else {
        Write-Host (M "Descargando Python $pyVersion oficial de python.org (12 MB, una sola vez)..." `
                      "Downloading the official Python $pyVersion from python.org (12 MB, only once)...")
        Write-Host "    $pyUrl"
        try {
            # PowerShell 5.1 no activa TLS 1.2 por defecto en todos los Windows.
            [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest -UseBasicParsing -Uri $pyUrl -OutFile $zip -TimeoutSec 180
        } catch {
            Abortar (M ("No se pudo descargar Python de python.org: " + $_.Exception.Message + "`r`n" +
                        "Comprueba la conexión a internet y vuelve a ejecutar el instalador. Sin internet: descarga en otro equipo`r`n" +
                        "    $pyUrl`r`ny ejecuta en esta carpeta:  powershell -ExecutionPolicy Bypass -File instalar.ps1 -Preguntar -PythonZip 'C:\ruta\$pyArchivo'") `
                       ("Could not download Python from python.org: " + $_.Exception.Message + "`r`n" +
                        "Check your internet connection and run the installer again. Offline: download on another computer`r`n" +
                        "    $pyUrl`r`nand run in this folder:  powershell -ExecutionPolicy Bypass -File instalar.ps1 -Preguntar -PythonZip 'C:\path\$pyArchivo'"))
        }
    }
    $hash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLower()
    if ($hash -ne $pySha) {
        Abortar (M "El Python descargado NO es el oficial: su SHA-256 no coincide.`r`n    esperado: $pySha`r`n    obtenido: $hash`r`nNo se ha descomprimido nada. Vuelve a intentarlo más tarde; si se repite, avísame en Nexus." `
                   "The downloaded Python is NOT the official one: its SHA-256 does not match.`r`n    expected: $pySha`r`n    got:      $hash`r`nNothing was extracted. Try again later; if it happens again, tell me on Nexus.")
    }
    Write-Host (M "SHA-256 correcto: es el Python oficial de python.org." "SHA-256 matches: this is the official Python from python.org.")
    $nuevo = Join-Path $script:pyTemporal "python"
    Expand-Archive -LiteralPath $zip -DestinationPath $nuevo
    foreach ($f in $pySobrantes) { Remove-Item -LiteralPath (Join-Path $nuevo $f) -ErrorAction SilentlyContinue }
    if (Test-Path -LiteralPath $pyDir) { Remove-Item -Recurse -Force -LiteralPath $pyDir }
    Move-Item -LiteralPath $nuevo $pyDir
    Remove-Item -Recurse -Force -LiteralPath $script:pyTemporal
    $script:pyTemporal = $null
    if (-not (Python-Utilizable $pyDir)) {
        Abortar (M "Python se ha descomprimido en $pyDir pero no arranca." "Python was extracted to $pyDir but does not start.")
    }
    Write-Host (M "Python $pyVersion listo en $pyDir." "Python $pyVersion ready in $pyDir.")
}

if (Get-Process witcher3 -ErrorAction SilentlyContinue) {
    throw (M "Cierra The Witcher 3 antes: el juego reescribe sus ajustes al salir." "Close The Witcher 3 first: the game rewrites its settings on exit.")
}

$juego = Buscar-Juego
$modDestino = Join-Path $juego "Mods\modSegundaPantalla"
$esSteam = $juego -match "steamapps"
Write-Host (M "Juego: $juego" "Game: $juego")

if ($Desinstalar) {
    if (Test-Path $modDestino) { Remove-Item -Recurse -Force -LiteralPath $modDestino; Write-Host (M "Mod quitado." "Mod removed.") }
    if (Test-Path $inputSettings) {
        $enc = Codificacion-Original $inputSettings
        $lineas = [IO.File]::ReadAllLines($inputSettings, $enc) | Where-Object { $_ -notmatch '\(Action=SP_K\d+\)' }
        [IO.File]::WriteAllLines($inputSettings, $lineas, $enc)
        Write-Host (M "Teclas F13-F24 quitadas de input.settings." "F13-F24 bindings removed from input.settings.")
    }
    if (Test-Path $userSettings) {
        $enc = Codificacion-Original $userSettings
        $t = [IO.File]::ReadAllText($userSettings, $enc)
        foreach ($m in $modulosHud + $moduloMedallon) { $t = $t -replace "(?m)^$m=false", "$m=true" }
        [IO.File]::WriteAllText($userSettings, $t, $enc)
    }
    # El Python que descargó el instalador (solo en el paquete; en el proyecto no hay).
    if ($esPaquete -and (Test-Path -LiteralPath $pyDir)) {
        try {
            Remove-Item -Recurse -Force -LiteralPath $pyDir
            Write-Host (M "Python descargado quitado ($pyDir)." "Downloaded Python removed ($pyDir).")
        } catch {
            Write-Warning (M "No se pudo borrar $pyDir (¿está el panel abierto?). Ciérralo y borra la carpeta SegundaPantalla." `
                             "Could not delete $pyDir (is the panel open?). Close it and delete the SegundaPantalla folder.")
        }
    }
    Write-Host (M "Listo. Quita también la opción de lanzamiento que pusiste en Steam/GOG." "Done. Also remove the launch option you set in Steam/GOG.")
    exit 0
}

# Desde la 1.2.1 el mod (Nexus) y el panel (GitHub) se descargan por separado: Nexus pone en
# cuarentena cualquier archivo con scripts. Se comprueba el mod antes de descargar nada.
$modOrigen = @((Join-Path $raiz "mod\modSegundaPantalla"), (Join-Path (Split-Path -Parent $raiz) "Mods\modSegundaPantalla"), $modDestino) |
    Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $modOrigen) {
    Abortar (M ("Falta el mod. Descárgalo de Nexus (https://www.nexusmods.com/witcher3/mods/14439, archivo principal), " +
                "descomprímelo en la carpeta del juego o instálalo con Vortex, y vuelve a ejecutar esto. Debe quedar en $modDestino") `
               ("The mod is missing. Download it from Nexus (https://www.nexusmods.com/witcher3/mods/14439, main file), " +
                "extract it into your game folder or install it with Vortex, and run this again. It must end up in $modDestino"))
}

# 0. Python (solo el paquete): antes de tocar ajustes, para que un fallo de red o de hash no deje
#    la instalación a medias.
if ($esPaquete) { Instalar-Python }

# 1. Mod: desde el proyecto (mod\), desde el paquete (..\Mods\) o ya instalado (Nexus/Vortex).
if ((Resolve-Path $modOrigen).Path -ne $(if (Test-Path $modDestino) { (Resolve-Path $modDestino).Path } else { "" })) {
    New-Item -ItemType Directory -Force (Join-Path $juego "Mods") | Out-Null
    Copy-Item -Recurse -Force $modOrigen (Join-Path $juego "Mods")
}
Write-Host (M "Mod en $modDestino" "Mod at $modDestino")

# 2. Teclas: el mod escucha las acciones SP_K0..SP_K11, que la app pulsa con F13..F24.
$faltaArrancar = $false
if (-not (Test-Path $inputSettings)) {
    $faltaArrancar = $true
    Write-Warning (M "Aún no existe $inputSettings. Abre el juego una vez hasta el menú principal, ciérralo y vuelve a ejecutar el instalador." `
                     "$inputSettings does not exist yet. Start the game once until the main menu, quit, and run the installer again.")
} else {
    $enc = Codificacion-Original $inputSettings
    $lineas = [Collections.Generic.List[string]]([IO.File]::ReadAllLines($inputSettings, $enc))
    if ($lineas -match '\(Action=SP_K0\)') {
        Write-Host (M "Las teclas F13-F24 ya estaban en input.settings." "F13-F24 bindings were already in input.settings.")
    } else {
        Copia-Seguridad $inputSettings
        $anadidos = 0
        foreach ($ctx in $contextos) {
            $i = $lineas.IndexOf("[$ctx]")
            if ($i -lt 0) { continue }
            $lineas.InsertRange($i + 1, [string[]]$teclas)
            $anadidos++
        }
        if ($anadidos -eq 0) {
            $lineas.Add("")
            foreach ($ctx in @("Exploration", "Combat", "Horse", "Swimming", "Boat")) { $lineas.Add("[$ctx]"); $lineas.AddRange([string[]]$teclas) }
            $anadidos = 5
        }
        [IO.File]::WriteAllLines($inputSettings, $lineas, $enc)
        Write-Host (M "Teclas F13-F24 añadidas a $anadidos contextos de input.settings." "F13-F24 bindings added to $anadidos input contexts.")
    }
}

# 3. HUD más limpio (opcional).
if ($Preguntar -and -not $OcultarHud -and -not $faltaArrancar) {
    $r = Read-Host (M "¿Ocultar en el HUD del juego el minimapa, las misiones y los efectos? Se ven en el segundo monitor (s/n)" `
                      "Hide the minimap, quest tracker and buffs from the in-game HUD? They are shown on the second screen (y/n)")
    $OcultarHud = $r -match '^(s|y)'
    if ($OcultarHud -and -not $OcultarMedallon) {
        $r = Read-Host (M "¿Ocultar también el medallón (vida, aguante, toxicidad, adrenalina y señal)? Todo eso está en el panel; el medallón dejará de verse vibrar (s/n)" `
                          "Also hide the wolf medallion (vitality, stamina, toxicity, adrenaline and sign)? They are all on the panel; you won't see the medallion shake (y/n)")
        $OcultarMedallon = $r -match '^(s|y)'
    }
}
$ocultar = @()
if ($OcultarHud) { $ocultar += $modulosHud }
if ($OcultarMedallon) { $ocultar += $moduloMedallon }
if ($ocultar) {
    if (-not (Test-Path $userSettings)) {
        Write-Warning (M "Aún no existe dx12user.settings: abre el juego una vez y repite, o apágalo en Opciones > Interfaz." `
                         "dx12user.settings does not exist yet: start the game once and run this again, or turn them off in Options > HUD.")
    } else {
        Copia-Seguridad $userSettings
        $enc = Codificacion-Original $userSettings
        $t = [IO.File]::ReadAllText($userSettings, $enc)
        if ($t -notmatch '(?m)^\[Hud\]') { $t += "`r`n[Hud]`r`n" }
        # Conserva el fin de línea del archivo (CRLF o LF): ni '.' ni la línea nueva se comen el \r.
        foreach ($m in $ocultar) {
            if ($t -match "(?m)^$m=") { $t = $t -replace "(?m)^$m=[^\r\n]*", "$m=false" }
            else { $t = $t -replace '(?m)^\[Hud\](\r?)$', ('[Hud]$1' + "`n$m=false" + '$1') }
        }
        [IO.File]::WriteAllText($userSettings, $t, $enc)
        if ($OcultarHud) {
            Write-Host (M "HUD del juego: minimapa, misiones y efectos ocultos (se reactivan en Opciones > Interfaz)." `
                          "In-game HUD: minimap, quests and buffs hidden (re-enable them in Options > HUD).")
        }
        if ($OcultarMedallon) {
            Write-Host (M "HUD del juego: medallón oculto (se reactiva en Opciones > Interfaz)." `
                          "In-game HUD: wolf medallion hidden (re-enable it in Options > HUD).")
        }
    }
}

# 4. Opción de lanzamiento: Python descargado en el paquete o el del sistema (proyecto).
$pythonw = @((Join-Path $pyDir "pythonw.exe")) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $pythonw) { $pythonw = (Get-Command pythonw.exe -ErrorAction SilentlyContinue).Source }
if (-not $pythonw) { throw (M "No encuentro Python (pythonw.exe)." "Python (pythonw.exe) not found.") }
$opcion = '"' + $pythonw + '" "' + (Join-Path $raiz "app\lanzador.py") + '" %command% -debugscripts'
Write-Host ""
if ($esSteam) {
    try { Set-Clipboard -Value $opcion; $copiado = $true } catch { $copiado = $false }
    Write-Host (M "Último paso, una sola vez: Steam > The Witcher 3 > Propiedades > General > Opciones de lanzamiento, pega esto:" `
                  "Last step, once: Steam > The Witcher 3 > Properties > General > Launch Options, paste this:")
    Write-Host "    $opcion" -ForegroundColor Yellow
    if ($copiado) { Write-Host (M "(Ya está copiado en el portapapeles.)" "(It is already in your clipboard.)") }
    Write-Host (M "Después, al darle a Jugar se abren el juego y el panel, y al salir se cierra todo." `
                  "Then pressing Play opens the game and the panel, and quitting closes both.")
} else {
    Write-Host (M "Fuera de Steam: añade el argumento -debugscripts al lanzar el juego y abre el panel con 'Open panel (Abrir panel).bat'." `
                  "Outside Steam: add the -debugscripts argument when launching the game and open the panel with 'Open panel (Abrir panel).bat'.")
}
