# Fails if any commit has an author or committer other than 0xkinno, or a Co-Authored-By trailer.
$bad = git log --format='%an|%cn|%b' | Where-Object { $_ -match '\|' } | ForEach-Object {
  $p = $_.Split('|'); if ($p[0] -ne '0xkinno' -or $p[1] -ne '0xkinno') { $_ }
}
$trailers = git log --format='%B' | Select-String -Pattern 'Co-Authored-By' -SimpleMatch
$tracked = git ls-files | Select-String -Pattern '^reference/'
if ($bad -or $trailers -or $tracked) { Write-Error 'authorship or reference check failed'; exit 1 }
Write-Output 'authorship ok: only 0xkinno, no trailers, reference/ untracked'
