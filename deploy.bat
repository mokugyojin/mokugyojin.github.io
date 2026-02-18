@echo off
echo Deploying changes to GitHub...
git add .
git commit -m "Site update"
git push
echo Deployment complete.
pause
