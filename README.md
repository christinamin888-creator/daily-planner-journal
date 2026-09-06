# 今日计划手帐

一个 Vite + React + TypeScript 的每日计划手帐网页。未登录记录保存在浏览器 `localStorage`，key 为 `daily-planner-journal-v1`。用户也可以用 QQ 邮箱、163 邮箱、Gmail 等普通邮箱注册并设置本站密码，登录后通过 Supabase Auth 保存自己的每日计划数据。登录账号的同步基线与待上传记录另按账号保存，不自动上传未登录示例。

## 安装

```bash
npm install
```

## 运行

```bash
npm run dev
```

打开终端显示的本地地址即可使用，通常是 `http://localhost:5173`。

## 构建

```bash
npm run build
```

## 导出图片和 PDF

1. 选择日期并添加当天计划。
2. 点击右上角的 `导出 PNG` 可保存当天手帐图片。
3. 点击右上角的 `导出 PDF` 可保存当天手帐 PDF。

导出内容只包含手帐卡片区域，表单和操作按钮不会出现在导出文件中。

## 邮箱注册登录

项目使用 `@supabase/supabase-js` 和 Supabase Email Auth：

1. 未登录时可以继续使用本地模式，数据只保存在当前浏览器 `localStorage`。
2. 注册时输入邮箱和本站密码。Confirm email 开启时，需要先到邮箱点击验证链接。
3. 登录后读取当前用户的 `daily_planner_user_data` 云端数据，并恢复该账号的本机同步检查点。首次升级时，旧的共用本机记录单独保留，不自动混入账号。
4. 登录状态下新增、编辑、删除、完成计划会尝试自动同步。同一记录两端冲突时停止保存、保留本机修改，需先备份再处理，不自动覆盖云端。
5. 可以随时退出登录，退出后仍可继续本地使用。

旧的个人同步码入口已从主流程隐藏，旧表 `daily_planner_syncs` 不需要删除。

## 数据隔离

云端数据保存在 Supabase 表 `public.daily_planner_user_data`。数据库必须开启 RLS，并以 `auth.uid() = user_id` 限制每个用户只能访问自己的行。网站通过 `sync_daily_planner_for_user` 接口校验当前账号，并比较刚读取的云端版本后保存；接口缺失或冲突时不会退回直接覆盖表。

同一浏览器的同一账号只允许一个网站窗口编辑，依赖 HTTPS 或 localhost 下的 Web Locks。另一个窗口需等原窗口关闭后重试。请勿通过清理浏览器缓存解决同步问题，以免丢失待上传记录。

同步状态旁提供重试、备份和读取云端入口。读取云端替换本机修改前需要确认。备份不含登录令牌，受保护日志只保留密文；普通日志仍在备份中，需妥善保管。

## 忘记密码

在登录区点击 `忘记密码`，输入注册邮箱后会收到 Supabase 发送的重置密码邮件。用户从邮件回到网站后，会看到设置新密码表单；提交新密码后即可继续使用邮箱和新密码登录。

## Supabase / Vercel 环境变量

需要的环境变量：

```bash
VITE_SUPABASE_URL=你的 Supabase 项目 URL
VITE_SUPABASE_PUBLISHABLE_KEY=你的 Supabase publishable key
```

如果项目仍使用旧的 anon key，也支持：

```bash
VITE_SUPABASE_ANON_KEY=你的 Supabase anon key
```

Supabase 侧需要提前准备：

- Email Auth 已开启。
- Confirm email 已开启。
- Site URL 指向正式域名，例如 `https://www.planthenact.com`。
- Redirect URLs 已包含正式域名。
- 表：`public.daily_planner_user_data`，并开启 RLS 用户隔离策略。
- 比较更新接口：`sync_daily_planner(jsonb,jsonb)` 及 `sync_daily_planner_for_user(uuid,jsonb,jsonb)`，均沿用调用者权限，只向 authenticated 授予执行权。

## 本次网站更新顺序

1. 先保存手机和网站中尚未同步的记录，不清缓存、不删除旧表。2026-09-06 用户已确认手机备份成功；网站本机记录仍需按实际设备检查。
2. 用户已在原 Supabase 项目安装两个新同步接口，并通过截图确认两者沿用账号权限、登录用户可调用、匿名用户不可调用。该结果不等于双端写入或并发测试通过。
3. 将本包作为原网站项目的源码更新，沿用原 Vercel 项目、域名和 Supabase 环境变量。不要另建数据库，也不要把开发测试地址写入生产配置。
4. 新网站部署成功后关闭各设备旧网页，再重新打开核对登录和原有记录。此时先不要点击手机同步。
5. 确认新版网站生效后，再审阅并执行完整开发仓库中 `miniprogram/server/002_guard_legacy_writes.sql`，防止旧客户端直接覆盖记录。此脚本不随网站源码包分发，也不会被网站构建自动执行。提前安装会使旧网页保存失败。
6. 用测试账号验证新增、编辑、删除、同时修改、断网重试与账号隔离，最后再验收真实手机数据同步。网站部署和上述联调目前尚未完成。

## 源码打包

本包是网站源码，不是微信小程序上传包。构建所需的 `src/`、`shared/`、依赖清单、锁文件和项目配置必须一起保留，尤其不能遗漏 `shared/plannerSync.ts`。解压后的项目根目录是含 `package.json` 的目录。

使用明确的文件清单打包，不递归整个开发工作区。排除 `node_modules`、`dist`、`.git`、`.env*`、历史压缩包、历史解压目录、`outputs`、`模版`、`.DS_Store` 和 `__MACOSX`。环境变量继续在原部署平台设置，不在源码包中提供私密凭据。
