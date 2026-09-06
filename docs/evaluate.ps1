# Run layers 2, 3 and 4 of the evaluation, in one command.
#
#   powershell -ExecutionPolicy Bypass -File docs\evaluate.ps1
#
# The same shape as docs\figures.ps1 and for the same reason: the measurement
# must be taken against the BUILT interface, over a knowledge base in a known
# state, and the state has to be restored afterwards because Layer 4 submits
# answers and those are recorded.
#
# Needs, once:
#   npm install -D playwright axe-core

param(
    [string]$Curriculum = 'tut',
    [int]   $Port       = 8000,
    [string]$Layer      = 'all',
    [string]$Browser    = '',
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root

function Step($n, $text) {
    Write-Host ''
    Write-Host "== $n. $text" -ForegroundColor Cyan
}

try {
    if (-not (Test-Path 'node_modules\axe-core')) {
        throw 'axe-core is not installed. Run:  npm install -D axe-core'
    }

    Step 1 "Rebuilding the knowledge base ($Curriculum), so the measurement starts clean"
    python build\build_kb.py --curriculum $Curriculum
    if ($LASTEXITCODE -ne 0) { throw 'build_kb.py failed' }

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
                break
            } catch { }
        }
        if (-not $ready) {
            if (Test-Path $log) { Get-Content $log | Select-Object -Last 20 }
            if (Test-Path "$log.err") { Get-Content "$log.err" | Select-Object -Last 20 }
            throw "the API did not answer on $base"
        }
        if ($meta.build.curriculum -ne $Curriculum) {
            throw ("the database holds the '{0}' curriculum, not '{1}'" -f `
                   $meta.build.curriculum, $Curriculum)
        }
        Write-Host ("   serving the {0} curriculum, built {1}" -f `
            $meta.build.curriculum, $meta.build.built)

        Step 4 "Measuring (layer $Layer)"
        $runArgs = @('docs\evaluate.mjs', '--base', $base, '--layer', $Layer)
        if ($Browser) { $runArgs += @('--browser', $Browser) }
        node @runArgs
        if ($LASTEXITCODE -ne 0) { throw 'the evaluation failed' }
    }
    finally {
        if ($server -and -not $server.HasExited) {
            Stop-Process -Id $server.Id -Force
            Write-Host '   server stopped'
        }
    }

    Step 5 'Rebuilding, so the answers Layer 4 submitted do not persist'
    python build\build_kb.py --curriculum $Curriculum
    if ($LASTEXITCODE -ne 0) { throw 'the final rebuild failed' }

    Write-Host ''
    Write-Host 'Done.' -ForegroundColor Green
    Write-Host '   docs\evaluation\RESULTS.md       the tables Chapter 6 reports'
    Write-Host '   docs\evaluation\evaluation.json  every check, passed or failed'
}
finally {
    Pop-Location
}
