# 今日计划手帐

一个 Vite + React + TypeScript 的每日计划手帐网页 MVP。数据默认保存在浏览器 `localStorage`，key 为 `daily-planner-journal-v1`。可选输入个人同步码后，通过 Supabase RPC 同步到云端，不包含注册登录、支付或图片生成接口。

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

## 云同步

项目支持可选的个人同步码：

1. 在 Vercel 配置 Supabase 环境变量。
2. 打开网页，在左侧输入同一个个人同步码。
3. Chrome、Safari、手机等不同设备使用同一个同步码后，会同步同一份每日计划。
4. 未输入同步码时仍然只使用本地 `localStorage`。

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

- 表：`public.daily_planner_syncs`
- RPC：`public.get_daily_planner_sync`
- RPC：`public.upsert_daily_planner_sync`

个人同步码会在浏览器端做 SHA-256 hash 后再请求云端。请使用不容易被猜到的同步码；知道同步码的人可以访问同一份数据。

## 后续可扩展

- 月视图或周视图统计。
- 自定义分类和颜色。
- 手帐模板主题切换。
- 更多贴纸和轻量插画素材。
- 导入、导出 JSON 备份。
