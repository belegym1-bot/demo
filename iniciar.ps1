param([string]$NodeExecutable)

$ErrorActionPreference = 'Stop'

if (!$NodeExecutable) {
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeCommand) {
        $NodeExecutable = $nodeCommand.Source
    } else {
        try {
            $runtime = Get-AppxPackage -Name 'OpenAI.CodexPrimaryRuntime*' -ErrorAction Stop |
                Sort-Object Version -Descending |
                Select-Object -First 1
            if ($runtime) {
                $NodeExecutable = Join-Path $runtime.InstallLocation 'dependencies\node\bin\node.exe'
            }
        } catch {
            Write-Verbose 'Não foi possível consultar o runtime do Codex.'
        }
    }
}

if (!$NodeExecutable -or !(Test-Path -LiteralPath $NodeExecutable)) {
    throw 'Instale Node.js 22 ou mais recente, ou informe o caminho do Node com -NodeExecutable.'
}

& $NodeExecutable (Join-Path $PSScriptRoot 'server.mjs')
exit $LASTEXITCODE
