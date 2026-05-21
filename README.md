# 今日计划手帐

一个 Vite + React + TypeScript 的每日计划手帐网页 MVP。数据默认保存在浏览器 `localStorage`，key 为 `daily-planner-journal-v1`。用户也可以用 QQ 邮箱、163 邮箱、Gmail 等普通邮箱注册并设置本站密码，登录后通过 Supabase Auth 保存自己的每日计划数据。

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
3. 登录后会读取当前用户的 `daily_planner_user_data` 云端数据，并与本地数据做简单合并。
4. 登录状态下新增、编辑、删除、完成计划会自动保存到当前用户的云端数据。
5. 可以随时退出登录，退出后仍可继续本地使用。

旧的个人同步码入口已从主流程隐藏，旧表 `daily_planner_syncs` 不需要删除。

## 数据隔离

云端数据保存在 Supabase 表 `public.daily_planner_user_data`。表已开启 RLS，每个用户只能读取和修改自己的行，客户端按当前 Supabase Auth 用户的 `user_id` 读取和保存 `payload`。

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

## 后续可扩展

- 月视图或周视图统计。
- 自定义分类和颜色。
- 手帐模板主题切换。
- 更多贴纸和轻量插画素材。
- 导入、导出 JSON 备份。
