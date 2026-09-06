# Regenerate every figure Chapter 5 uses, in one command.
#
#   powershell -ExecutionPolicy Bypass -File docs\figures.ps1
#   powershell -ExecutionPolicy Bypass -File docs\figures.ps1 -Curriculum example
#
# Four things have to happen in the right order and it is easy to get wrong,
# which is why this exists rather than a list of commands in a README:
#
#   1. Rebuild the knowledge base FIRST. The capture submits a correct answer,
#      and that attempt is recorded. Run the script twice without rebuilding and
#      rule R1c has already fired, so the learner who should be shown at Apply
#      appears at Remember and the figures contradict their own captions. This
#      has happened once already.
#   2. Build the interface. The figures must come from the built application,
#      not the development server, because the development server injects
#      tooling that is not present in use and Chapter 6 audits the same build.
#   3. Serve it, capture, stop serving. The server is started and stopped here
#      so that no window is left running against a database that is about to be
#      rebuilt underneath it.
#   4. Rebuild afterwards, so Chapter 6 measures a clean database.
#
# Nothing here needs a Cloudflare account or a network. It does need Node 22.5
# or later, Python with the packages in build\requirements.txt, Pillow for the
# crop, and a Chromium-based browser, which on Windows is Edge and is already
# present.

param(
    [string]$Curriculum = 'tut',
    [string]$Activity   = 'ACT_D2_01',
    [int]   $Port       = 8000,
    [string]$Browser    = '',
    [switch]$SkipBuild            # the interface is already built and unchanged
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root

function Step($n, $text) {
    Write-Host ''
    Write-Host "== $n. $text" -ForegroundColor Cyan
}

try {
    Step 1 "Rebuilding the knowledge base ($Curriculum), so the capture starts clean"
    python build\build_kb.py --curriculum $Curriculum
    if ($LASTEXITCODE -ne 0) { throw "build_kb.py failed" }

    if (-not $SkipBuild) {
        Step 2 'Building the interface'
        Push-Location web
        if (-not (Test-Path node_modules)) { npm install --no-audit --no-fund }
        npm run build
        $failed = $LASTEXITCODE -ne 0
        Pop-Location
        if ($failed) { throw 'the interface did not build' }
    } else {
        Step 2 'Skipping the interface build, as asked'
    }

    Step 3 "Serving the built interface on port $Port"
    # The server runs hidden, so its output goes to a file rather than nowhere:
    # if it fails to start, the reason is in docs\server.log and not lost.
    $log = Join-Path $root 'docs\server.log'
    $server = Start-Process -FilePath 'node' `
        -ArgumentList "api\dev-server.mjs", "--port", "$Port" `
        -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput $log -RedirectStandardError "$log.err"
    try {
        $base = "http://127.0.0.1:$Port"
        $ready = $false
        foreach ($attempt in 1..40) {
            Start-Sleep -Milliseconds 500
            try {
                $meta = Invoke-RestMethod "$base/api/meta" -TimeoutSec 2
                $ready = $true
                Write-Host ("   serving the {0} curriculum, built {1}" -f `
                    $meta.build.curriculum, $meta.build.built)
                break
            } catch { }
        }
        if (-not $ready) {
            Write-Host '   the server did not answer; its output follows'
            if (Test-Path $log) { Get-Content $log | Select-Object -Last 20 }
            if (Test-Path "$log.err") { Get-Content "$log.err" | Select-Object -Last 20 }
            throw "the API did not answer on $base"
        }
        if ($meta.build.curriculum -ne $Curriculum) {
            throw ("the database holds the '{0}' curriculum, not '{1}'" -f `
                   $meta.build.curriculum, $Curriculum)
        }

        Step 4 'Capturing'
        $captureArgs = @('docs\screenshots.mjs', '--base', $base, '--activity', $Activity)
        if ($Browser) { $captureArgs += @('--browser', $Browser) }
        node @captureArgs
        if ($LASTEXITCODE -ne 0) { throw 'the capture failed' }
    }
    finally {
        if ($server -and -not $server.HasExited) {
            Stop-Process -Id $server.Id -Force
            Write-Host '   server stopped'
        }
    }

    Step 5 'Cropping for the page'
    python docs\crop_figures.py
    if ($LASTEXITCODE -ne 0) { throw 'crop_figures.py failed' }

    Step 6 'Rebuilding, so the recorded attempt does not reach Chapter 6'
    python build\build_kb.py --curriculum $Curriculum
    if ($LASTEXITCODE -ne 0) { throw 'the final rebuild failed' }

    Write-Host ''
    Write-Host 'Done.' -ForegroundColor Green
    Write-Host '   docs\screenshots\        the captures, and FIGURES.md'
    Write-Host '   docs\screenshots\print\  the cropped figures the chapter uses'
    Write-Host ''
    Write-Host 'Read FIGURES.md before using them. If a caption says Apply and the'
    Write-Host 'picture says Remember, step 1 did not take effect and the figures'
    Write-Host 'are from a solved activity.'
}
finally {
    Pop-Location
}
