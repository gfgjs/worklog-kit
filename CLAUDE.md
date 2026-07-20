# worklog-kit 开发约定

- 本仓是 worklog-kit 源码仓,`worklog` CLI 未上 PATH:一律 `node bin/worklog.mjs <子命令>` 调用(例:`node bin/worklog.mjs start <任务名>`)。
- bin 名 = 包名 = `worklog-kit`(无 `worklog` bin);禁裸 `npx worklog`(npm 他人同名包);本仓别用 `npx worklog-kit`(会拉注册表已发布旧版,非本地源码)。
- 门禁:`npm run check`(文档门禁)/ `npm run skills`(skill 校验)/ `npm run selftest`(全量自检)。
