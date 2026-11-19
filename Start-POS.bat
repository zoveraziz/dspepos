@echo off
title মধুবন শোরুম ePOS Server
cd /d I:\ZOVER-AI-DONT-DELETE\projects\dsp-epos
echo ===================================================
echo     মধুবন শোরুম ePOS সার্ভার চালু হচ্ছে...
echo ===================================================
timeout /t 2 /nobreak > nul
start "" http://localhost:3000
npm run start -- -H 0.0.0.0 -p 3000
pause
