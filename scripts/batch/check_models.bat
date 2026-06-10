@echo off
D:
cd \kefumonitor\apps\api
findstr /n "^model " prisma\schema.prisma
