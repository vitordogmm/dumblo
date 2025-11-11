Param(
  [string]$Message,
  [switch]$Push,
  [string]$Remote = "origin",
  [string]$Branch,
  [string]$RemoteUrl = "https://github.com/vitordogmm/dumblo.git",
  [switch]$ForceRemoteUpdate
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Info($msg) { Write-Host $msg -ForegroundColor Green }
function Write-Warn($msg) { Write-Host $msg -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host $msg -ForegroundColor Red }

function Ensure-Git() {
  try {
    $v = git --version 2>$null
  } catch {
    Write-Err "Git não encontrado no PATH."
    throw
  }
}

function Ensure-Repo() {
  $inside = (git rev-parse --is-inside-work-tree 2>$null).Trim()
  if ($inside -ne 'true') {
    Write-Err "Esta pasta não parece ser um repositório Git."
    throw "Fora de um repositório Git"
  }
}

function Get-CurrentBranch() {
  $b = (git rev-parse --abbrev-ref HEAD).Trim()
  if ([string]::IsNullOrWhiteSpace($b)) { throw "Não foi possível obter a branch atual" }
  return $b
}

function Get-StagedFiles() {
  $out = git diff --cached --name-only
  return @($out -split '\r?\n' | Where-Object { $_ -ne '' })
}

function Get-ChangedFiles() {
  $out = git status --porcelain
  return @($out -split '\r?\n' | Where-Object { $_ -ne '' })
}

function Build-DefaultMessage($count) {
  $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  return "chore: auto-commit $ts ($count arquivo(s))"
}

try {
  Ensure-Git
  Ensure-Repo

  # Configura remoto se necessário
  $remotesRaw = (git remote 2>$null)
  $remotesStr = if ($null -ne $remotesRaw) { $remotesRaw.Trim() } else { "" }
  $remotesList = @($remotesStr -split "`n" | Where-Object { $_ -ne "" })
  if (-not ($remotesList -contains $Remote)) {
    if ([string]::IsNullOrWhiteSpace($RemoteUrl)) {
      Write-Warn "Remoto '$Remote' não existe e nenhuma URL foi fornecida. Pulando configuração de remoto."
    } else {
      Write-Info "Configurando remoto '$Remote' -> $RemoteUrl ..."
      git remote add $Remote $RemoteUrl | Out-Null
    }
  } elseif ($ForceRemoteUpdate.IsPresent -and -not [string]::IsNullOrWhiteSpace($RemoteUrl)) {
    Write-Info "Atualizando URL do remoto '$Remote' -> $RemoteUrl ..."
    git remote set-url $Remote $RemoteUrl | Out-Null
  }

  # Estágio de alterações
  git add -A | Out-Null

  $staged = Get-StagedFiles
  $stagedCount = ($staged | Measure-Object).Count
  if ($stagedCount -eq 0) {
    $changed = Get-ChangedFiles
    $changedCount = ($changed | Measure-Object).Count
    if ($changedCount -eq 0) {
      Write-Warn "Nada para commitar (working tree clean)."
      exit 0
    } else {
      Write-Warn "Detectadas mudanças não staged. Tentando novamente 'git add -A'..."
      git add -A | Out-Null
      $staged = Get-StagedFiles
      $stagedCount = ($staged | Measure-Object).Count
      if ($stagedCount -eq 0) {
        Write-Err "Ainda sem arquivos staged. Verifique permissões/arquivos ignorados."
        exit 1
      }
    }
  }

  # Aviso sobre arquivos sensíveis
  $sensitive = @('.env','credenciais.json')
  $warnList = @()
  foreach ($f in $staged) { if ($sensitive -contains $f) { $warnList += $f } }
  if ($warnList.Count -gt 0) {
    Write-Warn "ATENÇÃO: os seguintes arquivos sensíveis estão staged: $($warnList -join ', '). Confirme que não contêm segredos."
  }

  # Mensagem de commit
  if ([string]::IsNullOrWhiteSpace($Message)) {
    Write-Host "Digite a mensagem do commit (Enter para automático):" -ForegroundColor Cyan
    $Message = Read-Host
    if ([string]::IsNullOrWhiteSpace($Message)) { $Message = Build-DefaultMessage $staged.Count }
  }

  # Commit
  Write-Info "Commitando $stagedCount arquivo(s)..."
  git commit -m $Message

  # Push opcional
  if ($Push.IsPresent) {
    $branchName = if ([string]::IsNullOrWhiteSpace($Branch)) { Get-CurrentBranch } else { $Branch }
    $upRemote = (git config --get "branch.$branchName.remote" 2>$null)
    $upMerge  = (git config --get "branch.$branchName.merge" 2>$null)
    if ([string]::IsNullOrWhiteSpace($upRemote) -or [string]::IsNullOrWhiteSpace($upMerge)) {
      Write-Info "Upstream não configurado. Fazendo push com '-u $Remote $branchName'..."
      git push -u $Remote $branchName
    } else {
      Write-Info "Fazendo push para upstream configurado..."
      git push
    }
  }

  Write-Info "Pronto."
} catch {
  Write-Err "Erro: $($_.Exception.Message)"
  exit 1
}

# Exemplos de uso:
#  - Commit simples e push para upstream existente:
#      powershell -File .\scripts\auto-commit.ps1 -Message "feat: adiciona NPC X" -Push
#  - Commit e push criando upstream para a branch atual:
#      powershell -File .\scripts\auto-commit.ps1 -Message "fix: corrige benção" -Push -Remote origin
#  - Configurar/atualizar o remoto para o GitHub do Dumblo:
#      powershell -File .\scripts\auto-commit.ps1 -ForceRemoteUpdate -Remote origin -RemoteUrl "https://github.com/vitordogmm/dumblo.git"
