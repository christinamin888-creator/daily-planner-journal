# 今日计划手帐

一个 Vite + React + TypeScript 的每日计划手帐网页 MVP。数据仅保存在浏览器 `localStorage`，key 为 `daily-planner-journal-v1`，不包含后端、数据库、登录或图片生成接口。

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

## 后续可扩展

- 月视图或周视图统计。
- 自定义分类和颜色。
- 手帐模板主题切换。
- 更多贴纸和轻量插画素材。
- 导入、导出 JSON 备份。
