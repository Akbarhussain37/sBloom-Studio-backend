$ErrorActionPreference = "Stop"

$path = "C:\Users\user\Desktop\sBLOOM Front-end\sBloom-Studio-frontend\src\pages\Register.tsx"
$content = [System.IO.File]::ReadAllText($path)
$content = $content.Replace("`r`n", "`n")

$oldBlock = '        if (profileError) {
          console.error("Profile creation notice:", profileError);
          // Let''s attempt an update just in case the trigger already inserted the row
          const { error: updateError } = await supabase
            .from(''profile_studio'')
            .update(payload)
            .eq(''id'', data.user.id);
            
          if (updateError) {
             console.error("Profile update fallback failed:", updateError);
          }
        }'

$oldBlock = $oldBlock.Replace("`r`n", "`n")

$newBlock = '        if (profileError) {
          console.error("Profile creation failed:", profileError);
          throw new Error(profileError.message || "Failed to create user profile");
        }'

$newBlock = $newBlock.Replace("`r`n", "`n")

$content = $content.Replace($oldBlock, $newBlock)
[System.IO.File]::WriteAllText($path, $content)

Write-Host "===================="
Write-Host "AUDIT RESULTS"
Write-Host "===================="
$frontendDir = "C:\Users\user\Desktop\sBLOOM Front-end\sBloom-Studio-frontend"
$backendDir = "C:\Users\user\Desktop\sBLOOM Front-end\sBLOOM Backend\sBloom-Studio-backend"

$pattern = "user_metadata\.role|user\.user_metadata\.role|'user_metadata'->>'role'"

Write-Host "Frontend Audit:"
Get-ChildItem -Path $frontendDir -Recurse -File -Include *.ts,*.tsx,*.js,*.jsx | Select-String -Pattern $pattern
Write-Host "Backend Audit:"
Get-ChildItem -Path $backendDir -Recurse -File -Include *.ts,*.js,*.sql | Select-String -Pattern $pattern

Write-Host "===================="
Write-Host "TYPECHECK AND BUILD"
Write-Host "===================="
cd $frontendDir
npm run build

Write-Host "===================="
Write-Host "LINT"
Write-Host "===================="
npm run lint
