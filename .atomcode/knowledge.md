# Project Knowledge (auto-generated)

- [13:34] "为这个工程编写自动化测试，每次修改、发布前先进行研发自测，避免把发布后在线上修复问题" → edited: package, jest.config.js, agents.service.spec.ts, opportunity, package | OK
- [13:48] "全部" → edited: main, main.tsx, DemandSummaryPage | OK
- [14:08] "添加更多测试" → edited: kpi.service.spec.ts, auth.service.spec.ts, sync.service.spec.ts, sync | OK
- [06:55] "需求详情页面，时间范围选择 1 月 1 日到目前，理论上是 123 条信息，但是在需求明细里，..." → edited: kpi | OK
- [07:28] "在生产环境构建 image 时的报错docker compose build --no-c..." → edited: Dockerfile (-3 +4 lines), Dockerfile (-4 +5 lines) | OK
- [07:35] "6 migrations found in prisma/migrationsNo pe..." → edited: schema | OK
- [09:51] "按需同步和定时任务都需要，按需同步按照指定的时间范围手动出发，定时任务就是定时做增量同步，时间..." → edited: sync | OK
- [09:55] "希望通过页面选定时间范围的方式出发按需同步，不希望通过额外的命令" → edited: udesc, DashboardPage | OK
- [10:56] "生产环境需要做什么，最好是通过代码解决" → edited: docker-compose.prod.yml, default | OK
- [test] npm run dev > /tmp/kefu-dev.log 2>&1 &
sleep 8
curl -s http://localhost:3000/api/v1/health && echo ""
curl -s http://loc
