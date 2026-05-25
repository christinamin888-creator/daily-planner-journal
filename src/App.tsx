import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import {
  getCurrentSession,
  getDailyPlannerUserData,
  isSupabaseConfigured,
  onAuthStateChange,
  resetPassword,
  signIn,
  signOut,
  signUp,
  updatePassword,
  upsertDailyPlannerUserData,
} from "./lib/supabase";
import type { User as SupabaseUser } from "@supabase/supabase-js";

const primaryBearNoteSticker = new URL("./assets/export-stickers/primary-bear-note.png", import.meta.url).href;
const primaryBookPencilSticker = new URL("./assets/export-stickers/primary-book-pencil.png", import.meta.url).href;
const primaryAlarmClockSticker = new URL("./assets/export-stickers/primary-alarm-clock.png", import.meta.url).href;
const primaryCameraSticker = new URL("./assets/export-stickers/primary-camera.png", import.meta.url).href;
const primaryCupcakeSticker = new URL("./assets/export-stickers/primary-cupcake.png", import.meta.url).href;
const primaryDeskLampSticker = new URL("./assets/export-stickers/primary-desk-lamp.png", import.meta.url).href;
const primaryFlowerBouquetSticker = new URL("./assets/export-stickers/primary-flower-bouquet.png", import.meta.url).href;
const primaryMagicWandSticker = new URL("./assets/export-stickers/primary-magic-wand.png", import.meta.url).href;
const primaryMilkTeaSticker = new URL("./assets/export-stickers/primary-milk-tea.png", import.meta.url).href;
const primaryPaperPlaneSticker = new URL("./assets/export-stickers/primary-paper-plane.png", import.meta.url).href;
const primaryPencilCaseSticker = new URL("./assets/export-stickers/primary-pencil-case.png", import.meta.url).href;
const primaryRabbitSticker = new URL("./assets/export-stickers/primary-rabbit.png", import.meta.url).href;
const primaryRainbowCloudSticker = new URL("./assets/export-stickers/primary-rainbow-cloud.png", import.meta.url).href;
const primaryStrawberrySticker = new URL("./assets/export-stickers/primary-strawberry.png", import.meta.url).href;

const STORAGE_KEY = "daily-planner-journal-v1";
const LEGACY_SYNC_STATE_KEY = "daily-planner-journal-sync-v1";
const DELETED_ITEM_IDS_KEY = "daily-planner-journal-deleted-v1";
const CUSTOM_CATEGORIES_KEY = "daily-planner-journal-custom-categories-v1";
const SYNC_DEBOUNCE_MS = 800;
const COUNTDOWN_OPTIONS = [
  {
    activeClass: "border-sky-300 bg-sky-200 text-sky-900 shadow-sm shadow-sky-100",
    baseClass: "border-sky-100 bg-sky-50 text-sky-700 hover:bg-sky-100",
    minutes: 5,
    title: "倒计时 5 分钟",
  },
  {
    activeClass: "border-violet-300 bg-violet-200 text-violet-900 shadow-sm shadow-violet-100",
    baseClass: "border-violet-100 bg-violet-50 text-violet-700 hover:bg-violet-100",
    minutes: 10,
    title: "倒计时 10 分钟",
  },
  {
    activeClass: "border-amber-300 bg-amber-200 text-amber-900 shadow-sm shadow-amber-100",
    baseClass: "border-amber-100 bg-amber-50 text-amber-700 hover:bg-amber-100",
    minutes: 30,
    title: "倒计时 30 分钟",
  },
  {
    activeClass: "border-pink-300 bg-pink-200 text-pink-900 shadow-sm shadow-pink-100",
    baseClass: "border-pink-100 bg-pink-50 text-pink-700 hover:bg-pink-100",
    minutes: 60,
    title: "倒计时 60 分钟",
  },
] as const;
const EXPORT_PAGE_WIDTH = 1055;
const EXPORT_PAGE_HEIGHT = 1491;

const CATEGORY_OPTIONS = [
  "学习",
  "工作",
  "生活",
  "运动",
  "购物",
  "创作",
  "休息",
  "娱乐",
  "做家务",
  "其他",
] as const;

type BuiltInCategory = (typeof CATEGORY_OPTIONS)[number];
type Category = string;

type CustomCategory = {
  id: string;
  name: string;
  icon: string;
};

type PlanItem = {
  id: string;
  date: string;
  title: string;
  category: Category;
  note: string;
  completed: boolean;
  targetMinutes?: number;
  actualMinutes?: number;
  createdAt: number;
  updatedAt?: number;
};

type PlanBook = Record<string, PlanItem[]>;
type CloudPayload = {
  plansByDate: PlanBook;
  deletedItemIds: string[];
  customCategories: CustomCategory[];
};

type AuthMode = "sign-in" | "sign-up" | "forgot" | "update-password";

type AuthForm = {
  email: string;
  password: string;
  confirmPassword: string;
};

type CompletionFeedback = {
  id: number;
  itemId: string;
  title: string;
  detail: string;
  completionRate: number;
  variantIndex: number;
};

type TaskTimerState = {
  itemId: string;
  forwardHasStarted: boolean;
  elapsedSeconds: number;
  isRunning: boolean;
  startedAt: number | null;
  countdownHasStarted: boolean;
  countdownInitialSeconds: number;
  countdownRemainingSeconds: number;
  countdownIsRunning: boolean;
  countdownStartedAt: number | null;
};

type CategoryStyle = {
  emoji: string;
  accent: string;
  bg: string;
  border: string;
  caption: string;
};

type PlanForm = {
  title: string;
  category: Category;
  note: string;
  targetMinutes: string;
};

type CompletionVariant = {
  sparkles: string[];
  accentClass: string;
  detailClass: string;
  ringClass: string;
  fromX: number;
  fromY: number;
  rotate: number;
};

type ExportTemplate = {
  id: string;
  audience: string;
  name: string;
  title: string;
  subtitle: string;
  footer: string;
  sectionTitles: {
    tasks: string;
    stats: string;
    encouragement: string;
  };
  background: string;
  paper: string;
  card: string;
  accent: string;
  accent2: string;
  accentSoft: string;
  ink: string;
  muted: string;
  border: string;
  checkbox: string;
  cardBorderStyle: "solid" | "dashed" | "double";
  decorations: string[];
  layout:
    | "cute"
    | "study"
    | "campus"
    | "work"
    | "teacher"
    | "research"
    | "journal"
    | "executive"
    | "home"
    | "minimal";
  titleSize: number;
  dateSize: number;
  taskTitleSize: number;
};

const CATEGORY_STYLES: Record<BuiltInCategory, CategoryStyle> = {
  学习: {
    emoji: "📚✏️",
    accent: "text-sky-700",
    bg: "bg-sky-50",
    border: "border-sky-200",
    caption: "书本铅笔",
  },
  工作: {
    emoji: "💻☕",
    accent: "text-violet-700",
    bg: "bg-violet-50",
    border: "border-violet-200",
    caption: "电脑咖啡",
  },
  生活: {
    emoji: "🏠🌼",
    accent: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    caption: "小房子花朵",
  },
  运动: {
    emoji: "🏃⚡",
    accent: "text-orange-700",
    bg: "bg-orange-50",
    border: "border-orange-200",
    caption: "跑步能量",
  },
  购物: {
    emoji: "🛍️",
    accent: "text-rose-700",
    bg: "bg-rose-50",
    border: "border-rose-200",
    caption: "购物袋",
  },
  创作: {
    emoji: "🖌️✨",
    accent: "text-fuchsia-700",
    bg: "bg-fuchsia-50",
    border: "border-fuchsia-200",
    caption: "画笔星星",
  },
  休息: {
    emoji: "🌙☁️",
    accent: "text-indigo-700",
    bg: "bg-indigo-50",
    border: "border-indigo-200",
    caption: "月亮云朵",
  },
  娱乐: {
    emoji: "🎮🎬",
    accent: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    caption: "游戏手柄电影",
  },
  做家务: {
    emoji: "🧹🧺",
    accent: "text-teal-700",
    bg: "bg-teal-50",
    border: "border-teal-200",
    caption: "扫帚洗衣篮",
  },
  其他: {
    emoji: "💗🏷️",
    accent: "text-pink-700",
    bg: "bg-pink-50",
    border: "border-pink-200",
    caption: "爱心贴纸",
  },
};

const COMPLETION_VARIANTS: CompletionVariant[] = [
  {
    sparkles: ["🎉", "✨", "⭐", "🎀", "✦"],
    accentClass: "text-pink-600",
    detailClass: "text-[#74667d]",
    ringClass: "border-pink-100 bg-white/95 shadow-pink-100/80",
    fromX: -10,
    fromY: 8,
    rotate: -2,
  },
  {
    sparkles: ["🌈", "💫", "✨", "🫧", "⭐"],
    accentClass: "text-sky-700",
    detailClass: "text-sky-700",
    ringClass: "border-sky-100 bg-sky-50/95 shadow-sky-100/80",
    fromX: 10,
    fromY: -6,
    rotate: 2,
  },
  {
    sparkles: ["🎊", "🌟", "💖", "✨", "🎉"],
    accentClass: "text-rose-600",
    detailClass: "text-rose-700",
    ringClass: "border-rose-100 bg-rose-50/95 shadow-rose-100/80",
    fromX: -6,
    fromY: -10,
    rotate: 1,
  },
  {
    sparkles: ["🪄", "✨", "🌙", "⭐", "💫"],
    accentClass: "text-violet-700",
    detailClass: "text-violet-700",
    ringClass: "border-violet-100 bg-violet-50/95 shadow-violet-100/80",
    fromX: 8,
    fromY: 10,
    rotate: -1,
  },
  {
    sparkles: ["🌼", "🍀", "✨", "💚", "⭐"],
    accentClass: "text-emerald-700",
    detailClass: "text-emerald-700",
    ringClass: "border-emerald-100 bg-emerald-50/95 shadow-emerald-100/80",
    fromX: -8,
    fromY: 4,
    rotate: 2,
  },
  {
    sparkles: ["⚡", "🔥", "🎯", "✨", "🎉"],
    accentClass: "text-orange-700",
    detailClass: "text-orange-700",
    ringClass: "border-orange-100 bg-orange-50/95 shadow-orange-100/80",
    fromX: 6,
    fromY: -8,
    rotate: -2,
  },
];

const EXPORT_TEMPLATES: ExportTemplate[] = [
  {
    id: "primary-general-pastel",
    audience: "小学生",
    name: "通用可爱粉彩",
    title: "今日计划",
    subtitle: "完成一项，就给今天加一颗小星星。",
    footer: "今天也很棒，给自己一个大大的夸奖！",
    sectionTitles: {
      tasks: "今日任务",
      stats: "完成进度",
      encouragement: "今日小结",
    },
    background: "linear-gradient(135deg, #ffe8f4 0%, #fff9ef 52%, #eef8ff 100%)",
    paper: "#fffaf7",
    card: "rgba(255, 255, 255, 0.88)",
    accent: "#e85b9a",
    accent2: "#8f72e8",
    accentSoft: "#ffe1ef",
    ink: "#3f3146",
    muted: "#8a6e82",
    border: "#ffafd3",
    checkbox: "#e85b9a",
    cardBorderStyle: "dashed",
    decorations: ["🎀", "⭐", "🌈", "💗", "🍓", "☁️"],
    layout: "cute",
    titleSize: 58,
    dateSize: 31,
    taskTitleSize: 24,
  },
  {
    id: "primary-boy-space",
    audience: "小学生",
    name: "太空运动",
    title: "今日计划",
    subtitle: "像小宇航员一样，把今天的小目标一项项点亮。",
    footer: "小小目标，稳稳完成。",
    sectionTitles: {
      tasks: "今日任务舱",
      stats: "能量进度",
      encouragement: "发射鼓励",
    },
    background: "linear-gradient(135deg, #eaf6ff 0%, #fffaf0 52%, #eefaf5 100%)",
    paper: "#fbfdff",
    card: "rgba(255, 255, 255, 0.9)",
    accent: "#287fc0",
    accent2: "#f2a33a",
    accentSoft: "#e2f4ff",
    ink: "#24374a",
    muted: "#64788d",
    border: "#a7d9f7",
    checkbox: "#287fc0",
    cardBorderStyle: "solid",
    decorations: ["🚀", "🪐", "⚽", "🤖", "⭐", "☄️"],
    layout: "cute",
    titleSize: 56,
    dateSize: 30,
    taskTitleSize: 23,
  },
  {
    id: "primary-girl-bow",
    audience: "小学生",
    name: "粉紫蝴蝶结",
    title: "今日计划",
    subtitle: "认真完成，也要开开心心。",
    footer: "完成一项，就给自己一颗小星星。",
    sectionTitles: {
      tasks: "可爱任务",
      stats: "星星进度",
      encouragement: "甜甜鼓励",
    },
    background: "linear-gradient(135deg, #fff1f8 0%, #fffaf0 50%, #f5efff 100%)",
    paper: "#fffafd",
    card: "rgba(255, 255, 255, 0.9)",
    accent: "#e45c9c",
    accent2: "#b58be7",
    accentSoft: "#ffe8f5",
    ink: "#3d2a48",
    muted: "#8e718a",
    border: "#f7b5dd",
    checkbox: "#e45c9c",
    cardBorderStyle: "dashed",
    decorations: ["🎀", "🐰", "☁️", "⭐", "💗", "🌷"],
    layout: "cute",
    titleSize: 56,
    dateSize: 30,
    taskTitleSize: 23,
  },
  {
    id: "primary-girl-mint",
    audience: "小学生",
    name: "薄荷柠檬",
    title: "今日计划",
    subtitle: "清清爽爽完成今天的小任务。",
    footer: "慢慢做，也能完成得很好。",
    sectionTitles: {
      tasks: "薄荷任务",
      stats: "清新进度",
      encouragement: "柠檬提醒",
    },
    background: "linear-gradient(135deg, #effbef 0%, #fffaf1 52%, #eaf9ff 100%)",
    paper: "#fffef8",
    card: "rgba(255, 255, 255, 0.9)",
    accent: "#39a98b",
    accent2: "#f0b74e",
    accentSoft: "#e8ffef",
    ink: "#2d443d",
    muted: "#668379",
    border: "#aee8d1",
    checkbox: "#39a98b",
    cardBorderStyle: "dashed",
    decorations: ["🌿", "🍋", "🐥", "🌼", "⭐", "🍃"],
    layout: "cute",
    titleSize: 54,
    dateSize: 30,
    taskTitleSize: 23,
  },
  {
    id: "primary-girl-peach",
    audience: "小学生",
    name: "暖桃奶油",
    title: "今日计划",
    subtitle: "把小任务放进暖暖的一天里。",
    footer: "认真完成的你，已经很棒啦。",
    sectionTitles: {
      tasks: "暖桃任务",
      stats: "完成甜度",
      encouragement: "奶油鼓励",
    },
    background: "linear-gradient(135deg, #fff1df 0%, #fff9f1 50%, #fff0f4 100%)",
    paper: "#fffaf2",
    card: "rgba(255, 255, 255, 0.9)",
    accent: "#d47752",
    accent2: "#e6a63d",
    accentSoft: "#ffefda",
    ink: "#4c352d",
    muted: "#826c62",
    border: "#efc4aa",
    checkbox: "#d47752",
    cardBorderStyle: "dashed",
    decorations: ["🐱", "🧁", "🌻", "✏️", "💗", "🍑"],
    layout: "cute",
    titleSize: 54,
    dateSize: 30,
    taskTitleSize: 23,
  },
  {
    id: "primary-girl-ocean",
    audience: "小学生",
    name: "海洋梦幻",
    title: "今日计划",
    subtitle: "像小海星一样，一点点闪光。",
    footer: "今天的小浪花，也在推着你前进。",
    sectionTitles: {
      tasks: "海星任务",
      stats: "浪花进度",
      encouragement: "海风鼓励",
    },
    background: "linear-gradient(135deg, #eef7ff 0%, #f7f0ff 52%, #f2fffb 100%)",
    paper: "#fbfdff",
    card: "rgba(255, 255, 255, 0.9)",
    accent: "#5c8edb",
    accent2: "#83c8d7",
    accentSoft: "#e5f3ff",
    ink: "#2e3b57",
    muted: "#687592",
    border: "#b9d4ff",
    checkbox: "#5c8edb",
    cardBorderStyle: "dashed",
    decorations: ["🐚", "🐳", "🌙", "⭐", "🫧", "💜"],
    layout: "cute",
    titleSize: 54,
    dateSize: 30,
    taskTitleSize: 23,
  },
  {
    id: "primary-boy-racing-a",
    audience: "小学生",
    name: "红蓝赛车",
    title: "今日计划",
    subtitle: "开足马力，完成今天。",
    footer: "今天的任务，一项一项冲线。",
    sectionTitles: {
      tasks: "冲线任务",
      stats: "赛车进度",
      encouragement: "加速提示",
    },
    background: "linear-gradient(135deg, #fff0ee 0%, #fffdf4 52%, #edf5ff 100%)",
    paper: "#fffdf8",
    card: "rgba(255, 255, 255, 0.9)",
    accent: "#d8493f",
    accent2: "#2f7cc0",
    accentSoft: "#ffece8",
    ink: "#273146",
    muted: "#6b7184",
    border: "#f0b7b0",
    checkbox: "#d8493f",
    cardBorderStyle: "solid",
    decorations: ["🏎️", "🏁", "⚡", "⭐", "🔧", "🚦"],
    layout: "cute",
    titleSize: 54,
    dateSize: 30,
    taskTitleSize: 23,
  },
  {
    id: "primary-boy-racing-b",
    audience: "小学生",
    name: "蓝红赛道",
    title: "今日计划",
    subtitle: "把今天的小任务一项项跑完。",
    footer: "稳稳冲线，也是一种厉害。",
    sectionTitles: {
      tasks: "赛道任务",
      stats: "冲刺进度",
      encouragement: "补给站",
    },
    background: "linear-gradient(135deg, #edf5ff 0%, #fffdf4 52%, #fff0ee 100%)",
    paper: "#fbfdff",
    card: "rgba(255, 255, 255, 0.9)",
    accent: "#275ca8",
    accent2: "#e15b4f",
    accentSoft: "#e7f1ff",
    ink: "#273146",
    muted: "#6b7184",
    border: "#abcaf4",
    checkbox: "#275ca8",
    cardBorderStyle: "solid",
    decorations: ["🏁", "🏎️", "⚡", "⭐", "🔧", "🚦"],
    layout: "cute",
    titleSize: 54,
    dateSize: 30,
    taskTitleSize: 23,
  },
  {
    id: "primary-boy-forest",
    audience: "小学生",
    name: "森林探险",
    title: "今日计划",
    subtitle: "今天的小探险，从完成计划开始。",
    footer: "一步一步走，也能发现很多宝藏。",
    sectionTitles: {
      tasks: "探险任务",
      stats: "地图进度",
      encouragement: "营地鼓励",
    },
    background: "linear-gradient(135deg, #f2fbeb 0%, #fff8ef 52%, #eef8f1 100%)",
    paper: "#fffdf5",
    card: "rgba(255, 255, 255, 0.9)",
    accent: "#4f8b55",
    accent2: "#b98046",
    accentSoft: "#eefae1",
    ink: "#334232",
    muted: "#6d7966",
    border: "#bfdfb0",
    checkbox: "#4f8b55",
    cardBorderStyle: "dashed",
    decorations: ["🌲", "🧭", "🍃", "⭐", "🏕️", "🗺️"],
    layout: "cute",
    titleSize: 54,
    dateSize: 30,
    taskTitleSize: 23,
  },
  {
    id: "secondary-focus",
    audience: "初中生/高中生",
    name: "学习冲刺",
    title: "今日计划",
    subtitle: "把复习、作业和错题拆成今天能完成的步骤。",
    footer: "稳定推进，比临时冲刺更有力量。",
    sectionTitles: {
      tasks: "今日学习任务",
      stats: "学习完成率",
      encouragement: "复盘提醒",
    },
    background: "linear-gradient(135deg, #eef7ff 0%, #ffffff 50%, #f3f0ff 100%)",
    paper: "#ffffff",
    card: "#f8fbff",
    accent: "#2f74c8",
    accent2: "#6a5fd6",
    accentSoft: "#dbeeff",
    ink: "#263650",
    muted: "#64728a",
    border: "#b7d7ff",
    checkbox: "#2f74c8",
    cardBorderStyle: "solid",
    decorations: ["📘", "✍️", "🎯", "⏱️"],
    layout: "study",
    titleSize: 48,
    dateSize: 27,
    taskTitleSize: 21,
  },
  {
    id: "college-campus",
    audience: "大学生",
    name: "校园节奏",
    title: "今日计划",
    subtitle: "课程、社团、作业和生活安排放在同一页。",
    footer: "今天先把重要的一步做好。",
    sectionTitles: {
      tasks: "今日安排",
      stats: "完成概览",
      encouragement: "今日留白",
    },
    background: "linear-gradient(135deg, #edf8ff 0%, #fffdf5 50%, #effbf2 100%)",
    paper: "#fbfefe",
    card: "rgba(255, 255, 255, 0.9)",
    accent: "#2784a8",
    accent2: "#55a463",
    accentSoft: "#dff4fb",
    ink: "#243943",
    muted: "#607780",
    border: "#a9d8e8",
    checkbox: "#2784a8",
    cardBorderStyle: "solid",
    decorations: ["🎓", "📎", "☕", "🌿"],
    layout: "campus",
    titleSize: 48,
    dateSize: 27,
    taskTitleSize: 21,
  },
  {
    id: "office-work",
    audience: "上班族",
    name: "工作行动表",
    title: "今日计划",
    subtitle: "清晰排序，稳稳推进。",
    footer: "把今天交付得更轻一点。",
    sectionTitles: {
      tasks: "行动清单",
      stats: "交付进度",
      encouragement: "收尾提醒",
    },
    background: "linear-gradient(135deg, #eef5fb 0%, #ffffff 48%, #f4f7f6 100%)",
    paper: "#ffffff",
    card: "#f8fafc",
    accent: "#176ea8",
    accent2: "#4c7d68",
    accentSoft: "#dff0fb",
    ink: "#263648",
    muted: "#667589",
    border: "#bcdff4",
    checkbox: "#176ea8",
    cardBorderStyle: "solid",
    decorations: ["💻", "📌", "☕", "✅"],
    layout: "work",
    titleSize: 45,
    dateSize: 26,
    taskTitleSize: 20,
  },
  {
    id: "teacher-class",
    audience: "教师",
    name: "教学安排",
    title: "今日计划",
    subtitle: "备课、课堂、反馈，一页看清。",
    footer: "愿今天的课堂温柔又有序。",
    sectionTitles: {
      tasks: "教学与班务",
      stats: "处理进度",
      encouragement: "课后记录",
    },
    background: "linear-gradient(135deg, #fff2e9 0%, #fffdf8 50%, #eef9ff 100%)",
    paper: "#fffefa",
    card: "#ffffff",
    accent: "#d5693a",
    accent2: "#4f9a62",
    accentSoft: "#ffe3d4",
    ink: "#4b352c",
    muted: "#806a61",
    border: "#f2c5ad",
    checkbox: "#d5693a",
    cardBorderStyle: "solid",
    decorations: ["🍎", "📚", "🔔", "🌼"],
    layout: "teacher",
    titleSize: 46,
    dateSize: 26,
    taskTitleSize: 20,
  },
  {
    id: "research-log",
    audience: "科研工作者",
    name: "科研日志",
    title: "今日计划",
    subtitle: "实验、阅读、写作，持续推进。",
    footer: "Small progress compounds.",
    sectionTitles: {
      tasks: "Research Tasks",
      stats: "Progress",
      encouragement: "Next Note",
    },
    background: "linear-gradient(135deg, #edf7f9 0%, #ffffff 50%, #f4f0ff 100%)",
    paper: "#ffffff",
    card: "#f8fbfc",
    accent: "#2f7f8d",
    accent2: "#5867a8",
    accentSoft: "#d8eef2",
    ink: "#243c43",
    muted: "#617980",
    border: "#b7dce3",
    checkbox: "#2f7f8d",
    cardBorderStyle: "solid",
    decorations: ["🔬", "📊", "🧪", "📄"],
    layout: "research",
    titleSize: 44,
    dateSize: 25,
    taskTitleSize: 19,
  },
  {
    id: "medical-study",
    audience: "医学专业",
    name: "蓝色生死恋",
    title: "今日计划",
    subtitle: "学习、实训、复盘和临床任务都清楚安排。",
    footer: "把知识落到行动里，今天也在稳稳进步。",
    sectionTitles: {
      tasks: "医学任务",
      stats: "学习进度",
      encouragement: "今日复盘",
    },
    background: "linear-gradient(135deg, #0057A8 0%, #008ED6 36%, #00B7E8 68%, #F7FCFF 100%)",
    paper: "#F7FCFF",
    card: "rgba(247, 252, 255, 0.94)",
    accent: "#0057A8",
    accent2: "#D71920",
    accentSoft: "#d7effa",
    ink: "#17324A",
    muted: "#4f6f82",
    border: "#7FAAC7",
    checkbox: "#0057A8",
    cardBorderStyle: "solid",
    decorations: ["🩺", "💊", "🧬", "📋"],
    layout: "research",
    titleSize: 44,
    dateSize: 25,
    taskTitleSize: 19,
  },
  {
    id: "journal-sticker",
    audience: "手账爱好者",
    name: "拼贴贴纸",
    title: "今日计划",
    subtitle: "把计划贴进今天的生活里。",
    footer: "今天也在认真生活呀。",
    sectionTitles: {
      tasks: "贴纸任务",
      stats: "完成贴纸",
      encouragement: "心情便签",
    },
    background: "linear-gradient(135deg, #fff0f5 0%, #fffaf0 45%, #eef8ff 100%)",
    paper: "#fffaf4",
    card: "rgba(255, 255, 255, 0.9)",
    accent: "#df5f8f",
    accent2: "#b37648",
    accentSoft: "#ffddea",
    ink: "#44323f",
    muted: "#846d7b",
    border: "#f5b8d0",
    checkbox: "#df5f8f",
    cardBorderStyle: "dashed",
    decorations: ["🎞️", "🧷", "🎀", "🌷", "✦"],
    layout: "journal",
    titleSize: 48,
    dateSize: 27,
    taskTitleSize: 21,
  },
  {
    id: "executive-brief",
    audience: "团队管理",
    name: "团队行动计划",
    title: "今日计划",
    subtitle: "把关键事项、节奏和优先级排进今天。",
    footer: "今天先推进最关键的一步。",
    sectionTitles: {
      tasks: "关键行动",
      stats: "推进进度",
      encouragement: "行动提醒",
    },
    background: "linear-gradient(135deg, #eef3f8 0%, #ffffff 48%, #f7f8fb 100%)",
    paper: "#ffffff",
    card: "#f8fafc",
    accent: "#315b7d",
    accent2: "#60724d",
    accentSoft: "#dbe9f4",
    ink: "#223447",
    muted: "#617184",
    border: "#b9cfe0",
    checkbox: "#315b7d",
    cardBorderStyle: "solid",
    decorations: ["📈", "🎯", "🧭", "📌"],
    layout: "executive",
    titleSize: 42,
    dateSize: 24,
    taskTitleSize: 19,
  },
  {
    id: "home-family",
    audience: "家庭生活",
    name: "家庭生活计划",
    title: "今日计划",
    subtitle: "家务、采购、照顾家人和自己的时间都值得被看见。",
    footer: "把家照顾好，也记得照顾自己。",
    sectionTitles: {
      tasks: "生活清单",
      stats: "生活进度",
      encouragement: "温柔提醒",
    },
    background: "linear-gradient(135deg, #fff6ed 0%, #fffdf7 52%, #eef8f1 100%)",
    paper: "#fffdf8",
    card: "rgba(255, 255, 255, 0.9)",
    accent: "#c96f4a",
    accent2: "#5f9d73",
    accentSoft: "#ffe7d5",
    ink: "#47372f",
    muted: "#7d6d63",
    border: "#e9c7ad",
    checkbox: "#c96f4a",
    cardBorderStyle: "dashed",
    decorations: ["🏠", "🧺", "🌿", "🍲"],
    layout: "home",
    titleSize: 46,
    dateSize: 26,
    taskTitleSize: 20,
  },
  {
    id: "minimal-clean",
    audience: "简约通用版",
    name: "简约通用",
    title: "今日计划",
    subtitle: "清楚记录今天要完成的事。",
    footer: "Keep it clear. Keep it moving.",
    sectionTitles: {
      tasks: "Tasks",
      stats: "Status",
      encouragement: "Note",
    },
    background: "linear-gradient(135deg, #f8fafc 0%, #ffffff 55%, #f4f7f5 100%)",
    paper: "#ffffff",
    card: "#fbfcfd",
    accent: "#3f6272",
    accent2: "#6d7a5d",
    accentSoft: "#e3edf1",
    ink: "#263238",
    muted: "#69787f",
    border: "#cbd7dd",
    checkbox: "#3f6272",
    cardBorderStyle: "solid",
    decorations: ["✦", "•", "○", "□"],
    layout: "minimal",
    titleSize: 42,
    dateSize: 24,
    taskTitleSize: 19,
  },
];

const emptyForm: PlanForm = {
  title: "",
  category: "学习",
  note: "",
  targetMinutes: "",
};

function loadPlanBook(): PlanBook {
  try {
    const rawData = window.localStorage.getItem(STORAGE_KEY);

    if (!rawData) {
      return {};
    }

    const parsedData = JSON.parse(rawData) as PlanBook;
    return parsedData && typeof parsedData === "object" ? parsedData : {};
  } catch {
    return {};
  }
}

function savePlanBook(planBook: PlanBook) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(planBook));
  } catch {
    // localStorage may be unavailable in private or restricted browser modes.
  }
}

function loadDeletedItemIds(): string[] {
  try {
    const rawDeletedIds = window.localStorage.getItem(DELETED_ITEM_IDS_KEY);

    if (rawDeletedIds) {
      const parsedDeletedIds = JSON.parse(rawDeletedIds);
      return Array.isArray(parsedDeletedIds) ? parsedDeletedIds : [];
    }

    const rawLegacySyncState = window.localStorage.getItem(LEGACY_SYNC_STATE_KEY);
    const parsedLegacySyncState = rawLegacySyncState ? JSON.parse(rawLegacySyncState) : null;
    return Array.isArray(parsedLegacySyncState?.deletedItemIds)
      ? parsedLegacySyncState.deletedItemIds
      : [];
  } catch {
    return [];
  }
}

function saveDeletedItemIds(deletedItemIds: string[]) {
  try {
    window.localStorage.setItem(DELETED_ITEM_IDS_KEY, JSON.stringify(deletedItemIds));
  } catch {
    // localStorage may be unavailable in private or restricted browser modes.
  }
}

function normalizeCustomCategories(value: unknown): CustomCategory[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenNames = new Set<string>();

  return value.reduce<CustomCategory[]>((result, item) => {
    if (!item || typeof item !== "object") {
      return result;
    }

    const category = item as Partial<CustomCategory>;
    const name = typeof category.name === "string" ? category.name.trim() : "";

    if (!name || seenNames.has(name) || CATEGORY_OPTIONS.includes(name as BuiltInCategory)) {
      return result;
    }

    seenNames.add(name);
    result.push({
      id: typeof category.id === "string" && category.id ? category.id : createId(),
      name,
      icon: typeof category.icon === "string" && category.icon.trim() ? category.icon.trim() : "🏷️",
    });

    return result;
  }, []);
}

function loadCustomCategories(): CustomCategory[] {
  try {
    const rawData = window.localStorage.getItem(CUSTOM_CATEGORIES_KEY);
    return normalizeCustomCategories(rawData ? JSON.parse(rawData) : []);
  } catch {
    return [];
  }
}

function saveCustomCategories(customCategories: CustomCategory[]) {
  try {
    window.localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(customCategories));
  } catch {
    // localStorage may be unavailable in private or restricted browser modes.
  }
}

function hasPlans(planBook: PlanBook): boolean {
  return Object.values(planBook).some((items) => items.length > 0);
}

function getItemTime(item: PlanItem): number {
  return item.updatedAt ?? item.createdAt ?? 0;
}

function normalizeMinutes(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  return undefined;
}

function normalizePlanBook(planBook: PlanBook): PlanBook {
  return Object.entries(planBook).reduce<PlanBook>((result, [date, items]) => {
    result[date] = items.map((item) => ({
      ...item,
      date: item.date || date,
      targetMinutes: normalizeMinutes(item.targetMinutes),
      actualMinutes: normalizeMinutes(item.actualMinutes),
      updatedAt: item.updatedAt ?? item.createdAt ?? Date.now(),
    }));
    return result;
  }, {});
}

function normalizePayload(payload: unknown): CloudPayload {
  if (payload && typeof payload === "object" && "plansByDate" in payload) {
    const cloudPayload = payload as Partial<CloudPayload>;

    return {
      plansByDate: normalizePlanBook((cloudPayload.plansByDate ?? {}) as PlanBook),
      deletedItemIds: Array.isArray(cloudPayload.deletedItemIds)
        ? cloudPayload.deletedItemIds
        : [],
      customCategories: normalizeCustomCategories(cloudPayload.customCategories),
    };
  }

  return {
    plansByDate: normalizePlanBook((payload ?? {}) as PlanBook),
    deletedItemIds: [],
    customCategories: [],
  };
}

function mergePlanBooks(
  localPlanBook: PlanBook,
  cloudPlanBook: PlanBook,
  deletedItemIds: string[],
): PlanBook {
  const deletedSet = new Set(deletedItemIds);
  const dates = new Set([...Object.keys(localPlanBook), ...Object.keys(cloudPlanBook)]);
  const merged: PlanBook = {};

  dates.forEach((date) => {
    const itemMap = new Map<string, PlanItem>();

    [...(localPlanBook[date] ?? []), ...(cloudPlanBook[date] ?? [])].forEach((item) => {
      if (deletedSet.has(item.id)) {
        return;
      }

      const normalizedItem = {
        ...item,
        date: item.date || date,
        updatedAt: item.updatedAt ?? item.createdAt ?? Date.now(),
      };
      const existingItem = itemMap.get(item.id);

      if (!existingItem || getItemTime(normalizedItem) >= getItemTime(existingItem)) {
        itemMap.set(item.id, normalizedItem);
      }
    });

    const items = Array.from(itemMap.values()).sort((a, b) => b.createdAt - a.createdAt);

    if (items.length > 0) {
      merged[date] = items;
    }
  });

  return merged;
}

function mergeCustomCategories(
  localCategories: CustomCategory[],
  cloudCategories: CustomCategory[],
): CustomCategory[] {
  const categoriesByName = new Map<string, CustomCategory>();

  [...localCategories, ...cloudCategories].forEach((category) => {
    const name = category.name.trim();

    if (!name || CATEGORY_OPTIONS.includes(name as BuiltInCategory) || categoriesByName.has(name)) {
      return;
    }

    categoriesByName.set(name, {
      id: category.id || createId(),
      name,
      icon: category.icon || "🏷️",
    });
  });

  return Array.from(categoriesByName.values());
}

function createCloudPayload(
  planBook: PlanBook,
  deletedItemIds: string[],
  customCategories: CustomCategory[],
): CloudPayload {
  return {
    plansByDate: normalizePlanBook(planBook),
    deletedItemIds,
    customCategories: normalizeCustomCategories(customCategories),
  };
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values));
}

function arePlanBooksEqual(firstPlanBook: PlanBook, secondPlanBook: PlanBook): boolean {
  return JSON.stringify(firstPlanBook) === JSON.stringify(secondPlanBook);
}

function areStringArraysEqual(firstValues: string[], secondValues: string[]): boolean {
  return JSON.stringify(firstValues) === JSON.stringify(secondValues);
}

function parseOptionalMinutes(value: string): number | null | undefined {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return undefined;
  }

  if (!/^[1-9]\d*$/.test(trimmedValue)) {
    return null;
  }

  return Number(trimmedValue);
}

function formatMinutes(minutes: number | undefined): string {
  return minutes ? `${minutes} 分钟` : "未设置";
}

function getTaskTimerElapsedSeconds(timer: TaskTimerState, now = Date.now()): number {
  if (!timer.isRunning || timer.startedAt === null) {
    return timer.elapsedSeconds;
  }

  return timer.elapsedSeconds + Math.max(0, Math.floor((now - timer.startedAt) / 1000));
}

function getCountdownRemainingSeconds(timer: TaskTimerState, now = Date.now()): number {
  if (!timer.countdownIsRunning || timer.countdownStartedAt === null) {
    return timer.countdownRemainingSeconds;
  }

  return Math.max(
    0,
    timer.countdownRemainingSeconds -
      Math.max(0, Math.floor((now - timer.countdownStartedAt) / 1000)),
  );
}

function formatTimerSeconds(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function timerSecondsToActualMinutes(seconds: number): number {
  return Math.max(1, Math.ceil(Math.max(0, seconds) / 60));
}

function createTaskTimerState(itemId: string): TaskTimerState {
  return {
    itemId,
    forwardHasStarted: false,
    elapsedSeconds: 0,
    isRunning: false,
    startedAt: null,
    countdownHasStarted: false,
    countdownInitialSeconds: 0,
    countdownRemainingSeconds: 0,
    countdownIsRunning: false,
    countdownStartedAt: null,
  };
}

function getCategoryStyle(category: string, customCategories: CustomCategory[]): CategoryStyle {
  if (CATEGORY_OPTIONS.includes(category as BuiltInCategory)) {
    return CATEGORY_STYLES[category as BuiltInCategory];
  }

  const customCategory = customCategories.find((item) => item.name === category);

  return {
    emoji: customCategory?.icon ?? "🏷️",
    accent: "text-pink-700",
    bg: "bg-pink-50",
    border: "border-pink-200",
    caption: customCategory ? `${customCategory.name}分类` : "自定义分类",
  };
}

function getCompletionCountMessage(completedCount: number): string {
  if (completedCount >= 5) {
    return `第 ${completedCount} 项完成，今天执行力爆棚！`;
  }

  if (completedCount === 4) {
    return "第 4 项完成，节奏稳稳的！";
  }

  if (completedCount === 3) {
    return "第 3 项完成，三连达成啦！";
  }

  if (completedCount === 2) {
    return "第 2 项完成，状态来了！";
  }

  return "第 1 项完成，开局很棒！";
}

function getCompletionRateMessage(completionRate: number, completedCount: number): string {
  if (completionRate >= 60) {
    const messages = [
      "离今日目标越来越近了！",
      "状态越来越好了，继续前进！",
      "今天的节奏已经热起来了！",
    ];

    return messages[completedCount % messages.length];
  }

  if (completionRate >= 30) {
    const messages = [
      "节奏不错，继续保持！",
      "今天已经完成不少啦！",
      "一步一步，正在变得更顺！",
    ];

    return messages[completedCount % messages.length];
  }

  const messages = [
    "已经开始就很棒！",
    "小小一步，也是在前进",
    "认真生活的感觉来了",
  ];

  return messages[completedCount % messages.length];
}

function createCompletionFeedback(params: {
  itemId: string;
  completedCount: number;
  totalCount: number;
}): CompletionFeedback {
  const completionRate =
    params.totalCount > 0 ? Math.round((params.completedCount / params.totalCount) * 100) : 0;

  return {
    id: Date.now(),
    itemId: params.itemId,
    title: getCompletionCountMessage(params.completedCount),
    detail: getCompletionRateMessage(completionRate, params.completedCount),
    completionRate,
    variantIndex: (params.completedCount - 1) % COMPLETION_VARIANTS.length,
  };
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(dateValue: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(`${dateValue}T00:00:00`));
}

function createId(): string {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function waitForImages(element: HTMLElement): Promise<void> {
  const images = Array.from(element.querySelectorAll("img"));

  return Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete && image.naturalWidth > 0) {
            resolve();
            return;
          }

          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        }),
    ),
  ).then(() => undefined);
}

type ExportDensity = {
  columns: number;
  maxVisibleItems: number;
  gap: number;
  cardHeight: number;
  cardPadding: number;
  checkboxSize: number;
  categorySize: number;
  taskTitleSize: number;
  metaSize: number;
  noteSize: number;
  titleLines: number;
  noteLines: number;
  showNotes: boolean;
};

function getExportDensity(planCount: number, template: ExportTemplate): ExportDensity {
  const taskTitleSize = Math.max(template.taskTitleSize + 7, 26);

  if (planCount <= 1) {
    return {
      columns: 1,
      maxVisibleItems: 10,
      gap: 16,
      cardHeight: 210,
      cardPadding: 22,
      checkboxSize: 38,
      categorySize: 14,
      taskTitleSize,
      metaSize: 13,
      noteSize: 14,
      titleLines: 3,
      noteLines: 2,
      showNotes: true,
    };
  }

  if (planCount <= 6) {
    return {
      columns: 2,
      maxVisibleItems: 12,
      gap: 16,
      cardHeight: 190,
      cardPadding: 20,
      checkboxSize: 36,
      categorySize: 13,
      taskTitleSize,
      metaSize: 12,
      noteSize: 14,
      titleLines: 2,
      noteLines: 2,
      showNotes: true,
    };
  }

  if (planCount <= 10) {
    return {
      columns: 2,
      maxVisibleItems: 12,
      gap: 12,
      cardHeight: 158,
      cardPadding: 15,
      checkboxSize: 30,
      categorySize: 12,
      taskTitleSize: Math.max(taskTitleSize - 2, 17),
      metaSize: 11,
      noteSize: 12,
      titleLines: 2,
      noteLines: 1,
      showNotes: true,
    };
  }

  if (planCount <= 24) {
    return {
      columns: 3,
      maxVisibleItems: 18,
      gap: 9,
      cardHeight: 122,
      cardPadding: 12,
      checkboxSize: 26,
      categorySize: 10,
      taskTitleSize: Math.max(taskTitleSize - 5, 15),
      metaSize: 10,
      noteSize: 0,
      titleLines: 2,
      noteLines: 0,
      showNotes: false,
    };
  }

  return {
    columns: 3,
    maxVisibleItems: 18,
    gap: 8,
    cardHeight: 108,
    cardPadding: 10,
    checkboxSize: 22,
    categorySize: 9,
    taskTitleSize: Math.max(taskTitleSize - 7, 13),
    metaSize: 9,
    noteSize: 0,
    titleLines: 2,
    noteLines: 0,
    showNotes: false,
  };
}

function getTotalMinutes(plans: PlanItem[], key: "targetMinutes" | "actualMinutes"): number {
  return plans.reduce((total, item) => total + (item[key] ?? 0), 0);
}

function formatTotalMinutes(minutes: number): string {
  return minutes > 0 ? `${minutes} 分钟` : "未设置";
}

const primaryPinkStickerPool = [
  primaryRabbitSticker,
  primaryRainbowCloudSticker,
  primaryStrawberrySticker,
  primaryBookPencilSticker,
  primaryBearNoteSticker,
  primaryMagicWandSticker,
  primaryPencilCaseSticker,
  primaryCupcakeSticker,
  primaryMilkTeaSticker,
  primaryPaperPlaneSticker,
  primaryDeskLampSticker,
  primaryFlowerBouquetSticker,
  primaryAlarmClockSticker,
  primaryCameraSticker,
];

const generatedNonPrimaryStickers = {
  collegeBackpackHeadphones: new URL("./assets/export-stickers/generated-non-primary/college-backpack-headphones.png", import.meta.url).href,
  executiveChartBoard: new URL("./assets/export-stickers/generated-non-primary/executive-chart-board.png", import.meta.url).href,
  executiveCompassReports: new URL("./assets/export-stickers/generated-non-primary/executive-compass-reports.png", import.meta.url).href,
  homeGroceryApron: new URL("./assets/export-stickers/generated-non-primary/home-grocery-apron.png", import.meta.url).href,
  journalWashiBrush: new URL("./assets/export-stickers/generated-non-primary/journal-washi-brush.png", import.meta.url).href,
  minimalCalendarPaperclip: new URL("./assets/export-stickers/generated-non-primary/minimal-calendar-paperclip.png", import.meta.url).href,
  officeDashboardMug: new URL("./assets/export-stickers/generated-non-primary/office-dashboard-mug.png", import.meta.url).href,
  officeLaptopCoffee: new URL("./assets/export-stickers/generated-non-primary/office-laptop-coffee.png", import.meta.url).href,
  researchMicroscopeNotebook: new URL("./assets/export-stickers/generated-non-primary/research-microscope-notebook.png", import.meta.url).href,
  researchPaperMagnifier: new URL("./assets/export-stickers/generated-non-primary/research-paper-magnifier.png", import.meta.url).href,
  sharedChecklistClock: new URL("./assets/export-stickers/generated-non-primary/shared-checklist-clock.png", import.meta.url).href,
  sharedDeskLampNotes: new URL("./assets/export-stickers/generated-non-primary/shared-desk-lamp-notes.png", import.meta.url).href,
  sharedPlannerNotebook: new URL("./assets/export-stickers/generated-non-primary/shared-planner-notebook.png", import.meta.url).href,
  studyBooksCalculator: new URL("./assets/export-stickers/generated-non-primary/study-books-calculator.png", import.meta.url).href,
  studyTextbookHighlighter: new URL("./assets/export-stickers/generated-non-primary/study-textbook-highlighter.png", import.meta.url).href,
  teacherLessonApple: new URL("./assets/export-stickers/generated-non-primary/teacher-lesson-apple.png", import.meta.url).href,
};

const medicalGeneratedStickers = {
  anatomicalHeart: new URL("./assets/export-stickers/medical/medical-anatomical-heart.png", import.meta.url).href,
  bloodPressureCuff: new URL("./assets/export-stickers/medical/medical-blood-pressure-cuff.png", import.meta.url).href,
  book: new URL("./assets/export-stickers/medical/medical-book.png", import.meta.url).href,
  clipboardChecklist: new URL("./assets/export-stickers/medical/medical-clipboard-checklist.png", import.meta.url).href,
  dnaHelix: new URL("./assets/export-stickers/medical/medical-dna-helix.png", import.meta.url).href,
  doctorCoat: new URL("./assets/export-stickers/medical/medical-doctor-coat.png", import.meta.url).href,
  ecgMonitor: new URL("./assets/export-stickers/medical/medical-ecg-monitor.png", import.meta.url).href,
  firstAidKit: new URL("./assets/export-stickers/medical/medical-first-aid-kit.png", import.meta.url).href,
  hospitalBuilding: new URL("./assets/export-stickers/medical/medical-hospital-building.png", import.meta.url).href,
  ivDrip: new URL("./assets/export-stickers/medical/medical-iv-drip.png", import.meta.url).href,
  labReportMagnifier: new URL("./assets/export-stickers/medical/medical-lab-report-magnifier.png", import.meta.url).href,
  medicineBottlePills: new URL("./assets/export-stickers/medical/medical-medicine-bottle-pills.png", import.meta.url).href,
  microscopeSlides: new URL("./assets/export-stickers/medical/medical-microscope-slides.png", import.meta.url).href,
  stethoscope: new URL("./assets/export-stickers/medical/medical-stethoscope.png", import.meta.url).href,
  syringe: new URL("./assets/export-stickers/medical/medical-syringe.png", import.meta.url).href,
  testTubes: new URL("./assets/export-stickers/medical/medical-test-tubes.png", import.meta.url).href,
};

const medicalStickerPool = [
  medicalGeneratedStickers.stethoscope,
  medicalGeneratedStickers.clipboardChecklist,
  medicalGeneratedStickers.firstAidKit,
  medicalGeneratedStickers.microscopeSlides,
  medicalGeneratedStickers.syringe,
  medicalGeneratedStickers.medicineBottlePills,
  medicalGeneratedStickers.ecgMonitor,
  medicalGeneratedStickers.anatomicalHeart,
  medicalGeneratedStickers.testTubes,
  medicalGeneratedStickers.hospitalBuilding,
  medicalGeneratedStickers.bloodPressureCuff,
  medicalGeneratedStickers.doctorCoat,
  medicalGeneratedStickers.book,
  medicalGeneratedStickers.dnaHelix,
  medicalGeneratedStickers.ivDrip,
  medicalGeneratedStickers.labReportMagnifier,
];

const generatedSharedStickerPool = [
  generatedNonPrimaryStickers.sharedPlannerNotebook,
  generatedNonPrimaryStickers.sharedChecklistClock,
  generatedNonPrimaryStickers.sharedDeskLampNotes,
  generatedNonPrimaryStickers.minimalCalendarPaperclip,
];

const exportAudienceStickerPools: Record<string, string[]> = {
  小学生: primaryPinkStickerPool,
  "初中生/高中生": [
    generatedNonPrimaryStickers.studyTextbookHighlighter,
    generatedNonPrimaryStickers.studyBooksCalculator,
    generatedNonPrimaryStickers.sharedChecklistClock,
    generatedNonPrimaryStickers.sharedPlannerNotebook,
    generatedNonPrimaryStickers.sharedDeskLampNotes,
    generatedNonPrimaryStickers.minimalCalendarPaperclip,
  ],
  大学生: [
    generatedNonPrimaryStickers.collegeBackpackHeadphones,
    generatedNonPrimaryStickers.officeLaptopCoffee,
    generatedNonPrimaryStickers.studyTextbookHighlighter,
    generatedNonPrimaryStickers.sharedPlannerNotebook,
    generatedNonPrimaryStickers.minimalCalendarPaperclip,
    generatedNonPrimaryStickers.sharedChecklistClock,
  ],
  上班族: [
    generatedNonPrimaryStickers.officeLaptopCoffee,
    generatedNonPrimaryStickers.officeDashboardMug,
    generatedNonPrimaryStickers.sharedChecklistClock,
    generatedNonPrimaryStickers.sharedDeskLampNotes,
    generatedNonPrimaryStickers.executiveChartBoard,
    generatedNonPrimaryStickers.minimalCalendarPaperclip,
  ],
  教师: [
    generatedNonPrimaryStickers.teacherLessonApple,
    generatedNonPrimaryStickers.studyTextbookHighlighter,
    generatedNonPrimaryStickers.sharedChecklistClock,
    generatedNonPrimaryStickers.sharedPlannerNotebook,
    generatedNonPrimaryStickers.sharedDeskLampNotes,
    generatedNonPrimaryStickers.studyBooksCalculator,
  ],
  科研工作者: [
    generatedNonPrimaryStickers.researchMicroscopeNotebook,
    generatedNonPrimaryStickers.researchPaperMagnifier,
    generatedNonPrimaryStickers.executiveCompassReports,
    generatedNonPrimaryStickers.sharedDeskLampNotes,
    generatedNonPrimaryStickers.officeDashboardMug,
    generatedNonPrimaryStickers.minimalCalendarPaperclip,
  ],
  医学专业: medicalStickerPool,
  手账爱好者: [
    generatedNonPrimaryStickers.journalWashiBrush,
    generatedNonPrimaryStickers.sharedPlannerNotebook,
    generatedNonPrimaryStickers.minimalCalendarPaperclip,
    generatedNonPrimaryStickers.sharedDeskLampNotes,
    generatedNonPrimaryStickers.studyTextbookHighlighter,
    generatedNonPrimaryStickers.homeGroceryApron,
  ],
  团队管理: [
    generatedNonPrimaryStickers.executiveChartBoard,
    generatedNonPrimaryStickers.executiveCompassReports,
    generatedNonPrimaryStickers.officeDashboardMug,
    generatedNonPrimaryStickers.sharedChecklistClock,
    generatedNonPrimaryStickers.researchPaperMagnifier,
    generatedNonPrimaryStickers.officeLaptopCoffee,
  ],
  家庭生活: [
    generatedNonPrimaryStickers.homeGroceryApron,
    generatedNonPrimaryStickers.minimalCalendarPaperclip,
    generatedNonPrimaryStickers.sharedChecklistClock,
    generatedNonPrimaryStickers.sharedPlannerNotebook,
    generatedNonPrimaryStickers.sharedDeskLampNotes,
    generatedNonPrimaryStickers.journalWashiBrush,
  ],
  简约通用版: [
    ...generatedSharedStickerPool,
    generatedNonPrimaryStickers.officeLaptopCoffee,
    generatedNonPrimaryStickers.executiveCompassReports,
  ],
};

const PRIMARY_EXPORT_ENCOURAGEMENTS = [
  "今天也很棒，给自己一个大大的夸奖！",
  "慢慢来，每一步都在发光。",
  "完成一点点，也是很了不起的前进。",
  "你正在把今天变得更可爱。",
  "认真做计划的你，已经赢了一半。",
  "给努力的自己一朵小花。",
  "把小任务做好，就是大大的进步。",
  "今天的你，也值得被温柔鼓励。",
  "一点点坚持，会变成亮晶晶的成果。",
  "保持节奏，今天也会顺顺利利。",
  "你比想象中更有耐心。",
  "每完成一项，都离目标更近一点。",
  "把心放稳，事情会一件件完成。",
  "今天也请相信自己的小宇宙。",
  "认真生活的人会被好运看见。",
  "小小计划，也能带来大大成就感。",
  "别急，先完成眼前这一件。",
  "你的努力正在悄悄开花。",
  "今天的进步已经很珍贵。",
  "做完一项，就奖励自己一个微笑。",
  "把任务写下来，心里就更亮了。",
  "每个勾选，都是今天的小星星。",
  "你正在成为更会安排时间的自己。",
  "稳稳推进，就会有漂亮结果。",
  "今日份努力，已经开始闪闪发光。",
  "照顾好节奏，也照顾好心情。",
  "小步快走，也能走到很远。",
  "把今天过得清楚，就是很棒的能力。",
  "努力不用很响亮，认真就很好。",
  "先做一件，再做下一件。",
  "你已经在路上，这就很棒。",
  "愿今天的每个小目标都被点亮。",
  "给专注的自己一点掌声。",
  "今天继续加油，温柔又坚定。",
  "完成清单，也完成一份好心情。",
  "你的小坚持，正在变成大力量。",
  "计划清楚，心也会更轻松。",
  "今天也要为自己感到骄傲。",
  "把复杂的事拆小，就会容易很多。",
  "你可以慢一点，但一直在前进。",
  "认真完成的样子特别闪亮。",
  "愿今天的你收获满满成就感。",
  "每一项完成，都是送给自己的礼物。",
  "保持可爱的专注力，继续向前。",
  "今天也在悄悄变厉害。",
  "给自己一点时间，也给自己一点信心。",
  "把今天照顾好，就是最棒的计划。",
  "小任务不小，它们会组成大进步。",
  "你正在把想做的事变成做到的事。",
  "今天的努力，会在以后感谢你。",
  "先从最容易的一项开始吧。",
  "不慌不忙，也能漂亮完成。",
  "每一次开始，都值得被鼓励。",
  "你的认真，是今天最可爱的装饰。",
  "继续保持，星星会越来越多。",
  "把时间用在喜欢的进步上。",
  "做完一项，心里就多一份轻盈。",
  "你已经很棒了，再往前一点点。",
  "今天也把自己安排得明明白白。",
  "愿你的计划清单开出小花。",
  "一点点完成，一点点靠近理想。",
  "你值得拥有完成后的快乐。",
  "今天的你，有认真发光。",
  "把每个小目标都温柔放好。",
  "努力的痕迹，会变成漂亮的答案。",
  "清单在变短，成就感在变长。",
  "今天也请给自己多一点肯定。",
  "做事有条理，心情也会更晴朗。",
  "把要做的事一颗颗点亮。",
  "你正在练习更好的自己。",
  "今天的小小坚持非常珍贵。",
  "先行动起来，好状态会跟上来。",
  "每一个认真瞬间都算数。",
  "今天也要温柔地完成计划。",
  "你可以做到，而且会做得很好。",
  "让清单陪你把今天过得漂亮。",
  "慢慢完成，也是一种很棒的完成。",
  "给努力的自己贴一张小红花。",
  "今天的计划，会带你去更好的地方。",
  "每一步都很小，但每一步都重要。",
  "保持清醒，也保持可爱。",
  "愿今天的任务都乖乖完成。",
  "认真安排，就是对自己的温柔。",
  "你正在积累属于自己的厉害。",
  "把今天过成有成就感的一页。",
  "完成之后，记得好好夸夸自己。",
  "今天也向前走了一点点。",
  "你的努力有被今天看见。",
  "让每个小勾勾都变成好心情。",
  "稳住节奏，漂亮收尾。",
  "把计划写清楚，行动就更有力量。",
  "今天也是适合进步的一天。",
  "给自己一点鼓励，再继续出发。",
  "你正在用行动装饰今天。",
  "每完成一项，心里就亮一格。",
  "今天的自己，也很值得喜欢。",
  "坚持做完，会收获甜甜的满足感。",
  "把小事做好，就是很大的本领。",
  "今天也要带着好心情完成清单。",
  "一步一步来，今天会很漂亮。",
];

function getRandomPrimaryEncouragement() {
  const index = Math.floor(Math.random() * PRIMARY_EXPORT_ENCOURAGEMENTS.length);
  return PRIMARY_EXPORT_ENCOURAGEMENTS[index] ?? "今天也很棒，给自己一个大大的夸奖！";
}

function getStickerSeed(input: string): number {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

type ExportDailyWord = {
  word: string;
  meaning: string;
};

const EXPORT_DAILY_WORDS: ExportDailyWord[] = [
  { word: "sparkle", meaning: "闪耀；发光" },
  { word: "focus", meaning: "专注；集中" },
  { word: "brave", meaning: "勇敢的" },
  { word: "curious", meaning: "好奇的" },
  { word: "gentle", meaning: "温柔的" },
  { word: "bright", meaning: "明亮的；聪明的" },
  { word: "steady", meaning: "稳定的；踏实的" },
  { word: "progress", meaning: "进步；进展" },
  { word: "practice", meaning: "练习；实践" },
  { word: "patient", meaning: "有耐心的" },
  { word: "create", meaning: "创造；创作" },
  { word: "dream", meaning: "梦想；做梦" },
  { word: "wonder", meaning: "惊奇；想知道" },
  { word: "believe", meaning: "相信" },
  { word: "courage", meaning: "勇气" },
  { word: "joy", meaning: "快乐" },
  { word: "calm", meaning: "平静的；冷静的" },
  { word: "learn", meaning: "学习" },
  { word: "explore", meaning: "探索" },
  { word: "finish", meaning: "完成" },
  { word: "improve", meaning: "改进；提升" },
  { word: "kind", meaning: "友善的" },
  { word: "shine", meaning: "照耀；发亮" },
  { word: "hope", meaning: "希望" },
  { word: "energy", meaning: "能量；精力" },
  { word: "habit", meaning: "习惯" },
  { word: "plan", meaning: "计划" },
  { word: "review", meaning: "复习；回顾" },
  { word: "listen", meaning: "听；倾听" },
  { word: "remember", meaning: "记住" },
  { word: "discover", meaning: "发现" },
  { word: "balance", meaning: "平衡" },
  { word: "smile", meaning: "微笑" },
  { word: "grow", meaning: "成长；生长" },
  { word: "little", meaning: "小的；少量的" },
  { word: "daily", meaning: "每日的" },
  { word: "simple", meaning: "简单的" },
  { word: "strong", meaning: "强壮的；坚强的" },
  { word: "grateful", meaning: "感激的" },
  { word: "magic", meaning: "魔法；神奇的" },
  { word: "peace", meaning: "安宁；和平" },
  { word: "care", meaning: "关心；照顾" },
  { word: "share", meaning: "分享" },
  { word: "fresh", meaning: "新鲜的" },
  { word: "clever", meaning: "聪明的" },
  { word: "active", meaning: "积极的；活跃的" },
  { word: "tidy", meaning: "整洁的" },
  { word: "effort", meaning: "努力" },
  { word: "result", meaning: "结果；成果" },
  { word: "step", meaning: "步骤；一步" },
  { word: "goal", meaning: "目标" },
  { word: "task", meaning: "任务" },
  { word: "note", meaning: "便签；笔记" },
  { word: "story", meaning: "故事" },
  { word: "sunny", meaning: "晴朗的" },
  { word: "sweet", meaning: "甜美的" },
  { word: "lovely", meaning: "可爱的" },
  { word: "quiet", meaning: "安静的" },
  { word: "ready", meaning: "准备好的" },
  { word: "begin", meaning: "开始" },
  { word: "choose", meaning: "选择" },
  { word: "collect", meaning: "收集" },
  { word: "color", meaning: "颜色；给……上色" },
  { word: "draw", meaning: "画画" },
  { word: "read", meaning: "阅读" },
  { word: "write", meaning: "书写；写作" },
  { word: "count", meaning: "数数；计算" },
  { word: "think", meaning: "思考" },
  { word: "try", meaning: "尝试" },
  { word: "build", meaning: "建造；建立" },
  { word: "help", meaning: "帮助" },
  { word: "carry", meaning: "携带；坚持做" },
  { word: "clean", meaning: "清洁的；打扫" },
  { word: "happy", meaning: "开心的" },
  { word: "lucky", meaning: "幸运的" },
  { word: "soft", meaning: "柔软的" },
  { word: "warm", meaning: "温暖的" },
  { word: "wise", meaning: "明智的" },
  { word: "proud", meaning: "自豪的" },
  { word: "better", meaning: "更好的" },
  { word: "future", meaning: "未来" },
  { word: "friend", meaning: "朋友" },
  { word: "flower", meaning: "花" },
  { word: "rainbow", meaning: "彩虹" },
  { word: "star", meaning: "星星" },
  { word: "cloud", meaning: "云" },
  { word: "pencil", meaning: "铅笔" },
  { word: "journal", meaning: "日记；手账" },
  { word: "schedule", meaning: "日程；安排" },
  { word: "moment", meaning: "时刻；瞬间" },
  { word: "reward", meaning: "奖励" },
  { word: "promise", meaning: "承诺" },
  { word: "treasure", meaning: "珍宝；珍惜" },
  { word: "support", meaning: "支持" },
  { word: "healthy", meaning: "健康的" },
  { word: "cheer", meaning: "欢呼；鼓励" },
  { word: "mindful", meaning: "专注当下的" },
  { word: "possible", meaning: "可能的" },
  { word: "excellent", meaning: "优秀的" },
  { word: "prepare", meaning: "准备" },
  { word: "success", meaning: "成功" },
];

const EXPORT_DAILY_WORDS_BY_AUDIENCE: Record<string, ExportDailyWord[]> = {
  小学生: EXPORT_DAILY_WORDS,
  "初中生/高中生": [
    { word: "achieve", meaning: "实现；达到" },
    { word: "review", meaning: "复习；回顾" },
    { word: "method", meaning: "方法" },
    { word: "improve", meaning: "提升；改善" },
    { word: "important", meaning: "重要的" },
    { word: "knowledge", meaning: "知识" },
    { word: "exam", meaning: "考试" },
    { word: "score", meaning: "分数；得分" },
    { word: "mistake", meaning: "错误" },
    { word: "practice", meaning: "练习" },
    { word: "memory", meaning: "记忆" },
    { word: "effort", meaning: "努力" },
    { word: "result", meaning: "结果；成果" },
    { word: "prepare", meaning: "准备" },
    { word: "solution", meaning: "解决办法" },
    { word: "challenge", meaning: "挑战" },
    { word: "confidence", meaning: "信心" },
    { word: "progress", meaning: "进步" },
    { word: "efficient", meaning: "高效的" },
    { word: "strategy", meaning: "策略" },
  ],
  大学生: [
    { word: "campus", meaning: "校园" },
    { word: "semester", meaning: "学期" },
    { word: "assignment", meaning: "作业；任务" },
    { word: "lecture", meaning: "讲座；课程" },
    { word: "major", meaning: "专业" },
    { word: "credit", meaning: "学分" },
    { word: "research", meaning: "研究" },
    { word: "analysis", meaning: "分析" },
    { word: "argument", meaning: "论点" },
    { word: "evidence", meaning: "证据" },
    { word: "application", meaning: "申请；应用" },
    { word: "graduate", meaning: "毕业；研究生" },
    { word: "academic", meaning: "学术的" },
    { word: "discipline", meaning: "学科；自律" },
    { word: "perspective", meaning: "观点；视角" },
    { word: "concept", meaning: "概念" },
    { word: "priority", meaning: "优先事项" },
    { word: "deadline", meaning: "截止日期" },
    { word: "collaborate", meaning: "合作" },
    { word: "thesis", meaning: "论文" },
  ],
  上班族: [
    { word: "meeting", meaning: "会议" },
    { word: "agenda", meaning: "议程" },
    { word: "deadline", meaning: "截止日期" },
    { word: "report", meaning: "报告" },
    { word: "proposal", meaning: "提案；建议" },
    { word: "feedback", meaning: "反馈" },
    { word: "schedule", meaning: "日程；安排" },
    { word: "priority", meaning: "优先事项" },
    { word: "deliver", meaning: "交付" },
    { word: "client", meaning: "客户" },
    { word: "budget", meaning: "预算" },
    { word: "workflow", meaning: "工作流程" },
    { word: "update", meaning: "更新" },
    { word: "confirm", meaning: "确认" },
    { word: "coordinate", meaning: "协调" },
    { word: "efficient", meaning: "高效的" },
    { word: "brief", meaning: "简报；简要的" },
    { word: "follow-up", meaning: "后续跟进" },
    { word: "task", meaning: "任务" },
    { word: "progress", meaning: "进展" },
  ],
  教师: [
    { word: "lesson", meaning: "课程；一节课" },
    { word: "classroom", meaning: "教室；课堂" },
    { word: "student", meaning: "学生" },
    { word: "teaching", meaning: "教学" },
    { word: "curriculum", meaning: "课程体系" },
    { word: "assignment", meaning: "作业" },
    { word: "feedback", meaning: "反馈" },
    { word: "assessment", meaning: "评价；测评" },
    { word: "guidance", meaning: "指导" },
    { word: "explain", meaning: "解释" },
    { word: "encourage", meaning: "鼓励" },
    { word: "participate", meaning: "参与" },
    { word: "discussion", meaning: "讨论" },
    { word: "review", meaning: "复习；回顾" },
    { word: "behavior", meaning: "行为表现" },
    { word: "progress", meaning: "进步" },
    { word: "resource", meaning: "资源" },
    { word: "activity", meaning: "活动" },
    { word: "instruction", meaning: "教学指导" },
    { word: "support", meaning: "支持" },
  ],
  科研工作者: [
    { word: "hypothesis", meaning: "假设" },
    { word: "experiment", meaning: "实验" },
    { word: "variable", meaning: "变量" },
    { word: "methodology", meaning: "方法论" },
    { word: "dataset", meaning: "数据集" },
    { word: "analysis", meaning: "分析" },
    { word: "evidence", meaning: "证据" },
    { word: "manuscript", meaning: "手稿；论文稿" },
    { word: "abstract", meaning: "摘要" },
    { word: "citation", meaning: "引用" },
    { word: "peer review", meaning: "同行评审" },
    { word: "significant", meaning: "显著的；重要的" },
    { word: "limitation", meaning: "局限性" },
    { word: "conclusion", meaning: "结论" },
    { word: "replicate", meaning: "复现；复制" },
    { word: "framework", meaning: "框架" },
    { word: "literature", meaning: "文献" },
    { word: "revision", meaning: "修改；修订" },
    { word: "validity", meaning: "有效性" },
    { word: "publication", meaning: "发表；出版" },
  ],
  医学专业: [
    { word: "anatomy", meaning: "解剖学" },
    { word: "physiology", meaning: "生理学" },
    { word: "pathology", meaning: "病理学" },
    { word: "diagnosis", meaning: "诊断" },
    { word: "symptom", meaning: "症状" },
    { word: "patient", meaning: "患者" },
    { word: "treatment", meaning: "治疗" },
    { word: "therapy", meaning: "疗法" },
    { word: "infection", meaning: "感染" },
    { word: "inflammation", meaning: "炎症" },
    { word: "immunity", meaning: "免疫" },
    { word: "vaccine", meaning: "疫苗" },
    { word: "antibiotic", meaning: "抗生素" },
    { word: "dosage", meaning: "剂量" },
    { word: "prescription", meaning: "处方" },
    { word: "pulse", meaning: "脉搏" },
    { word: "fever", meaning: "发热" },
    { word: "cough", meaning: "咳嗽" },
    { word: "nausea", meaning: "恶心" },
    { word: "edema", meaning: "水肿" },
    { word: "artery", meaning: "动脉" },
    { word: "vein", meaning: "静脉" },
    { word: "nerve", meaning: "神经" },
    { word: "muscle", meaning: "肌肉" },
    { word: "fracture", meaning: "骨折" },
    { word: "wound", meaning: "伤口" },
    { word: "incision", meaning: "切口" },
    { word: "suture", meaning: "缝合" },
    { word: "sterile", meaning: "无菌的" },
    { word: "surgery", meaning: "手术" },
    { word: "anesthesia", meaning: "麻醉" },
    { word: "emergency", meaning: "急诊" },
    { word: "radiology", meaning: "影像学" },
    { word: "cardiology", meaning: "心脏病学" },
    { word: "neurology", meaning: "神经病学" },
    { word: "pediatrics", meaning: "儿科学" },
    { word: "oncology", meaning: "肿瘤学" },
    { word: "obstetrics", meaning: "产科学" },
    { word: "gynecology", meaning: "妇科学" },
    { word: "orthopedics", meaning: "骨科学" },
    { word: "specimen", meaning: "标本" },
    { word: "prognosis", meaning: "预后" },
    { word: "acute", meaning: "急性的" },
    { word: "chronic", meaning: "慢性的" },
    { word: "auscultation", meaning: "听诊" },
    { word: "palpation", meaning: "触诊" },
    { word: "percussion", meaning: "叩诊" },
    { word: "vital signs", meaning: "生命体征" },
    { word: "blood pressure", meaning: "血压" },
    { word: "heart rate", meaning: "心率" },
    { word: "respiratory rate", meaning: "呼吸频率" },
    { word: "body temperature", meaning: "体温" },
    { word: "medical history", meaning: "病史" },
    { word: "chief complaint", meaning: "主诉" },
    { word: "physical examination", meaning: "体格检查" },
    { word: "differential diagnosis", meaning: "鉴别诊断" },
    { word: "laboratory test", meaning: "实验室检查" },
    { word: "complete blood count", meaning: "血常规" },
    { word: "blood glucose", meaning: "血糖" },
    { word: "liver function", meaning: "肝功能" },
    { word: "renal function", meaning: "肾功能" },
    { word: "urinalysis", meaning: "尿液分析" },
    { word: "electrocardiogram", meaning: "心电图" },
    { word: "ultrasound", meaning: "超声检查" },
    { word: "computed tomography", meaning: "计算机断层扫描" },
    { word: "magnetic resonance imaging", meaning: "磁共振成像" },
    { word: "chest X-ray", meaning: "胸部X线片" },
    { word: "intravenous infusion", meaning: "静脉输液" },
    { word: "blood transfusion", meaning: "输血" },
    { word: "adverse reaction", meaning: "不良反应" },
    { word: "contraindication", meaning: "禁忌证" },
    { word: "side effect", meaning: "副作用" },
    { word: "informed consent", meaning: "知情同意" },
    { word: "aseptic technique", meaning: "无菌技术" },
    { word: "wound dressing", meaning: "伤口换药" },
    { word: "intensive care", meaning: "重症监护" },
    { word: "cardiac arrest", meaning: "心脏骤停" },
    { word: "myocardial infarction", meaning: "心肌梗死" },
    { word: "heart failure", meaning: "心力衰竭" },
    { word: "renal failure", meaning: "肾衰竭" },
    { word: "respiratory failure", meaning: "呼吸衰竭" },
    { word: "pulmonary embolism", meaning: "肺栓塞" },
    { word: "pneumonia", meaning: "肺炎" },
    { word: "diabetes mellitus", meaning: "糖尿病" },
    { word: "hypertension", meaning: "高血压" },
    { word: "hypotension", meaning: "低血压" },
    { word: "hypoglycemia", meaning: "低血糖" },
    { word: "hyperglycemia", meaning: "高血糖" },
    { word: "anemia", meaning: "贫血" },
    { word: "hemorrhage", meaning: "出血" },
    { word: "thrombosis", meaning: "血栓形成" },
    { word: "sepsis", meaning: "脓毒症" },
    { word: "shock", meaning: "休克" },
    { word: "malignant tumor", meaning: "恶性肿瘤" },
    { word: "benign tumor", meaning: "良性肿瘤" },
    { word: "biopsy", meaning: "活检" },
    { word: "catheter", meaning: "导管" },
    { word: "drainage", meaning: "引流" },
    { word: "injection", meaning: "注射" },
    { word: "rehabilitation", meaning: "康复" },
    { word: "triage", meaning: "分诊" },
    { word: "outpatient", meaning: "门诊患者" },
    { word: "inpatient", meaning: "住院患者" },
  ],
  手账爱好者: [
    { word: "journal", meaning: "手账；日记" },
    { word: "sticker", meaning: "贴纸" },
    { word: "layout", meaning: "版式" },
    { word: "palette", meaning: "配色" },
    { word: "decorate", meaning: "装饰" },
    { word: "memory", meaning: "记忆" },
    { word: "moment", meaning: "瞬间" },
    { word: "creative", meaning: "有创意的" },
    { word: "inspire", meaning: "启发" },
    { word: "habit", meaning: "习惯" },
    { word: "mood", meaning: "心情" },
    { word: "note", meaning: "便签；笔记" },
    { word: "page", meaning: "页面" },
    { word: "collage", meaning: "拼贴" },
    { word: "colorful", meaning: "多彩的" },
  ],
  团队管理: [
    { word: "leadership", meaning: "领导力" },
    { word: "strategy", meaning: "战略" },
    { word: "alignment", meaning: "协同；对齐" },
    { word: "decision", meaning: "决策" },
    { word: "execution", meaning: "执行" },
    { word: "priority", meaning: "优先事项" },
    { word: "stakeholder", meaning: "利益相关方" },
    { word: "delegate", meaning: "授权；委派" },
    { word: "negotiate", meaning: "谈判；协商" },
    { word: "vision", meaning: "愿景" },
    { word: "objective", meaning: "目标" },
    { word: "initiative", meaning: "举措" },
    { word: "accountability", meaning: "责任制" },
    { word: "communication", meaning: "沟通" },
    { word: "growth", meaning: "增长" },
    { word: "insight", meaning: "洞察" },
    { word: "roadmap", meaning: "路线图" },
    { word: "impact", meaning: "影响" },
  ],
  家庭生活: [
    { word: "home", meaning: "家" },
    { word: "family", meaning: "家庭" },
    { word: "grocery", meaning: "食品杂货" },
    { word: "clean", meaning: "打扫；清洁" },
    { word: "cook", meaning: "烹饪" },
    { word: "laundry", meaning: "洗衣" },
    { word: "budget", meaning: "预算" },
    { word: "organize", meaning: "整理；安排" },
    { word: "routine", meaning: "日常流程" },
    { word: "care", meaning: "照顾" },
    { word: "meal", meaning: "一餐" },
    { word: "garden", meaning: "花园" },
    { word: "comfort", meaning: "舒适" },
    { word: "balance", meaning: "平衡" },
    { word: "support", meaning: "支持" },
  ],
  简约通用版: [
    { word: "begin", meaning: "开始" },
    { word: "focus", meaning: "专注" },
    { word: "clear", meaning: "清楚的" },
    { word: "simple", meaning: "简单的" },
    { word: "steady", meaning: "稳定的" },
    { word: "plan", meaning: "计划" },
    { word: "task", meaning: "任务" },
    { word: "goal", meaning: "目标" },
    { word: "finish", meaning: "完成" },
    { word: "progress", meaning: "进步；进展" },
    { word: "habit", meaning: "习惯" },
    { word: "daily", meaning: "每日的" },
    { word: "useful", meaning: "有用的" },
    { word: "better", meaning: "更好的" },
    { word: "calm", meaning: "平静的" },
    { word: "energy", meaning: "精力" },
    { word: "result", meaning: "结果" },
    { word: "review", meaning: "回顾" },
  ],
};

function getExportDailyWord(selectedDate: string, template?: ExportTemplate) {
  const wordBank = template ? EXPORT_DAILY_WORDS_BY_AUDIENCE[template.audience] ?? EXPORT_DAILY_WORDS : EXPORT_DAILY_WORDS;
  const seedKey = !template || template.id === "primary-general-pastel" ? selectedDate : `${template.audience}-${template.id}-${selectedDate}`;
  const index = getStickerSeed(`daily-word-${seedKey}`) % wordBank.length;
  return wordBank[index] ?? EXPORT_DAILY_WORDS[0];
}

function getDailyWordVisualLength(text: string) {
  return Array.from(text).reduce((total, char) => total + (/^[\x00-\x7F]$/.test(char) ? 0.58 : 1), 0);
}

function getExportDailyWordFontSize(word: string, meaning: string, baseSize = 24) {
  const visualLength = getDailyWordVisualLength(word) + getDailyWordVisualLength(meaning);

  if (visualLength > 15) {
    return 15;
  }

  if (visualLength > 12) {
    return 16;
  }

  if (visualLength > 10) {
    return 18;
  }

  if (visualLength > 8) {
    return 20;
  }

  return baseSize;
}

function getMedicalDailyWordFontSize(word: string, meaning: string) {
  const visualLength = getDailyWordVisualLength(word) + getDailyWordVisualLength(meaning);

  if (visualLength > 24) {
    return 15;
  }

  if (visualLength > 20) {
    return 16;
  }

  if (visualLength > 16) {
    return 18;
  }

  if (visualLength > 12) {
    return 20;
  }

  return 22;
}

function getPrimaryPinkStickerSet(plans: PlanItem[], selectedDate: string, count = 6) {
  const seed = getStickerSeed(`${selectedDate}|${plans.map((item) => `${item.title}-${item.category}-${item.completed}`).join("|")}`);

  return primaryPinkStickerPool
    .map((src, index) => ({
      order: getStickerSeed(`${seed}-${index}`),
      src,
    }))
    .sort((a, b) => a.order - b.order)
    .slice(0, count)
    .map((item) => item.src);
}

function getExportAudienceStickerSet(template: ExportTemplate, plans: PlanItem[], selectedDate: string, count = 5) {
  const stickerPool = (exportAudienceStickerPools[template.audience] ?? exportAudienceStickerPools["简约通用版"] ?? primaryPinkStickerPool).filter(Boolean);
  const seed = getStickerSeed(`${template.id}|${selectedDate}|${plans.map((item) => `${item.title}-${item.completed}`).join("|")}`);
  const shuffledStickers = stickerPool
    .map((src, index) => ({
      order: getStickerSeed(`${seed}-${index}`),
      src,
    }))
    .sort((a, b) => a.order - b.order)
    .map((item) => item.src);

  if (shuffledStickers.length === 0) {
    return [];
  }

  return Array.from({ length: count }, (_, index) => shuffledStickers[index % shuffledStickers.length]);
}

function getGenericExportStickerBottomPadding(planCount: number) {
  if (planCount <= 2) {
    return 320;
  }

  if (planCount <= 4) {
    return 290;
  }

  if (planCount <= 6) {
    return 230;
  }

  if (planCount <= 10) {
    return 96;
  }

  return 56;
}

function getPrimaryPinkStickerBottomPadding(planCount: number) {
  if (planCount <= 2) {
    return 340;
  }

  if (planCount <= 4) {
    return 315;
  }

  if (planCount <= 6) {
    return 250;
  }

  if (planCount <= 10) {
    return 150;
  }

  return 96;
}

function getMedicalExportBoardStickers(template: ExportTemplate, plans: PlanItem[], selectedDate: string) {
  const planCount = plans.length;

  if (planCount <= 2) {
    const [stickerA, stickerB, stickerC, stickerD, stickerE] = getExportAudienceStickerSet(template, plans, selectedDate, 5);

    return [
      { src: stickerA, style: { bottom: "34px", left: "11%", opacity: 0.92, transform: "translateX(-50%) rotate(-6deg)", width: "172px" } },
      { src: stickerB, style: { bottom: "138px", left: "31%", opacity: 0.78, transform: "translateX(-50%) rotate(5deg)", width: "116px" } },
      { src: stickerC, style: { bottom: "30px", left: "50%", opacity: 0.92, transform: "translateX(-50%) rotate(-1deg)", width: "214px" } },
      { src: stickerD, style: { bottom: "140px", left: "69%", opacity: 0.78, transform: "translateX(-50%) rotate(-5deg)", width: "116px" } },
      { src: stickerE, style: { bottom: "34px", left: "89%", opacity: 0.92, transform: "translateX(-50%) rotate(6deg)", width: "172px" } },
    ];
  }

  if (planCount <= 4) {
    const [stickerA, stickerB, stickerC, stickerD, stickerE] = getExportAudienceStickerSet(template, plans, selectedDate, 5);

    return [
      { src: stickerA, style: { bottom: "36px", left: "13%", opacity: 0.86, transform: "translateX(-50%) rotate(-6deg)", width: "150px" } },
      { src: stickerB, style: { bottom: "144px", left: "32%", opacity: 0.68, transform: "translateX(-50%) rotate(5deg)", width: "92px" } },
      { src: stickerC, style: { bottom: "30px", left: "50%", opacity: 0.9, transform: "translateX(-50%) rotate(1deg)", width: "194px" } },
      { src: stickerD, style: { bottom: "144px", left: "68%", opacity: 0.68, transform: "translateX(-50%) rotate(-5deg)", width: "92px" } },
      { src: stickerE, style: { bottom: "36px", left: "87%", opacity: 0.86, transform: "translateX(-50%) rotate(6deg)", width: "150px" } },
    ];
  }

  if (planCount <= 6) {
    const [stickerA, stickerB, stickerC, stickerD, stickerE] = getExportAudienceStickerSet(template, plans, selectedDate, 5);

    return [
      { src: stickerA, style: { bottom: "34px", left: "11%", opacity: 0.78, transform: "translateX(-50%) rotate(-5deg)", width: "122px" } },
      { src: stickerB, style: { bottom: "114px", left: "31%", opacity: 0.62, transform: "translateX(-50%) rotate(5deg)", width: "74px" } },
      { src: stickerC, style: { bottom: "30px", left: "50%", opacity: 0.82, transform: "translateX(-50%) rotate(-1deg)", width: "156px" } },
      { src: stickerD, style: { bottom: "114px", left: "69%", opacity: 0.62, transform: "translateX(-50%) rotate(-5deg)", width: "74px" } },
      { src: stickerE, style: { bottom: "34px", left: "89%", opacity: 0.78, transform: "translateX(-50%) rotate(5deg)", width: "122px" } },
    ];
  }

  if (planCount <= 10) {
    const [stickerA, stickerB, stickerC] = getExportAudienceStickerSet(template, plans, selectedDate, 3);

    return [
      { src: stickerA, style: { bottom: "10px", left: "18%", opacity: 0.58, transform: "translateX(-50%) rotate(-5deg)", width: "74px" } },
      { src: stickerB, style: { bottom: "10px", left: "50%", opacity: 0.58, transform: "translateX(-50%) rotate(-1deg)", width: "82px" } },
      { src: stickerC, style: { bottom: "10px", left: "82%", opacity: 0.58, transform: "translateX(-50%) rotate(5deg)", width: "74px" } },
    ];
  }

  const [stickerA, stickerB, stickerC] = getExportAudienceStickerSet(template, plans, selectedDate, 3);

  return [
    { src: stickerA, style: { bottom: "8px", left: "22%", opacity: 0.38, transform: "translateX(-50%) rotate(-5deg)", width: "50px" } },
    { src: stickerB, style: { bottom: "8px", left: "50%", opacity: 0.38, transform: "translateX(-50%) rotate(-1deg)", width: "56px" } },
    { src: stickerC, style: { bottom: "8px", left: "78%", opacity: 0.38, transform: "translateX(-50%) rotate(5deg)", width: "50px" } },
  ];
}

function getGenericExportBoardStickers(template: ExportTemplate, plans: PlanItem[], selectedDate: string) {
  const planCount = plans.length;

  if (planCount <= 0) {
    return [];
  }

  if (template.id === "medical-study") {
    return getMedicalExportBoardStickers(template, plans, selectedDate);
  }

  if (planCount <= 2) {
    const [stickerA, stickerB, stickerC, stickerD, stickerE] = getExportAudienceStickerSet(template, plans, selectedDate, 5);

    return [
      { src: stickerA, style: { bottom: "34px", left: "12%", opacity: 0.88, transform: "translateX(-50%) rotate(-7deg)", width: "148px" } },
      { src: stickerB, style: { bottom: "90px", left: "31%", opacity: 0.76, transform: "translateX(-50%) rotate(5deg)", width: "112px" } },
      { src: stickerC, style: { bottom: "36px", left: "50%", opacity: 0.9, transform: "translateX(-50%) rotate(-1deg)", width: "174px" } },
      { src: stickerD, style: { bottom: "92px", left: "69%", opacity: 0.76, transform: "translateX(-50%) rotate(-5deg)", width: "112px" } },
      { src: stickerE, style: { bottom: "34px", left: "88%", opacity: 0.88, transform: "translateX(-50%) rotate(7deg)", width: "148px" } },
    ];
  }

  if (planCount <= 4) {
    const [stickerA, stickerB, stickerC, stickerD, stickerE] = getExportAudienceStickerSet(template, plans, selectedDate, 5);

    return [
      { src: stickerA, style: { bottom: "36px", left: "15%", opacity: 0.82, transform: "translateX(-50%) rotate(-7deg)", width: "128px" } },
      { src: stickerB, style: { bottom: "154px", left: "32%", opacity: 0.62, transform: "translateX(-50%) rotate(6deg)", width: "70px" } },
      { src: stickerC, style: { bottom: "32px", left: "50%", opacity: 0.86, transform: "translateX(-50%) rotate(1deg)", width: "172px" } },
      { src: stickerD, style: { bottom: "156px", left: "68%", opacity: 0.62, transform: "translateX(-50%) rotate(-6deg)", width: "70px" } },
      { src: stickerE, style: { bottom: "36px", left: "85%", opacity: 0.82, transform: "translateX(-50%) rotate(7deg)", width: "128px" } },
    ];
  }

  if (planCount <= 6) {
    const [stickerA, stickerB, stickerC] = getExportAudienceStickerSet(template, plans, selectedDate, 3);

    return [
      { src: stickerA, style: { bottom: "30px", left: "18%", opacity: 0.72, transform: "translateX(-50%) rotate(-6deg)", width: "104px" } },
      { src: stickerB, style: { bottom: "26px", left: "50%", opacity: 0.78, transform: "translateX(-50%) rotate(1deg)", width: "150px" } },
      { src: stickerC, style: { bottom: "30px", left: "82%", opacity: 0.72, transform: "translateX(-50%) rotate(6deg)", width: "104px" } },
    ];
  }

  if (planCount <= 10) {
    const [stickerA, stickerB, stickerC, stickerD, stickerE] = getExportAudienceStickerSet(template, plans, selectedDate, 5);

    return [
      { src: stickerA, style: { bottom: "12px", left: "18%", opacity: 0.52, transform: "translateX(-50%) rotate(-6deg)", width: "60px" } },
      { src: stickerB, style: { bottom: "12px", left: "50%", opacity: 0.52, transform: "translateX(-50%) rotate(-2deg)", width: "66px" } },
      { src: stickerC, style: { bottom: "12px", left: "82%", opacity: 0.52, transform: "translateX(-50%) rotate(6deg)", width: "60px" } },
      { src: stickerD, style: { bottom: "46px", left: "34%", opacity: 0.28, transform: "translateX(-50%) rotate(-5deg)", width: "34px" } },
      { src: stickerE, style: { bottom: "46px", left: "66%", opacity: 0.28, transform: "translateX(-50%) rotate(5deg)", width: "34px" } },
    ];
  }

  const [stickerA, stickerB, stickerC] = getExportAudienceStickerSet(template, plans, selectedDate, 3);

  return [
    { src: stickerA, style: { bottom: "10px", left: "144px", opacity: 0.34, transform: "rotate(-6deg)", width: "42px" } },
    { src: stickerB, style: { bottom: "10px", opacity: 0.34, right: "144px", transform: "rotate(6deg)", width: "42px" } },
    { src: stickerC, style: { bottom: "10px", left: "50%", opacity: 0.3, transform: "translateX(-50%) rotate(-2deg)", width: "48px" } },
  ];
}

function getPrimaryPinkPageStickers(plans: PlanItem[], selectedDate: string) {
  const planCount = plans.length;

  if (planCount <= 0) {
    return [];
  }

  if (planCount <= 2) {
    const [stickerA, stickerB, stickerC, stickerD, stickerE] = getPrimaryPinkStickerSet(plans, selectedDate, 5);

    return [
      {
        src: stickerA,
        style: { bottom: "162px", left: "96px", opacity: 0.86, transform: "rotate(-8deg)", width: "130px" },
      },
      {
        src: stickerB,
        style: { bottom: "274px", left: "286px", opacity: 0.72, transform: "rotate(6deg)", width: "82px" },
      },
      {
        src: stickerC,
        style: { bottom: "158px", left: "50%", opacity: 0.9, transform: "translateX(-50%) rotate(-1deg)", width: "166px" },
      },
      {
        src: stickerD,
        style: { bottom: "276px", opacity: 0.72, right: "286px", transform: "rotate(-6deg)", width: "82px" },
      },
      {
        src: stickerE,
        style: { bottom: "162px", opacity: 0.86, right: "96px", transform: "rotate(7deg)", width: "130px" },
      },
    ];
  }

  if (planCount <= 4) {
    const [stickerA, stickerB, stickerC, stickerD, stickerE] = getPrimaryPinkStickerSet(plans, selectedDate, 5);

    return [
      {
        src: stickerA,
        style: { bottom: "174px", left: "86px", opacity: 0.82, transform: "rotate(-8deg)", width: "112px" },
      },
      {
        src: stickerB,
        style: { bottom: "268px", left: "288px", opacity: 0.66, transform: "rotate(6deg)", width: "76px" },
      },
      {
        src: stickerC,
        style: { bottom: "162px", left: "50%", opacity: 0.86, transform: "translateX(-50%) rotate(-2deg)", width: "152px" },
      },
      {
        src: stickerD,
        style: { bottom: "270px", opacity: 0.66, right: "288px", transform: "rotate(-6deg)", width: "76px" },
      },
      {
        src: stickerE,
        style: { bottom: "174px", opacity: 0.82, right: "86px", transform: "rotate(8deg)", width: "112px" },
      },
    ];
  }

  if (planCount <= 6) {
    const [stickerA, stickerB, stickerC, stickerD] = getPrimaryPinkStickerSet(plans, selectedDate, 4);

    return [
      {
        src: stickerA,
        style: { bottom: "166px", left: "94px", opacity: 0.74, transform: "rotate(-8deg)", width: "92px" },
      },
      {
        src: stickerB,
        style: { bottom: "158px", left: "50%", opacity: 0.78, transform: "translateX(-50%) rotate(1deg)", width: "128px" },
      },
      {
        src: stickerC,
        style: { bottom: "166px", opacity: 0.74, right: "94px", transform: "rotate(8deg)", width: "92px" },
      },
      {
        src: stickerD,
        style: { bottom: "250px", left: "50%", opacity: 0.58, transform: "translateX(-50%) rotate(-5deg)", width: "68px" },
      },
    ];
  }

  if (planCount <= 10) {
    const [stickerA, stickerB, stickerC, stickerD, stickerE, stickerF] = getPrimaryPinkStickerSet(plans, selectedDate, 6);

    return [
      {
        src: stickerA,
        style: { bottom: "150px", left: "94px", opacity: 0.78, transform: "rotate(-8deg)", width: "86px" },
      },
      {
        src: stickerB,
        style: { bottom: "154px", opacity: 0.78, right: "118px", transform: "rotate(7deg)", width: "88px" },
      },
      {
        src: stickerC,
        style: { bottom: "154px", left: "306px", opacity: 0.72, transform: "rotate(-4deg)", width: "84px" },
      },
      {
        src: stickerD,
        style: { bottom: "158px", opacity: 0.72, right: "326px", transform: "rotate(4deg)", width: "82px" },
      },
      {
        src: stickerE,
        style: { bottom: "226px", left: "468px", opacity: 0.6, transform: "rotate(-3deg)", width: "56px" },
      },
      {
        src: stickerF,
        style: { bottom: "228px", opacity: 0.6, right: "82px", transform: "rotate(8deg)", width: "56px" },
      },
    ];
  }

  const [stickerA, stickerB, stickerC, stickerD, stickerE, stickerF] = getPrimaryPinkStickerSet(plans, selectedDate, 6);

  return [
    {
      src: stickerA,
      style: { bottom: "150px", left: "86px", opacity: 0.66, transform: "rotate(-8deg)", width: "64px" },
    },
    {
      src: stickerB,
      style: { bottom: "154px", opacity: 0.66, right: "92px", transform: "rotate(8deg)", width: "64px" },
    },
    {
      src: stickerC,
      style: { bottom: "160px", left: "318px", opacity: 0.58, transform: "rotate(-13deg)", width: "54px" },
    },
    {
      src: stickerD,
      style: { bottom: "160px", opacity: 0.58, right: "318px", transform: "rotate(2deg)", width: "54px" },
    },
    {
      src: stickerE,
      style: { bottom: "214px", left: "470px", opacity: 0.5, transform: "rotate(-3deg)", width: "46px" },
    },
    {
      src: stickerF,
      style: { bottom: "216px", opacity: 0.5, right: "70px", transform: "rotate(8deg)", width: "46px" },
    },
  ];
}

async function captureExportElement(element: HTMLElement): Promise<HTMLCanvasElement> {
  if ("fonts" in document) {
    await document.fonts.ready;
  }

  await waitForImages(element);

  return html2canvas(element, {
    backgroundColor: null,
    height: EXPORT_PAGE_HEIGHT,
    logging: false,
    scale: 2,
    useCORS: true,
    width: EXPORT_PAGE_WIDTH,
    windowHeight: EXPORT_PAGE_HEIGHT,
    windowWidth: EXPORT_PAGE_WIDTH,
  });
}

function hasPasswordRecoveryMarker(): boolean {
  const queryParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  return (
    queryParams.get("auth") === "recovery" ||
    queryParams.get("type") === "recovery" ||
    hashParams.get("type") === "recovery"
  );
}

function cleanAuthUrl() {
  window.history.replaceState({}, document.title, window.location.pathname);
}

function CardCompletionBurst({ feedback }: { feedback: CompletionFeedback }) {
  const variant = COMPLETION_VARIANTS[feedback.variantIndex] ?? COMPLETION_VARIANTS[0];

  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-4"
      data-export-ignore="true"
    >
      <motion.div
        key={feedback.id}
        className={`flex w-full max-w-[15rem] flex-col items-center gap-1.5 rounded-[1.25rem] border px-3 py-3 text-center font-black shadow-sticker backdrop-blur ${variant.accentClass} ${variant.ringClass}`}
        initial={{
          opacity: 0,
          x: variant.fromX,
          y: variant.fromY,
          scale: 0.78,
          rotate: variant.rotate,
        }}
        animate={{
          opacity: [0, 1, 1, 0],
          x: [variant.fromX, 0, 0, -variant.fromX / 2],
          y: [variant.fromY, 0, 0, -6],
          scale: [0.78, 1.05, 1, 0.96],
          rotate: [variant.rotate, -variant.rotate / 2, 0, variant.rotate / 2],
        }}
        exit={{ opacity: 0, scale: 0.92 }}
        transition={{ duration: 1.45, ease: "easeOut", times: [0, 0.18, 0.78, 1] }}
      >
        <span className="max-w-full break-words text-sm leading-5 sm:text-base">
          {feedback.title}
        </span>
        <span className={`max-w-full break-words text-xs font-bold leading-5 ${variant.detailClass}`}>
          {feedback.detail}
        </span>
        <span className="flex flex-wrap justify-center gap-1 text-base sm:text-lg">
          {variant.sparkles.map((sparkle, index) => (
            <motion.span
              aria-hidden="true"
              className="inline-block"
              key={`${sparkle}-${index}`}
              animate={{
                y: [0, index % 2 === 0 ? -9 : -6, 0],
                rotate: [0, index % 2 === 0 ? 14 : -12, 0],
                scale: [1, 1.16 + index * 0.02, 1],
              }}
              transition={{ duration: 0.75 + index * 0.03, delay: index * 0.05 }}
            >
              {sparkle}
            </motion.span>
          ))}
        </span>
      </motion.div>
    </div>
  );
}

type ExportJournalTemplateProps = {
  template: ExportTemplate;
  selectedDate: string;
  plans: PlanItem[];
  completedCount: number;
  progress: number;
  customCategories: CustomCategory[];
  encouragementText?: string;
};

function ExportPrimaryPinkTemplate({
  template,
  selectedDate,
  plans,
  completedCount,
  progress,
  encouragementText,
}: ExportJournalTemplateProps) {
  const planCount = plans.length;
  const columns = planCount <= 1 ? 1 : planCount > 10 ? 3 : 2;
  const maxVisibleItems = planCount > 10 ? 15 : 12;
  const displayPlans = plans.slice(0, maxVisibleItems);
  const overflowCount = Math.max(planCount - displayPlans.length, 0);
  const dateLabel = formatDisplayDate(selectedDate).replace("日星期", "日 星期");
  const denseTaskGrid = planCount > 8;
  const taskTitleSize = planCount <= 8 ? 34 : 30;
  const noteSize = planCount <= 4 ? 20 : planCount <= 8 ? 18 : 0;
  const showNotes = planCount <= 8;
  const cardMinHeight = planCount <= 2 ? 380 : planCount <= 4 ? 270 : planCount <= 6 ? 172 : planCount <= 8 ? 150 : 116;
  const taskTextIndent = 48;
  const taskCardPaddingTop = denseTaskGrid ? 26 : 36;
  const taskCardPaddingX = denseTaskGrid ? 18 : 22;
  const taskCardPaddingBottom = denseTaskGrid ? 16 : 22;
  const taskGridGap = denseTaskGrid ? "14px" : "18px";
  const primaryStickerBottomPadding = getPrimaryPinkStickerBottomPadding(planCount);
  const sectionRows = displayPlans.length <= 2 ? "auto" : displayPlans.length <= 4 ? "repeat(2, auto)" : undefined;
  const footerText = encouragementText ?? template.footer;
  const dailyWord = getExportDailyWord(selectedDate, template);
  const dailyWordFontSize = getExportDailyWordFontSize(dailyWord.word, dailyWord.meaning);

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #ffe9f3 0%, #fff5e8 48%, #fffafd 100%)",
        boxSizing: "border-box",
        color: "#3f3146",
        fontFamily: "'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', sans-serif",
        height: `${EXPORT_PAGE_HEIGHT}px`,
        overflow: "hidden",
        padding: "42px",
        width: `${EXPORT_PAGE_WIDTH}px`,
      }}
    >
      <div
        style={{
          background: `
            radial-gradient(circle at 7% 9%, rgba(255, 196, 220, 0.38) 0 72px, transparent 73px),
            radial-gradient(circle at 94% 11%, rgba(255, 232, 196, 0.55) 0 92px, transparent 93px),
            linear-gradient(180deg, #fffdf9 0%, #fff8fb 100%)
          `,
          border: "1px solid rgba(239, 155, 192, 0.38)",
          borderRadius: "38px",
          boxShadow: "0 26px 74px rgba(150, 85, 119, 0.16)",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          height: "100%",
          overflow: "hidden",
          padding: "38px 42px",
          position: "relative",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            background: "linear-gradient(90deg, rgba(255, 186, 212, 0.78), rgba(255, 244, 225, 0.86))",
            borderRadius: "999px",
            height: "22px",
            left: "68px",
            opacity: 0.78,
            position: "absolute",
            top: "28px",
            transform: "rotate(-3deg)",
            width: "172px",
            zIndex: 0,
          }}
        />
        <div
          aria-hidden="true"
          style={{
            alignItems: "center",
            background: "rgba(255, 255, 255, 0.72)",
            borderRadius: "28px",
            boxShadow: "0 14px 28px rgba(183, 111, 145, 0.1)",
            color: "#d94f8c",
            display: "flex",
            gap: "10px",
            justifyContent: "center",
            padding: "12px 18px",
            position: "absolute",
            right: "48px",
            top: "40px",
            transform: "rotate(3deg)",
            zIndex: 0,
          }}
        >
          <span style={{ fontSize: "28px", lineHeight: 1 }}>🎀</span>
          <span style={{ color: "#f0a84f", fontSize: "24px", lineHeight: 1 }}>⭐</span>
          <span style={{ color: "#e87cad", fontSize: "24px", lineHeight: 1 }}>♡</span>
        </div>
        <div
          aria-hidden="true"
          style={{
            background: "linear-gradient(180deg, rgba(255, 220, 234, 0.72), rgba(255, 250, 246, 0))",
            borderRadius: "999px",
            bottom: "120px",
            left: "30px",
            position: "absolute",
            top: "320px",
            width: "12px",
            zIndex: 0,
          }}
        />
        {getPrimaryPinkPageStickers(plans, selectedDate).map((sticker, stickerIndex) => (
          <img
            key={`primary-page-sticker-${stickerIndex}`}
            alt=""
            aria-hidden="true"
            decoding="sync"
            loading="eager"
            src={sticker.src}
            style={{
              filter: "drop-shadow(0 14px 20px rgba(166, 94, 130, 0.13))",
              pointerEvents: "none",
              position: "absolute",
              userSelect: "none",
              zIndex: 2,
              ...sticker.style,
            }}
          />
        ))}

	        <header
	          style={{
	            display: "grid",
	            gap: "24px",
	            gridTemplateColumns: "minmax(0, 1fr) 290px",
	            position: "relative",
	            zIndex: 1,
	          }}
	        >
          <div
            style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.96), rgba(255,236,245,0.88))",
	              borderRadius: "34px",
	              boxShadow: "0 18px 40px rgba(166, 94, 130, 0.12)",
	              boxSizing: "border-box",
              minHeight: "252px",
              padding: "34px 36px 32px",
	              position: "relative",
	            }}
	          >
            <div
              aria-hidden="true"
              style={{
                background: "linear-gradient(90deg, rgba(255, 189, 215, 0.82), rgba(255, 255, 255, 0.78))",
                borderRadius: "999px",
                height: "18px",
                position: "absolute",
                right: "34px",
                top: "24px",
                transform: "rotate(4deg)",
                width: "132px",
              }}
            />
            <div
              style={{
                color: "#db4f8e",
                fontSize: "58px",
                fontWeight: 900,
                letterSpacing: 0,
                lineHeight: 1.06,
                maxWidth: "100%",
                wordBreak: "break-word",
              }}
            >
              今日计划
            </div>
            <div
              style={{
                alignItems: "center",
                color: "#8f647c",
	                display: "flex",
	                flexWrap: "wrap",
                fontSize: "32px",
                fontWeight: 900,
                lineHeight: 1.35,
                marginTop: "30px",
	              }}
	            >
	              <span
	                style={{
	                  alignItems: "center",
	                  background: "rgba(255, 255, 255, 0.5)",
	                  borderRadius: "18px",
	                  display: "inline-flex",
	                  justifyContent: "center",
                  lineHeight: 1,
                  minHeight: "56px",
                  minWidth: "368px",
                  padding: "0 36px",
	                  textAlign: "center",
	                }}
	              >
	                <span
                    style={{
                      display: "inline-flex",
                      lineHeight: 1,
                      transform: "translateY(-13px)",
                    }}
                  >
                    {dateLabel}
                  </span>
	              </span>
	            </div>
	            <div
	              style={{
	                color: "#7f6074",
	                fontSize: "17px",
	                fontWeight: 800,
	                lineHeight: 1.5,
                marginTop: "22px",
	                maxWidth: "92%",
	                wordBreak: "break-word",
	              }}
            >
              {template.subtitle}
            </div>
          </div>

          <aside
            style={{
              background: "rgba(255, 255, 255, 0.92)",
              borderRadius: "30px",
              boxShadow: "0 18px 38px rgba(166, 94, 130, 0.1)",
              boxSizing: "border-box",
	              display: "flex",
	              flexDirection: "column",
	              gap: "12px",
              minHeight: "252px",
              padding: "24px 22px",
	            }}
	          >
            <div
              style={{
	                alignItems: "center",
	                color: "#d94f8c",
	                display: "flex",
	                fontSize: "18px",
	                fontWeight: 900,
	                justifyContent: "space-between",
	                lineHeight: 1.2,
              }}
            >
              <span>{template.sectionTitles.stats}</span>
              <span>{progress}%</span>
            </div>
            <div
              style={{
	                background: "#f8e7ef",
	                borderRadius: "999px",
	                height: "12px",
	                overflow: "hidden",
	              }}
            >
              <div
                style={{
                  background: "linear-gradient(90deg, #ef6aa5, #9d7be6)",
                  borderRadius: "999px",
                  height: "100%",
                  width: `${progress}%`,
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                flex: "1 1 auto",
                paddingTop: "8px",
              }}
            >
              <div
                style={{
                  background: "linear-gradient(135deg, rgba(255, 246, 251, 0.96), rgba(255, 232, 243, 0.88))",
                  borderRadius: "20px",
                  boxShadow: "inset 0 0 0 1px rgba(239, 159, 189, 0.16)",
                  boxSizing: "border-box",
                  display: "flex",
                  flex: "1 1 auto",
                  flexDirection: "column",
                  justifyContent: "center",
                  minHeight: "116px",
                  overflow: "visible",
                  padding: "16px",
                }}
              >
                <div
                  style={{
                    alignItems: "center",
                    color: "#d94f8c",
                    display: "flex",
                    fontSize: "18px",
                    fontWeight: 900,
                    gap: "8px",
                    justifyContent: "flex-start",
                    lineHeight: 1.2,
                  }}
                >
                  <span>每日单词</span>
                  <span
                    style={{
                      color: "#dca2bd",
                      fontSize: "14px",
                      fontWeight: 800,
                    }}
                  >
                    Word
                  </span>
                </div>
                <div
                  style={{
                    boxSizing: "border-box",
                    display: "flex",
                    flex: "1 1 auto",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: "5px",
                    justifyContent: "center",
                    marginTop: "8px",
                    minHeight: "48px",
                    overflow: "visible",
                    padding: "3px 0 7px",
                    whiteSpace: "nowrap",
                    width: "100%",
                  }}
                >
                  <div
                    style={{
                      color: "#473445",
                      flex: "0 0 auto",
                      fontSize: `${dailyWordFontSize}px`,
                      fontWeight: 950,
                      lineHeight: 1.55,
                      overflowWrap: "normal",
                      textAlign: "right",
                      whiteSpace: "nowrap",
                      wordBreak: "normal",
                    }}
                  >
                    {dailyWord.word}
                  </div>
                  <div
                    aria-hidden="true"
                    style={{
                      background: "#eaa1c3",
                      borderRadius: "999px",
                      flex: "0 0 4px",
                      height: "4px",
                      opacity: 0.78,
                      width: "4px",
                    }}
                  />
                  <div
                    style={{
                      color: "#8f647c",
                      flex: "0 0 auto",
                      fontSize: `${dailyWordFontSize}px`,
                      fontWeight: 900,
                      lineHeight: 1.55,
                      overflowWrap: "normal",
                      textAlign: "left",
                      whiteSpace: "nowrap",
                      wordBreak: "normal",
                    }}
                  >
                    {dailyWord.meaning}
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </header>

        <section
          style={{
            display: "flex",
            flex: "1 1 auto",
            flexDirection: "column",
            minHeight: 0,
            position: "relative",
            zIndex: 1,
          }}
        >
          <div
            style={{
              background: `
                linear-gradient(180deg, rgba(255,255,255,0.82), rgba(255,246,250,0.84)),
                repeating-linear-gradient(180deg, rgba(239, 159, 189, 0) 0 39px, rgba(239, 159, 189, 0.12) 40px 41px)
              `,
              borderRadius: "34px",
              boxShadow: "inset 0 0 0 1px rgba(239, 159, 189, 0.22), 0 18px 42px rgba(166, 94, 130, 0.08)",
              boxSizing: "border-box",
              flex: "1 1 auto",
              minHeight: 0,
              padding: columns === 3 ? `18px 18px ${primaryStickerBottomPadding}px` : `24px 24px ${primaryStickerBottomPadding}px`,
              position: "relative",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                background: "linear-gradient(90deg, rgba(255, 191, 216, 0.82), rgba(255,255,255,0.74))",
                borderRadius: "999px",
                height: "18px",
                left: "42px",
                position: "absolute",
                top: "-9px",
                transform: "rotate(-2deg)",
                width: "154px",
              }}
            />
            {displayPlans.length === 0 ? (
              <div
                style={{
                  alignItems: "center",
                  background: "rgba(255,255,255,0.82)",
                  borderRadius: "28px",
                  color: "#9f7188",
                  display: "flex",
                  fontSize: "30px",
                  fontWeight: 900,
                  height: "100%",
                  justifyContent: "center",
                  minHeight: "360px",
                  textAlign: "center",
                }}
              >
                今天还没有计划
              </div>
            ) : (
              <div
                style={{
                  alignContent: "start",
                  display: "grid",
                  gap: taskGridGap,
                  gridAutoRows: "auto",
                  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                  gridTemplateRows: sectionRows,
                  height: "100%",
                  minHeight: 0,
                }}
              >
                {displayPlans.map((item, index) => {
                  const cardAccent = item.completed ? "#72b893" : index % 2 === 0 ? "#e9659d" : "#a47be5";
                  const noteVisible = showNotes && item.note.trim();
                  const durationText = [
                    item.targetMinutes ? `目标 ${formatMinutes(item.targetMinutes)}` : "",
                    item.actualMinutes ? `实际 ${formatMinutes(item.actualMinutes)}` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ");

                  return (
                    <article
                      key={item.id}
	                      style={{
                        background: item.completed
                          ? "linear-gradient(135deg, rgba(255,255,255,0.92), rgba(231,248,238,0.92))"
                          : "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(255,248,251,0.94))",
                        borderRadius: columns === 3 ? "20px" : "26px",
                        boxShadow: "0 14px 30px rgba(154, 88, 123, 0.11)",
	                        boxSizing: "border-box",
	                        display: "flex",
	                        flexDirection: "column",
	                        isolation: "isolate",
	                        justifyContent: "flex-start",
	                        minHeight: `${cardMinHeight}px`,
	                        padding: `${taskCardPaddingTop}px ${taskCardPaddingX}px ${taskCardPaddingBottom}px`,
	                        position: "relative",
	                      }}
	                    >
	                      <div
	                        className="export-task-line"
	                        style={{
	                          color: item.completed ? "#806d7b" : "#3f3146",
	                          fontSize: `${taskTitleSize}px`,
	                          fontWeight: 800,
	                          lineHeight: 1.15,
	                          margin: 0,
	                          maxWidth: "100%",
	                          overflowWrap: "anywhere",
	                          padding: 0,
	                          paddingRight: columns === 3 ? 0 : "30px",
	                          position: "relative",
	                          wordBreak: "break-word",
	                          zIndex: 2,
	                        }}
	                      >
	                        <span
	                          aria-hidden="true"
	                          className="export-task-status"
	                          style={{
	                            color: item.completed ? cardAccent : "#d76c9d",
	                            display: "inline-block",
	                            fontWeight: 900,
	                            lineHeight: "inherit",
	                            marginRight: "12px",
	                            textAlign: "center",
	                            width: "36px",
	                          }}
	                        >
	                          {item.completed ? "☑" : "☐"}
	                        </span>
	                        <span
	                          className="export-task-text"
	                          style={{
	                            lineHeight: "inherit",
	                            margin: 0,
	                            padding: 0,
	                          }}
	                        >
	                          {item.title}
	                        </span>
                      </div>

                      {durationText ? (
                        <div
                          className="export-task-time-row"
                          style={{
                            color: "#987486",
                            fontSize: columns === 3 ? "16px" : "20px",
                            fontWeight: 800,
                            lineHeight: 1.35,
                            marginTop: "10px",
                            overflowWrap: "anywhere",
                            paddingLeft: columns === 3 ? 0 : `${taskTextIndent}px`,
                            position: "relative",
                            wordBreak: "break-word",
                            zIndex: 2,
                          }}
                        >
                          {durationText}
                        </div>
                      ) : null}

                      {noteVisible ? (
                        <div
                          style={{
                            color: "#8f6f82",
                            fontSize: `${noteSize}px`,
	                            fontWeight: 800,
	                            lineHeight: 1.45,
	                            marginTop: columns === 3 ? "12px" : "16px",
	                            overflowWrap: "anywhere",
	                            paddingLeft: columns === 3 ? 0 : `${taskTextIndent}px`,
	                            position: "relative",
	                            whiteSpace: "pre-wrap",
	                            wordBreak: "break-word",
	                            zIndex: 2,
                          }}
                        >
                          {item.note}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <footer
          style={{
            alignItems: "center",
            background: "linear-gradient(90deg, rgba(255,255,255,0.92), rgba(255,232,242,0.9))",
            borderRadius: "28px",
            boxShadow: "0 16px 34px rgba(166, 94, 130, 0.1)",
            color: "#3f3146",
            display: "flex",
            justifyContent: "center",
            minHeight: "86px",
            padding: "16px 58px",
            position: "relative",
            zIndex: 3,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              color: "#ef8fb9",
              fontSize: "24px",
              left: "28px",
              lineHeight: 1,
              position: "absolute",
              top: "18px",
            }}
          >
            ✦
          </span>
          <span
            aria-hidden="true"
            style={{
              color: "#e9659d",
              fontSize: "22px",
              lineHeight: 1,
              position: "absolute",
              right: "30px",
              top: "18px",
            }}
          >
            ♡
          </span>
          <div
            style={{
              fontSize: "27px",
              fontWeight: 950,
              lineHeight: 1.38,
              overflowWrap: "anywhere",
              textAlign: "center",
              wordBreak: "break-word",
            }}
          >
            {overflowCount > 0 ? `${footerText}（另有 ${overflowCount} 项未显示）` : footerText}
          </div>
        </footer>
      </div>
    </div>
  );
}

function ExportJournalTemplate(props: ExportJournalTemplateProps) {
  if (props.template.id === "primary-general-pastel") {
    return <ExportPrimaryPinkTemplate {...props} />;
  }

  const {
    template,
    selectedDate,
    plans,
    progress,
    encouragementText,
  } = props;
  const density = getExportDensity(plans.length, template);
  const displayPlans = plans.slice(0, density.maxVisibleItems);
  const overflowCount = Math.max(plans.length - displayPlans.length, 0);
  const dateLabel = formatDisplayDate(selectedDate).replace("日星期", "日 星期");
  const footerText = encouragementText ?? template.footer;
  const dailyWord = getExportDailyWord(selectedDate, template);
  const isMedicalTemplate = template.id === "medical-study";
  const dailyWordFontSize = isMedicalTemplate
    ? getMedicalDailyWordFontSize(dailyWord.word, dailyWord.meaning)
    : getExportDailyWordFontSize(dailyWord.word, dailyWord.meaning);
  const stickerBottomPadding = getGenericExportStickerBottomPadding(plans.length);
  const isPlayful = template.layout === "cute" || template.layout === "journal" || template.layout === "home";
  const headerAsideWidth = isMedicalTemplate ? "396px" : "318px";
  const headerMinHeight = isMedicalTemplate ? "282px" : "252px";
  const borderWidth = template.cardBorderStyle === "double" ? "4px" : "2px";
  const cardBorderStyle = template.cardBorderStyle === "double" ? "double" : "solid";
  const decorativeBorder = `${borderWidth} ${cardBorderStyle}`;
  const primarySticker = template.decorations[0] ?? "✦";
  const secondarySticker = template.decorations[1] ?? "⭐";
  const thirdSticker = template.decorations[2] ?? "♡";
  const fourthSticker = template.decorations[3] ?? "✿";

  return (
    <div
      style={{
        background: template.background,
        boxSizing: "border-box",
        color: template.ink,
        fontFamily: "'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', sans-serif",
        height: `${EXPORT_PAGE_HEIGHT}px`,
        overflow: "hidden",
        padding: "42px",
        width: `${EXPORT_PAGE_WIDTH}px`,
      }}
    >
      <div
        style={{
          background: `
            radial-gradient(circle at 7% 8%, ${template.accentSoft} 0 18px, transparent 19px),
            radial-gradient(circle at 94% 12%, ${template.accentSoft} 0 16px, transparent 17px),
            radial-gradient(circle at 9% 92%, ${template.accentSoft} 0 14px, transparent 15px),
            ${template.paper}
          `,
          border: `4px ${isPlayful ? "dashed" : "solid"} ${template.border}`,
          borderRadius: isPlayful ? "40px" : "26px",
          boxSizing: "border-box",
          boxShadow: "0 24px 70px rgba(74, 52, 84, 0.14)",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
          height: "100%",
          overflow: "hidden",
          padding: "38px 42px",
          position: "relative",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            background: `linear-gradient(90deg, ${template.accentSoft}, rgba(255,255,255,0.62))`,
            border: `1px solid ${template.border}`,
            borderRadius: "999px",
            height: "24px",
            left: "72px",
            opacity: 0.72,
            pointerEvents: "none",
            position: "absolute",
            top: "30px",
            transform: "rotate(-3deg)",
            width: "138px",
            zIndex: 0,
          }}
        />
        <div
          aria-hidden="true"
          style={{
            background: `linear-gradient(90deg, rgba(255,255,255,0.65), ${template.accentSoft})`,
            border: `1px solid ${template.border}`,
            borderRadius: "999px",
            height: "18px",
            left: "128px",
            opacity: 0.58,
            pointerEvents: "none",
            position: "absolute",
            top: "56px",
            transform: "rotate(4deg)",
            width: "92px",
            zIndex: 0,
          }}
        />
        <div
          aria-hidden="true"
          style={{
            alignItems: "center",
            background: "rgba(255, 255, 255, 0.68)",
            border: `2px solid ${template.accentSoft}`,
            borderRadius: "26px",
            boxShadow: "0 12px 26px rgba(118, 77, 104, 0.1)",
            color: template.accent,
            display: "flex",
            gap: "10px",
            height: "62px",
            justifyContent: "center",
            opacity: 0.64,
            pointerEvents: "none",
            position: "absolute",
            right: "62px",
            top: "34px",
            transform: "rotate(3deg)",
            width: "142px",
            zIndex: 0,
          }}
        >
          <span style={{ fontSize: "30px", lineHeight: 1 }}>{primarySticker}</span>
          <span style={{ color: template.accent2, fontSize: "24px", lineHeight: 1 }}>{secondarySticker}</span>
          <span style={{ fontSize: "26px", lineHeight: 1 }}>{thirdSticker}</span>
        </div>
        <div
          aria-hidden="true"
          style={{
            background: `linear-gradient(180deg, ${template.accentSoft}, rgba(255,255,255,0.2))`,
            borderRadius: "999px",
            bottom: "106px",
            left: "36px",
            opacity: 0.48,
            pointerEvents: "none",
            position: "absolute",
            top: "302px",
            width: "14px",
            zIndex: 0,
          }}
        />
        <div
          aria-hidden="true"
          style={{
            alignItems: "center",
            background: "rgba(255, 255, 255, 0.66)",
            border: `2px solid ${template.accentSoft}`,
            borderRadius: "28px",
            bottom: "118px",
            color: template.accent,
            display: "flex",
            fontSize: "34px",
            gap: "8px",
            height: "64px",
            justifyContent: "center",
            opacity: 0.58,
            pointerEvents: "none",
            position: "absolute",
            right: "42px",
            transform: "rotate(-4deg)",
            width: "118px",
            zIndex: 0,
          }}
        >
          <span style={{ lineHeight: 1 }}>{fourthSticker}</span>
          <span style={{ color: template.accent2, fontSize: "26px", lineHeight: 1 }}>{thirdSticker}</span>
        </div>

        <header
          style={{
            display: "grid",
            gap: "24px",
            gridTemplateColumns: `minmax(0, 1fr) ${headerAsideWidth}`,
            position: "relative",
            zIndex: 1,
          }}
        >
          <div
            style={{
              background: `linear-gradient(135deg, rgba(255,255,255,0.92), ${template.accentSoft})`,
              border: `2px solid ${template.border}`,
              borderRadius: isPlayful ? "30px" : "20px",
              boxSizing: "border-box",
              boxShadow: "0 14px 34px rgba(116, 74, 103, 0.1)",
              minHeight: headerMinHeight,
              padding: "28px 28px 24px",
              position: "relative",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                background: `linear-gradient(90deg, ${template.accentSoft}, rgba(255,255,255,0.74))`,
                border: `1px solid ${template.border}`,
                borderRadius: "999px",
                height: "18px",
                opacity: 0.78,
                position: "absolute",
                right: "26px",
                top: "20px",
                transform: "rotate(6deg)",
                width: "118px",
              }}
            />
            <div
              style={{
                color: template.accent,
                fontSize: `${template.titleSize}px`,
                fontWeight: 900,
                letterSpacing: 0,
                lineHeight: 1,
                maxWidth: "100%",
                wordBreak: "break-word",
              }}
            >
              今日计划
            </div>
            <div
              style={{
                alignItems: "center",
                background: "rgba(255, 255, 255, 0.78)",
                border: `2px solid ${template.accentSoft}`,
                borderRadius: "999px",
                boxSizing: "border-box",
                color: template.ink,
                display: "inline-flex",
                fontSize: `${template.dateSize}px`,
                fontWeight: 900,
                height: "68px",
                justifyContent: "center",
                lineHeight: 1,
                marginTop: "24px",
                minWidth: "284px",
                padding: "0 34px",
                textAlign: "center",
                verticalAlign: "top",
                whiteSpace: "nowrap",
              }}
            >
              <span
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  lineHeight: 1,
                  transform: "translateY(-14px)",
                }}
              >
                {dateLabel}
              </span>
            </div>
            <div
              style={{
                color: template.muted,
                fontSize: "17px",
                fontWeight: 800,
                lineHeight: 1.45,
                marginTop: "16px",
                wordBreak: "break-word",
              }}
            >
              {template.subtitle}
            </div>
          </div>

          <aside
            style={{
              background: template.card,
              border: `2px solid ${template.accentSoft}`,
              borderRadius: isPlayful ? "28px" : "18px",
              boxSizing: "border-box",
              boxShadow: "0 14px 34px rgba(116, 74, 103, 0.08)",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              minHeight: headerMinHeight,
              padding: isMedicalTemplate ? "22px 22px" : "24px 22px",
            }}
          >
            <div
              style={{
                alignItems: "center",
                color: template.accent,
                display: "flex",
                fontSize: "18px",
                fontWeight: 900,
                justifyContent: "space-between",
                lineHeight: 1.2,
              }}
            >
              <span>{template.sectionTitles.stats}</span>
              <span>{progress}%</span>
            </div>
            <div
              style={{
                background: "#ffffff",
                border: `1px solid ${template.accentSoft}`,
                borderRadius: "999px",
                height: "12px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  background: `linear-gradient(90deg, ${template.accent}, ${template.accent2})`,
                  borderRadius: "999px",
                  height: "100%",
                  width: `${progress}%`,
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                flex: "1 1 auto",
                flexDirection: "column",
                paddingTop: "8px",
              }}
            >
              <div
                style={{
                  background: `linear-gradient(135deg, ${template.accentSoft}, rgba(255,255,255,0.8))`,
                  borderRadius: isPlayful ? "20px" : "14px",
                  boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.48)`,
                  boxSizing: "border-box",
                  display: "flex",
                  flex: "1 1 auto",
                  flexDirection: "column",
                  justifyContent: "center",
                  minHeight: isMedicalTemplate ? "172px" : "132px",
                  overflow: "visible",
                  padding: isMedicalTemplate ? "18px 20px 20px" : "16px 16px 18px",
                }}
              >
                <div
                  style={{
                    alignItems: "center",
                    color: template.accent,
                    display: "flex",
                    fontSize: "18px",
                    fontWeight: 900,
                    gap: "8px",
                    justifyContent: "center",
                    lineHeight: 1.2,
                  }}
                >
                  <span>{isMedicalTemplate ? "医学英语" : "每日单词"}</span>
                  <span
                    style={{
                      color: template.muted,
                      fontSize: "14px",
                      fontWeight: 800,
                      opacity: 0.72,
                    }}
                  >
                    Word
                  </span>
                </div>
                <div
                  style={{
                    alignItems: "center",
                    boxSizing: "border-box",
                    color: template.ink,
                    display: "flex",
                    flexDirection: isMedicalTemplate ? "column" : "row",
                    gap: isMedicalTemplate ? "4px" : "6px",
                    justifyContent: "center",
                    marginTop: isMedicalTemplate ? "10px" : "8px",
                    minHeight: isMedicalTemplate ? "104px" : "50px",
                    overflow: "visible",
                    padding: isMedicalTemplate ? "2px 0 4px" : "3px 0 7px",
                    textAlign: "center",
                    whiteSpace: isMedicalTemplate ? "normal" : "nowrap",
                    width: "100%",
                  }}
                >
                  <div
                    style={{
                      color: template.ink,
                      flex: "0 0 auto",
                      fontSize: `${dailyWordFontSize}px`,
                      fontWeight: 950,
                      lineHeight: isMedicalTemplate ? 1.22 : 1.55,
                      maxWidth: "100%",
                      overflowWrap: isMedicalTemplate ? "break-word" : "normal",
                      textAlign: isMedicalTemplate ? "center" : "right",
                      whiteSpace: isMedicalTemplate ? "normal" : "nowrap",
                      wordBreak: "normal",
                    }}
                  >
                    {dailyWord.word}
                  </div>
                  <div
                    aria-hidden="true"
                    style={{
                      background: isMedicalTemplate ? template.accent2 : template.accent,
                      borderRadius: "999px",
                      display: isMedicalTemplate ? "none" : "block",
                      flex: isMedicalTemplate ? "0 0 3px" : "0 0 4px",
                      height: isMedicalTemplate ? "3px" : "4px",
                      opacity: isMedicalTemplate ? 0.82 : 0.6,
                      width: isMedicalTemplate ? "42px" : "4px",
                    }}
                  />
                  <div
                    style={{
                      color: template.muted,
                      flex: "0 0 auto",
                      fontSize: `${isMedicalTemplate ? Math.max(dailyWordFontSize - 1, 14) : dailyWordFontSize}px`,
                      fontWeight: 900,
                      lineHeight: isMedicalTemplate ? 1.32 : 1.55,
                      maxWidth: "100%",
                      overflowWrap: isMedicalTemplate ? "break-word" : "normal",
                      textAlign: isMedicalTemplate ? "center" : "left",
                      whiteSpace: isMedicalTemplate ? "normal" : "nowrap",
                      wordBreak: "normal",
                    }}
                  >
                    {dailyWord.meaning}
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </header>

        <section
          style={{
            display: "flex",
            flex: "1 1 auto",
            flexDirection: "column",
            minHeight: 0,
            position: "relative",
            zIndex: 1,
          }}
        >
          <div
            style={{
              alignItems: "center",
              display: "flex",
              justifyContent: "flex-end",
              marginBottom: overflowCount > 0 ? "10px" : "0",
            }}
          >
            {overflowCount > 0 ? (
              <div
                style={{
                  color: template.muted,
                  background: "rgba(255, 255, 255, 0.72)",
                  border: `1px solid ${template.accentSoft}`,
                  borderRadius: "999px",
                  display: "inline-flex",
                  fontSize: "12px",
                  fontWeight: 900,
                  justifyContent: "center",
                  minHeight: "30px",
                  padding: "0 12px",
                  alignItems: "center",
                }}
              >
                另有 {overflowCount} 项未显示，建议后续分多页导出
              </div>
            ) : null}
          </div>

          <div
            style={{
              background: `
                linear-gradient(180deg, rgba(255,255,255,0.78), rgba(255,255,255,0.62)),
                repeating-linear-gradient(180deg, transparent 0 40px, ${template.accentSoft} 41px 42px)
              `,
              border: `2px solid ${template.accentSoft}`,
              borderRadius: isPlayful ? "30px" : "18px",
              boxShadow: "inset 0 0 0 6px rgba(255,255,255,0.38), 0 18px 40px rgba(116, 74, 103, 0.08)",
              boxSizing: "border-box",
              flex: "1 1 auto",
              minHeight: displayPlans.length <= 4 ? "540px" : "0",
              overflow: "hidden",
              padding: density.columns === 3 ? `14px 14px ${stickerBottomPadding}px` : `20px 20px ${stickerBottomPadding}px`,
              position: "relative",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                background: `linear-gradient(90deg, ${template.accentSoft}, rgba(255,255,255,0.65), ${template.accentSoft})`,
                border: `1px solid ${template.border}`,
                borderRadius: "999px",
                height: "20px",
                left: "34px",
                opacity: 0.76,
                position: "absolute",
                top: "-11px",
                transform: "rotate(-2deg)",
                width: "156px",
              }}
            />
            <div
              aria-hidden="true"
              style={{
                background: `linear-gradient(90deg, rgba(255,255,255,0.62), ${template.accentSoft})`,
                border: `1px solid ${template.border}`,
                borderRadius: "999px",
                height: "16px",
                opacity: 0.62,
                position: "absolute",
                right: "42px",
                top: "-8px",
                transform: "rotate(2deg)",
                width: "112px",
              }}
            />
            {getGenericExportBoardStickers(template, plans, selectedDate).map((sticker, stickerIndex) => (
              <img
                key={`${template.id}-board-sticker-${stickerIndex}`}
                alt=""
                aria-hidden="true"
                decoding="sync"
                loading="eager"
                src={sticker.src}
                style={{
                  filter: "drop-shadow(0 12px 18px rgba(74, 52, 84, 0.12))",
                  pointerEvents: "none",
                  position: "absolute",
                  userSelect: "none",
                  zIndex: 2,
                  ...sticker.style,
                }}
              />
            ))}
            {displayPlans.length === 0 ? (
              <div
                style={{
                  alignItems: "center",
                  background: template.card,
                  border: `${decorativeBorder} ${template.border}`,
                  borderRadius: "26px",
                  color: template.muted,
                  display: "flex",
                  fontSize: "30px",
                  fontWeight: 900,
                  justifyContent: "center",
                  minHeight: "220px",
                  position: "relative",
                  textAlign: "center",
                  zIndex: 1,
                }}
              >
                今天还没有计划
              </div>
            ) : (
            <div
              style={{
                alignContent: "start",
                display: "grid",
                gap: `${density.gap}px`,
                gridAutoRows: "auto",
                gridTemplateColumns: `repeat(${density.columns}, minmax(0, 1fr))`,
                minHeight: 0,
                position: "relative",
                zIndex: 1,
              }}
            >
              {displayPlans.map((item, index) => {
                const noteVisible = density.showNotes && item.note.trim();
                const cardAccent = index % 2 === 0 ? template.accent : template.accent2;
                const durationText = [
                  item.targetMinutes ? `目标 ${formatMinutes(item.targetMinutes)}` : "",
                  item.actualMinutes ? `实际 ${formatMinutes(item.actualMinutes)}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ");

                return (
	                    <article
	                      key={item.id}
	                      style={{
	                        background: item.completed
	                        ? `linear-gradient(135deg, rgba(255,255,255,0.94), ${template.accentSoft})`
	                        : "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(255,255,255,0.94))",
	                      border: `2px solid ${item.completed ? template.accentSoft : template.border}`,
	                      borderRadius: isPlayful ? "24px" : "15px",
	                      boxSizing: "border-box",
	                      boxShadow: item.completed
	                        ? "0 10px 24px rgba(116, 74, 103, 0.08)"
	                        : "0 14px 30px rgba(116, 74, 103, 0.12)",
	                      display: "flex",
	                      flexDirection: "column",
	                      gap: density.columns === 3 ? "8px" : "10px",
	                      justifyContent: "flex-start",
	                      minHeight: `${density.cardHeight}px`,
	                      padding: `${density.cardPadding}px`,
                      position: "relative",
	                    }}
	                  >
	                    <div
	                      aria-hidden="true"
	                      style={{
	                        background: `linear-gradient(90deg, ${template.accentSoft}, rgba(255,255,255,0.72), ${template.accentSoft})`,
	                        border: `1px solid ${template.border}`,
	                        borderRadius: "999px",
	                        display: "none",
	                        height: "16px",
	                        left: "26px",
	                        opacity: 0.76,
	                        position: "absolute",
	                        top: "-8px",
	                        transform: index % 2 === 0 ? "rotate(-2deg)" : "rotate(2deg)",
	                        width: "92px",
	                        zIndex: 0,
	                      }}
	                    />
	                    <div
	                      aria-hidden="true"
	                      style={{
	                        alignItems: "center",
	                        background: "rgba(255, 255, 255, 0.68)",
	                        border: `1px solid ${template.accentSoft}`,
	                        borderRadius: density.columns === 3 ? "12px" : "16px",
	                        color: cardAccent,
	                        display: "none",
	                        fontSize: "22px",
	                        height: "38px",
	                        justifyContent: "center",
	                        lineHeight: 1,
	                        opacity: 0.58,
	                        position: "absolute",
	                        right: "14px",
	                        top: "14px",
	                        width: "38px",
	                      }}
	                    >
	                      {template.decorations[(index + 1) % template.decorations.length]}
                    </div>

                    <div
                      style={{
                        alignItems: "center",
                        background: item.completed ? cardAccent : "#ffffff",
                        border: `3px solid ${item.completed ? cardAccent : template.checkbox}`,
                        borderRadius: isPlayful ? "9px" : "6px",
                        color: "#ffffff",
                        display: "none",
                        fontSize: `${Math.max(density.checkboxSize - 10, 12)}px`,
                        fontWeight: 900,
                        height: `${density.checkboxSize}px`,
                        justifyContent: "center",
                        lineHeight: 1,
                        position: "relative",
                        width: `${density.checkboxSize}px`,
                        zIndex: 1,
                      }}
                    >
                      {item.completed ? "✓" : ""}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        minHeight: 0,
                        minWidth: 0,
                        position: "relative",
                        zIndex: 1,
                      }}
                    >
                      <div
                        style={{
                          alignItems: "baseline",
                          color: item.completed ? template.muted : template.ink,
                          display: "flex",
                          gap: "12px",
                          fontSize: `${density.taskTitleSize}px`,
                          fontWeight: 900,
                          lineHeight: 1.24,
                          marginBottom: "4px",
                          overflowWrap: "anywhere",
                          wordBreak: "break-word",
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            color: item.completed ? cardAccent : template.checkbox,
                            flex: "0 0 auto",
                            fontWeight: 950,
                            lineHeight: "inherit",
                          }}
                        >
                          {item.completed ? "☑" : "☐"}
                        </span>
                        <span
                          style={{
                            lineHeight: "inherit",
                            textDecoration: "none",
                          }}
                        >
                          {item.title}
                        </span>
                      </div>

                      {noteVisible ? (
                        <div
                          style={{
                            color: template.muted,
                            fontSize: `${Math.max(density.noteSize + 6, 18)}px`,
                            fontWeight: 800,
                            lineHeight: 1.35,
                            marginTop: "6px",
                            paddingLeft: density.columns === 3 ? "0" : "40px",
                            whiteSpace: "pre-wrap",
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                          }}
                        >
                          {item.note}
                        </div>
                      ) : null}

                      {durationText ? (
                        <div
                          style={{
                            color: template.muted,
                            fontSize: `${Math.max(density.metaSize + 5, 16)}px`,
                            fontWeight: 800,
                            lineHeight: 1.35,
                            marginTop: noteVisible ? "4px" : "8px",
                            overflowWrap: "anywhere",
                            paddingLeft: density.columns === 3 ? "0" : "40px",
                            wordBreak: "break-word",
                          }}
                        >
                          {durationText}
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
            )}
          </div>
        </section>

        <footer
          style={{
            alignItems: "center",
            background: `linear-gradient(90deg, rgba(255,255,255,0.92), ${template.accentSoft}, rgba(255,255,255,0.9))`,
            border: `2px solid ${template.accentSoft}`,
            borderRadius: isPlayful ? "26px" : "16px",
            boxSizing: "border-box",
            boxShadow: "0 14px 34px rgba(116, 74, 103, 0.08)",
            color: template.ink,
            display: "flex",
            gap: "16px",
            justifyContent: "center",
            minHeight: "84px",
            padding: "14px 24px",
            position: "relative",
            zIndex: 1,
          }}
        >
          <div
            aria-hidden="true"
            style={{
              background: `linear-gradient(90deg, ${template.accentSoft}, rgba(255,255,255,0.68))`,
              border: `1px solid ${template.border}`,
              borderRadius: "999px",
              height: "16px",
              left: "30px",
              opacity: 0.72,
              position: "absolute",
              top: "-8px",
              transform: "rotate(-2deg)",
              width: "126px",
            }}
          />
          <span
            aria-hidden="true"
            style={{
              alignItems: "center",
              background: "#ffffff",
              border: `2px solid ${template.border}`,
              borderRadius: "999px",
              color: template.accent,
              display: "none",
              flex: "0 0 auto",
              fontSize: "32px",
              height: "54px",
              justifyContent: "center",
              width: "54px",
            }}
          >
            {template.decorations[1] ?? "✦"}
          </span>
          <div
            style={{
              minWidth: 0,
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: "27px",
                fontWeight: 950,
                lineHeight: 1.32,
                overflowWrap: "anywhere",
                wordBreak: "break-word",
              }}
            >
              {overflowCount > 0 ? `${footerText}（另有 ${overflowCount} 项未显示）` : footerText}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

function App() {
  const today = useMemo(() => formatDateInput(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [plansByDate, setPlansByDate] = useState<PlanBook>(() => loadPlanBook());
  const [form, setForm] = useState<PlanForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [completionFeedback, setCompletionFeedback] = useState<CompletionFeedback | null>(null);
  const [actualEditId, setActualEditId] = useState<string | null>(null);
  const [actualMinutesDraft, setActualMinutesDraft] = useState<string>("");
  const [actualMinutesError, setActualMinutesError] = useState<string>("");
  const [taskTimer, setTaskTimer] = useState<TaskTimerState | null>(null);
  const [timerTick, setTimerTick] = useState<number>(() => Date.now());
  const [timerNotice, setTimerNotice] = useState<string>("");
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>(() =>
    loadCustomCategories(),
  );
  const [customCategoryInput, setCustomCategoryInput] = useState<string>("");
  const [customCategoryStatus, setCustomCategoryStatus] = useState<string>("");
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportEncouragement, setExportEncouragement] = useState<string>(() => getRandomPrimaryEncouragement());
  const [selectedExportTemplateId, setSelectedExportTemplateId] = useState<string>(
    EXPORT_TEMPLATES[0].id,
  );
  const [deletedItemIds, setDeletedItemIds] = useState<string[]>(() => loadDeletedItemIds());
  const [currentUser, setCurrentUser] = useState<SupabaseUser | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>(() =>
    hasPasswordRecoveryMarker() ? "update-password" : "sign-in",
  );
  const [authForm, setAuthForm] = useState<AuthForm>({
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [authStatus, setAuthStatus] = useState<string>(() =>
    isSupabaseConfigured ? "未登录时仍可本地使用" : "Supabase 环境变量未配置，当前为本地模式",
  );
  const [cloudStatus, setCloudStatus] = useState<string>(() =>
    isSupabaseConfigured ? "本地模式" : "Supabase 环境变量未配置，本地模式",
  );
  const [isAuthBusy, setIsAuthBusy] = useState<boolean>(false);
  const [isCloudSaving, setIsCloudSaving] = useState<boolean>(false);
  const journalRef = useRef<HTMLDivElement | null>(null);
  const exportRef = useRef<HTMLDivElement | null>(null);
  const feedbackTimer = useRef<number | null>(null);
  const timerNoticeTimer = useRef<number | null>(null);
  const cloudTimer = useRef<number | null>(null);
  const cloudReady = useRef<boolean>(false);
  const latestPlanBook = useRef<PlanBook>(plansByDate);
  const latestDeletedItemIds = useRef<string[]>(deletedItemIds);
  const latestCustomCategories = useRef<CustomCategory[]>(customCategories);
  const currentUserId = currentUser?.id ?? null;

  const categoryOptions = useMemo(
    () => [
      ...CATEGORY_OPTIONS.map((category) => ({
        id: category,
        name: category,
        icon: CATEGORY_STYLES[category].emoji,
      })),
      ...customCategories,
    ],
    [customCategories],
  );
  const exportTemplateGroups = useMemo(
    () =>
      Array.from(new Set(EXPORT_TEMPLATES.map((template) => template.audience))).map((audience) => ({
        audience,
        templates: EXPORT_TEMPLATES.filter((template) => template.audience === audience),
      })),
    [],
  );
  const selectedExportTemplate =
    EXPORT_TEMPLATES.find((template) => template.id === selectedExportTemplateId) ??
    EXPORT_TEMPLATES[0];
  const plans = plansByDate[selectedDate] ?? [];
  const completedCount = plans.filter((item) => item.completed).length;
  const progress = plans.length > 0 ? Math.round((completedCount / plans.length) * 100) : 0;

  useEffect(() => {
    savePlanBook(plansByDate);
    latestPlanBook.current = plansByDate;
  }, [plansByDate]);

  useEffect(() => {
    latestDeletedItemIds.current = deletedItemIds;
  }, [deletedItemIds]);

  useEffect(() => {
    saveDeletedItemIds(deletedItemIds);
  }, [deletedItemIds]);

  useEffect(() => {
    saveCustomCategories(customCategories);
    latestCustomCategories.current = customCategories;
  }, [customCategories]);

  useEffect(() => {
    return () => {
      if (feedbackTimer.current) {
        window.clearTimeout(feedbackTimer.current);
      }
      if (cloudTimer.current) {
        window.clearTimeout(cloudTimer.current);
      }
      if (timerNoticeTimer.current) {
        window.clearTimeout(timerNoticeTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!taskTimer?.isRunning && !taskTimer?.countdownIsRunning) {
      return;
    }

    setTimerTick(Date.now());
    const intervalId = window.setInterval(() => {
      setTimerTick(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    taskTimer?.countdownIsRunning,
    taskTimer?.countdownStartedAt,
    taskTimer?.isRunning,
    taskTimer?.itemId,
    taskTimer?.startedAt,
  ]);

  useEffect(() => {
    if (!taskTimer?.countdownIsRunning) {
      return;
    }

    if (getCountdownRemainingSeconds(taskTimer, timerTick) > 0) {
      return;
    }

    showTimerNotice("倒计时结束啦！");
    setTaskTimer((currentTimer) => {
      if (!currentTimer || currentTimer.itemId !== taskTimer.itemId) {
        return currentTimer;
      }

      if (!currentTimer.forwardHasStarted && !currentTimer.isRunning) {
        return null;
      }

      return {
        ...currentTimer,
        countdownHasStarted: false,
        countdownIsRunning: false,
        countdownRemainingSeconds: currentTimer.countdownInitialSeconds,
        countdownStartedAt: null,
      };
    });
    setTimerTick(Date.now());
  }, [taskTimer, timerTick]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }

    let isMounted = true;

    if (hasPasswordRecoveryMarker()) {
      setAuthMode("update-password");
      setAuthStatus("请设置新的登录密码");
    }

    void getCurrentSession()
      .then((session) => {
        if (isMounted) {
          setCurrentUser(session?.user ?? null);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setAuthStatus(error instanceof Error ? error.message : "读取登录状态失败");
        }
      });

    const subscription = onAuthStateChange((event, session) => {
      if (!isMounted) {
        return;
      }

      setCurrentUser(session?.user ?? null);

      if (event === "PASSWORD_RECOVERY") {
        setAuthMode("update-password");
        setAuthStatus("请设置新的登录密码");
      }

      if (event === "SIGNED_OUT") {
        cloudReady.current = false;
        setCloudStatus("已退出登录，本地模式");
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!currentUserId) {
      cloudReady.current = false;
      if (cloudTimer.current) {
        window.clearTimeout(cloudTimer.current);
        cloudTimer.current = null;
      }
      setCloudStatus(isSupabaseConfigured ? "未登录，本地模式" : "Supabase 环境变量未配置，本地模式");
      return;
    }

    let isCancelled = false;

    const loadCloudData = async () => {
      if (!isSupabaseConfigured) {
        setCloudStatus("Supabase 环境变量未配置，本地模式");
        return;
      }

      cloudReady.current = false;
      setIsCloudSaving(true);
      setCloudStatus("正在合并云端数据...");

      try {
        const cloudRecord = await getDailyPlannerUserData(currentUserId);
        const cloudPayload = normalizePayload(cloudRecord?.payload);
        const localPlanBook = normalizePlanBook(latestPlanBook.current);
        const nextDeletedItemIds = uniqueValues([
          ...latestDeletedItemIds.current,
          ...cloudPayload.deletedItemIds,
        ]);
        const nextCustomCategories = mergeCustomCategories(
          latestCustomCategories.current,
          cloudPayload.customCategories,
        );
        const mergedPlanBook = mergePlanBooks(
          localPlanBook,
          cloudPayload.plansByDate,
          nextDeletedItemIds,
        );

        if (isCancelled) {
          return;
        }

        setDeletedItemIds(nextDeletedItemIds);
        setCustomCategories(nextCustomCategories);
        setPlansByDate(mergedPlanBook);
        await upsertDailyPlannerUserData({
          userId: currentUserId,
          payload: createCloudPayload(mergedPlanBook, nextDeletedItemIds, nextCustomCategories),
        });

        if (!isCancelled) {
          cloudReady.current = true;
          setCloudStatus("已登录，云端数据已合并");
        }
      } catch (error) {
        if (!isCancelled) {
          setCloudStatus(error instanceof Error ? error.message : "云端数据读取失败");
        }
      } finally {
        if (!isCancelled) {
          setIsCloudSaving(false);
        }
      }
    };

    void loadCloudData();

    return () => {
      isCancelled = true;
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId || !cloudReady.current) {
      return;
    }

    if (cloudTimer.current) {
      window.clearTimeout(cloudTimer.current);
    }

    cloudTimer.current = window.setTimeout(() => {
      void pushToCloud(currentUserId);
    }, SYNC_DEBOUNCE_MS);

    return () => {
      if (cloudTimer.current) {
        window.clearTimeout(cloudTimer.current);
      }
    };
  }, [currentUserId, customCategories, deletedItemIds, plansByDate]);

  const updatePlansForSelectedDate = (updater: (current: PlanItem[]) => PlanItem[]) => {
    setPlansByDate((currentBook) => ({
      ...currentBook,
      [selectedDate]: updater(currentBook[selectedDate] ?? []),
    }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const clearTimerNotice = () => {
    if (timerNoticeTimer.current) {
      window.clearTimeout(timerNoticeTimer.current);
      timerNoticeTimer.current = null;
    }
    setTimerNotice("");
  };

  const showTimerNotice = (message: string) => {
    setTimerNotice(message);
    if (timerNoticeTimer.current) {
      window.clearTimeout(timerNoticeTimer.current);
    }
    timerNoticeTimer.current = window.setTimeout(() => {
      setTimerNotice("");
      timerNoticeTimer.current = null;
    }, 2400);
  };

  const pushToCloud = async (userId: string) => {
    if (!isSupabaseConfigured) {
      setCloudStatus("Supabase 环境变量未配置，本地模式");
      return;
    }

    setIsCloudSaving(true);
    setCloudStatus("正在保存到云端...");

    try {
      const cloudRecord = await getDailyPlannerUserData(userId);
      const cloudPayload = normalizePayload(cloudRecord?.payload);
      const nextDeletedItemIds = uniqueValues([
        ...latestDeletedItemIds.current,
        ...cloudPayload.deletedItemIds,
      ]);
      const nextCustomCategories = mergeCustomCategories(
        latestCustomCategories.current,
        cloudPayload.customCategories,
      );
      const mergedPlanBook = mergePlanBooks(
        latestPlanBook.current,
        cloudPayload.plansByDate,
        nextDeletedItemIds,
      );

      if (!arePlanBooksEqual(latestPlanBook.current, mergedPlanBook)) {
        setPlansByDate(mergedPlanBook);
      }
      if (!areStringArraysEqual(nextDeletedItemIds, latestDeletedItemIds.current)) {
        setDeletedItemIds(nextDeletedItemIds);
      }
      if (JSON.stringify(nextCustomCategories) !== JSON.stringify(latestCustomCategories.current)) {
        setCustomCategories(nextCustomCategories);
      }

      await upsertDailyPlannerUserData({
        userId,
        payload: createCloudPayload(mergedPlanBook, nextDeletedItemIds, nextCustomCategories),
      });
      setCloudStatus("已保存到云端");
    } catch (error) {
      setCloudStatus(error instanceof Error ? error.message : "云端保存失败");
    } finally {
      setIsCloudSaving(false);
    }
  };

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isSupabaseConfigured) {
      setAuthStatus("Supabase 环境变量未配置，当前只能本地使用");
      return;
    }

    try {
      setIsAuthBusy(true);
      const email = authForm.email.trim();
      const password = authForm.password;

      if (authMode === "update-password") {
        if (password.length < 6) {
          setAuthStatus("新密码至少 6 位");
          return;
        }

        if (password !== authForm.confirmPassword) {
          setAuthStatus("两次输入的新密码不一致");
          return;
        }

        await updatePassword(password);
        cleanAuthUrl();
        setAuthMode("sign-in");
        setAuthForm((current) => ({ ...current, password: "", confirmPassword: "" }));
        setAuthStatus("新密码已设置，当前账户已登录");
        return;
      }

      if (!email) {
        setAuthStatus("请输入邮箱");
        return;
      }

      if (authMode === "forgot") {
        await resetPassword(email);
        setAuthStatus("重置密码邮件已发送，请查收邮箱");
        return;
      }

      if (password.length < 6) {
        setAuthStatus("密码至少 6 位");
        return;
      }

      if (authMode === "sign-up") {
        await signUp(email, password);
        setAuthMode("sign-in");
        setAuthForm({ email, password: "", confirmPassword: "" });
        setAuthStatus("注册邮件已发送，请先查收邮箱完成验证");
        return;
      }

      await signIn(email, password);
      setAuthForm({ email, password: "", confirmPassword: "" });
      setAuthStatus("登录成功，正在合并云端数据");
    } catch (error) {
      setAuthStatus(error instanceof Error ? error.message : "登录操作失败");
    } finally {
      setIsAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    try {
      setIsAuthBusy(true);
      await signOut();
      cloudReady.current = false;
      if (cloudTimer.current) {
        window.clearTimeout(cloudTimer.current);
        cloudTimer.current = null;
      }
      setCurrentUser(null);
      setAuthMode("sign-in");
      setAuthStatus("已退出登录，可继续本地使用");
      setCloudStatus("已退出登录，本地模式");
    } catch (error) {
      setAuthStatus(error instanceof Error ? error.message : "退出登录失败");
    } finally {
      setIsAuthBusy(false);
    }
  };

  const switchAuthMode = (nextMode: AuthMode) => {
    setAuthMode(nextMode);
    setAuthForm((current) => ({
      ...current,
      password: "",
      confirmPassword: "",
    }));
    setAuthStatus(nextMode === "forgot" ? "输入邮箱接收重置密码邮件" : "未登录时仍可本地使用");
  };

  const handleAddCustomCategory = () => {
    const name = customCategoryInput.trim();

    if (!name) {
      setCustomCategoryStatus("分类名称不能为空");
      return;
    }

    const isBuiltInDuplicate = CATEGORY_OPTIONS.includes(name as BuiltInCategory);
    const isCustomDuplicate = customCategories.some((category) => category.name === name);

    if (isBuiltInDuplicate || isCustomDuplicate) {
      setCustomCategoryStatus("这个分类已经存在啦");
      return;
    }

    const nextCategory: CustomCategory = {
      id: createId(),
      name,
      icon: "🏷️",
    };

    setCustomCategories((current) => [...current, nextCategory]);
    setForm((current) => ({ ...current, category: name }));
    setCustomCategoryInput("");
    setCustomCategoryStatus("已添加自定义分类");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = form.title.trim();
    const targetMinutes = parseOptionalMinutes(form.targetMinutes);
    const updatedAt = Date.now();

    if (!title) {
      return;
    }

    if (targetMinutes === null) {
      window.alert("目标时长请输入正整数分钟，或留空");
      return;
    }

    if (editingId) {
      updatePlansForSelectedDate((currentPlans) =>
        currentPlans.map((item) =>
          item.id === editingId
            ? {
                ...item,
                title,
                category: form.category,
                note: form.note.trim(),
                targetMinutes,
                updatedAt,
              }
            : item,
        ),
      );
      resetForm();
      return;
    }

    const nextPlan: PlanItem = {
      id: createId(),
      date: selectedDate,
      title,
      category: form.category,
      note: form.note.trim(),
      completed: false,
      targetMinutes,
      createdAt: updatedAt,
      updatedAt,
    };

    updatePlansForSelectedDate((currentPlans) => [nextPlan, ...currentPlans]);
    resetForm();
  };

  const handleEdit = (item: PlanItem) => {
    setEditingId(item.id);
    setForm({
      title: item.title,
      category: item.category,
      note: item.note,
      targetMinutes: item.targetMinutes ? String(item.targetMinutes) : "",
    });
  };

  const handleDelete = (id: string) => {
    updatePlansForSelectedDate((currentPlans) => currentPlans.filter((item) => item.id !== id));
    setDeletedItemIds((current) => uniqueValues([...current, id]));
    if (editingId === id) {
      resetForm();
    }
    if (actualEditId === id) {
      setActualEditId(null);
      setActualMinutesDraft("");
      setActualMinutesError("");
    }
    setTaskTimer((currentTimer) => (currentTimer?.itemId === id ? null : currentTimer));
  };

  const startActualMinutesEdit = (item: PlanItem) => {
    setActualEditId(item.id);
    setActualMinutesDraft(item.actualMinutes ? String(item.actualMinutes) : "");
    setActualMinutesError("");
  };

  const cancelActualMinutesEdit = () => {
    setActualEditId(null);
    setActualMinutesDraft("");
    setActualMinutesError("");
  };

  const saveActualMinutes = (id: string) => {
    const actualMinutes = parseOptionalMinutes(actualMinutesDraft);

    if (actualMinutes === null) {
      setActualMinutesError("请输入正整数分钟，或留空");
      return;
    }

    updatePlansForSelectedDate((currentPlans) =>
      currentPlans.map((item) =>
        item.id === id
          ? {
              ...item,
              actualMinutes,
              updatedAt: Date.now(),
            }
          : item,
      ),
    );
    cancelActualMinutesEdit();
  };

  const handleTimerClick = (item: PlanItem) => {
    if (item.completed) {
      return;
    }

    if (taskTimer && taskTimer.itemId !== item.id) {
      showTimerNotice("已有任务正在计时，请先暂停或完成当前任务。");
      return;
    }

    clearTimerNotice();

    const now = Date.now();
    setTimerTick(now);

    if (!taskTimer) {
      setTaskTimer({
        ...createTaskTimerState(item.id),
        forwardHasStarted: true,
        isRunning: true,
        startedAt: now,
      });
      return;
    }

    const elapsedSeconds = getTaskTimerElapsedSeconds(taskTimer, now);
    setTaskTimer({
      ...taskTimer,
      elapsedSeconds,
      forwardHasStarted: true,
      isRunning: !taskTimer.isRunning,
      startedAt: taskTimer.isRunning ? null : now,
    });
  };

  const handleCountdownClick = (item: PlanItem, minutes: number) => {
    if (item.completed) {
      return;
    }

    if (taskTimer && taskTimer.itemId !== item.id) {
      showTimerNotice("已有任务正在计时，请先暂停或完成当前任务。");
      return;
    }

    clearTimerNotice();

    const now = Date.now();
    const selectedSeconds = minutes * 60;
    setTimerTick(now);

    if (!taskTimer) {
      setTaskTimer({
        ...createTaskTimerState(item.id),
        countdownHasStarted: true,
        countdownInitialSeconds: selectedSeconds,
        countdownIsRunning: true,
        countdownRemainingSeconds: selectedSeconds,
        countdownStartedAt: now,
      });
      return;
    }

    const remainingSeconds = getCountdownRemainingSeconds(taskTimer, now);
    const isSameCountdown =
      taskTimer.countdownInitialSeconds === selectedSeconds &&
      (taskTimer.countdownHasStarted || taskTimer.countdownIsRunning);

    if (!isSameCountdown) {
      setTaskTimer({
        ...taskTimer,
        countdownHasStarted: true,
        countdownInitialSeconds: selectedSeconds,
        countdownIsRunning: true,
        countdownRemainingSeconds: selectedSeconds,
        countdownStartedAt: now,
      });
      return;
    }

    setTaskTimer({
      ...taskTimer,
      countdownHasStarted: true,
      countdownInitialSeconds: selectedSeconds,
      countdownIsRunning: !taskTimer.countdownIsRunning,
      countdownRemainingSeconds: taskTimer.countdownIsRunning
        ? remainingSeconds
        : remainingSeconds > 0
          ? remainingSeconds
          : selectedSeconds,
      countdownStartedAt: taskTimer.countdownIsRunning ? null : now,
    });
  };

  const handleToggle = (id: string) => {
    const targetPlan = plans.find((item) => item.id === id);
    const now = Date.now();
    const hasTimerForTask = taskTimer?.itemId === id;
    const timerElapsedSeconds =
      hasTimerForTask && taskTimer ? getTaskTimerElapsedSeconds(taskTimer, now) : 0;
    const hasForwardTimer = Boolean(
      hasTimerForTask && taskTimer && (taskTimer.forwardHasStarted || timerElapsedSeconds > 0),
    );

    if (targetPlan && !targetPlan.completed) {
      const nextCompletedCount = plans.filter((item) => item.completed || item.id === id).length;
      const nextCompletionFeedback = createCompletionFeedback({
        itemId: id,
        completedCount: nextCompletedCount,
        totalCount: plans.length,
      });

      setCompletionFeedback(nextCompletionFeedback);

      if (feedbackTimer.current) {
        window.clearTimeout(feedbackTimer.current);
      }

      feedbackTimer.current = window.setTimeout(() => {
        setCompletionFeedback(null);
      }, 1500);
    }

    if (hasTimerForTask) {
      clearTimerNotice();
      setTaskTimer(null);
      setTimerTick(now);
    }

    if (targetPlan?.completed && actualEditId === id) {
      cancelActualMinutesEdit();
    }

    updatePlansForSelectedDate((currentPlans) =>
      currentPlans.map((item) =>
        item.id === id
          ? {
              ...item,
              completed: !item.completed,
              actualMinutes:
                !item.completed && hasForwardTimer && !item.actualMinutes
                  ? timerSecondsToActualMinutes(timerElapsedSeconds)
                  : item.actualMinutes,
              updatedAt: now,
            }
          : item,
      ),
    );
  };

  const handleClearDay = () => {
    if (plans.length === 0) {
      return;
    }

    const shouldClear = window.confirm("确定清空当天计划吗？");

    if (!shouldClear) {
      return;
    }

    updatePlansForSelectedDate(() => []);
    setDeletedItemIds((current) => uniqueValues([...current, ...plans.map((item) => item.id)]));
    cancelActualMinutesEdit();
    setTaskTimer(null);
    clearTimerNotice();
    resetForm();
  };

  const captureJournal = async () => {
    setIsExporting(true);

    try {
      if (!exportRef.current) {
        throw new Error("导出容器尚未准备好");
      }

      flushSync(() => {
        setExportEncouragement(getRandomPrimaryEncouragement());
      });
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });

      return await captureExportElement(exportRef.current);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPng = async () => {
    const canvas = await captureJournal();

    if (!canvas) {
      return;
    }

    const link = document.createElement("a");
    link.download = `今日计划手帐-${selectedDate}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const handleExportPdf = async () => {
    const canvas = await captureJournal();

    if (!canvas) {
      return;
    }

    const imageData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ format: "a4", orientation: "portrait", unit: "pt" });
    const margin = 24;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imageWidth = pageWidth - margin * 2;
    const imageHeight = (canvas.height * imageWidth) / canvas.width;
    const printableHeight = pageHeight - margin * 2;
    let remainingHeight = imageHeight;
    let imageTop = margin;

    pdf.addImage(imageData, "PNG", margin, imageTop, imageWidth, imageHeight);
    remainingHeight -= printableHeight;

    while (remainingHeight > 0) {
      imageTop -= printableHeight;
      pdf.addPage();
      pdf.addImage(imageData, "PNG", margin, imageTop, imageWidth, imageHeight);
      remainingHeight -= printableHeight;
    }

    pdf.save(`今日计划手帐-${selectedDate}.pdf`);
  };

  return (
    <main className="min-h-screen bg-[#fff8ef] bg-[linear-gradient(180deg,#fff8ef_0%,#f6f1ff_48%,#edf8ff_100%)] px-4 py-6 text-[#46394f] sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 rounded-[2rem] border border-white/80 bg-white/70 p-5 shadow-sticker backdrop-blur md:flex-row md:items-center md:justify-between">
          <div>
            <p className="mb-1 text-sm font-semibold text-pink-500">Daily Planner Journal</p>
            <h1 className="text-3xl font-black tracking-normal text-[#382b44] sm:text-4xl">
              今日计划手帐
            </h1>
            <p className="mt-2 text-sm text-[#76687f]">{formatDisplayDate(selectedDate)}</p>
          </div>

          <div className="flex flex-col gap-3 sm:min-w-80">
            <label className="text-sm font-bold text-[#6f5d78]" htmlFor="planner-date">
              选择日期
            </label>
            <input
              className="rounded-2xl border border-pink-100 bg-white px-4 py-3 text-[#46394f] shadow-sm outline-none transition focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
              id="planner-date"
              type="date"
              value={selectedDate}
              onChange={(event) => {
                setSelectedDate(event.target.value);
                resetForm();
              }}
            />
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[minmax(280px,360px)_1fr]">
          <aside className="h-fit rounded-[2rem] border border-white/80 bg-white/80 p-5 shadow-sticker backdrop-blur">
            <section className="mb-5 rounded-[1.5rem] border border-dashed border-violet-200 bg-violet-50/70 p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-[#6f5d78]">邮箱账号</p>
                  <p className="mt-1 text-xs font-bold text-[#8a7a94]">
                    {currentUser && authMode !== "update-password"
                      ? "云端自动保存已开启"
                      : "未登录也可继续本地使用"}
                  </p>
                </div>
                <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-black text-violet-700">
                  {currentUser && authMode !== "update-password" ? "已登录" : "本地模式"}
                </span>
              </div>

              {currentUser && authMode !== "update-password" ? (
                <div className="space-y-3">
                  <div className="rounded-2xl bg-white/80 px-4 py-3">
                    <p className="break-all text-sm font-black text-[#46394f]">
                      {currentUser.email ?? "已登录账号"}
                    </p>
                    <p className="mt-1 text-xs font-bold text-[#76687f]">
                      {isCloudSaving ? "云端保存中..." : cloudStatus}
                    </p>
                  </div>
                  <button
                    className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-black text-violet-700 transition hover:bg-violet-100 disabled:opacity-50"
                    disabled={isAuthBusy}
                    type="button"
                    onClick={handleSignOut}
                  >
                    退出登录
                  </button>
                </div>
              ) : (
                <form className="space-y-3" onSubmit={handleAuthSubmit}>
                  {authMode === "sign-in" || authMode === "sign-up" ? (
                    <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/70 p-1">
                      <button
                        className={`rounded-[0.9rem] px-3 py-2 text-sm font-black transition ${
                          authMode === "sign-in"
                            ? "bg-[#9f8cff] text-white shadow-sm shadow-violet-200"
                            : "text-[#7a6b84] hover:bg-white"
                        }`}
                        type="button"
                        onClick={() => switchAuthMode("sign-in")}
                      >
                        登录
                      </button>
                      <button
                        className={`rounded-[0.9rem] px-3 py-2 text-sm font-black transition ${
                          authMode === "sign-up"
                            ? "bg-[#9f8cff] text-white shadow-sm shadow-violet-200"
                            : "text-[#7a6b84] hover:bg-white"
                        }`}
                        type="button"
                        onClick={() => switchAuthMode("sign-up")}
                      >
                        注册
                      </button>
                    </div>
                  ) : null}

                  {authMode === "update-password" ? (
                    <>
                      <div>
                        <label
                          className="mb-2 block text-sm font-bold text-[#6f5d78]"
                          htmlFor="new-password"
                        >
                          新密码
                        </label>
                        <input
                          className="w-full rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-[#b8aabd] focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                          id="new-password"
                          minLength={6}
                          placeholder="至少 6 位"
                          type="password"
                          value={authForm.password}
                          onChange={(event) =>
                            setAuthForm((current) => ({
                              ...current,
                              password: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div>
                        <label
                          className="mb-2 block text-sm font-bold text-[#6f5d78]"
                          htmlFor="confirm-password"
                        >
                          确认新密码
                        </label>
                        <input
                          className="w-full rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-[#b8aabd] focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                          id="confirm-password"
                          minLength={6}
                          placeholder="再次输入新密码"
                          type="password"
                          value={authForm.confirmPassword}
                          onChange={(event) =>
                            setAuthForm((current) => ({
                              ...current,
                              confirmPassword: event.target.value,
                            }))
                          }
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label
                          className="mb-2 block text-sm font-bold text-[#6f5d78]"
                          htmlFor="auth-email"
                        >
                          邮箱
                        </label>
                        <input
                          autoComplete="email"
                          className="w-full rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-[#b8aabd] focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                          id="auth-email"
                          placeholder="QQ、163、Gmail 等邮箱"
                          type="email"
                          value={authForm.email}
                          onChange={(event) =>
                            setAuthForm((current) => ({ ...current, email: event.target.value }))
                          }
                        />
                      </div>

                      {authMode === "forgot" ? null : (
                        <div>
                          <label
                            className="mb-2 block text-sm font-bold text-[#6f5d78]"
                            htmlFor="auth-password"
                          >
                            密码
                          </label>
                          <input
                            autoComplete={authMode === "sign-up" ? "new-password" : "current-password"}
                            className="w-full rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-[#b8aabd] focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                            id="auth-password"
                            minLength={6}
                            placeholder="本站登录密码"
                            type="password"
                            value={authForm.password}
                            onChange={(event) =>
                              setAuthForm((current) => ({
                                ...current,
                                password: event.target.value,
                              }))
                            }
                          />
                        </div>
                      )}
                    </>
                  )}

                  <button
                    className="w-full rounded-2xl bg-[#9f8cff] px-4 py-3 text-sm font-black text-white shadow-sm shadow-violet-200 transition hover:bg-[#8f7af2] disabled:opacity-50"
                    disabled={isAuthBusy || !isSupabaseConfigured}
                    type="submit"
                  >
                    {isAuthBusy
                      ? "处理中..."
                      : authMode === "sign-up"
                        ? "注册"
                        : authMode === "forgot"
                          ? "发送重置邮件"
                          : authMode === "update-password"
                            ? "设置新密码"
                            : "登录"}
                  </button>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-[#76687f]">
                    <span>{authStatus}</span>
                    {authMode === "sign-in" ? (
                      <button
                        className="text-violet-700 underline decoration-violet-300 underline-offset-4"
                        type="button"
                        onClick={() => switchAuthMode("forgot")}
                      >
                        忘记密码
                      </button>
                    ) : null}
                    {authMode === "forgot" ? (
                      <button
                        className="text-violet-700 underline decoration-violet-300 underline-offset-4"
                        type="button"
                        onClick={() => switchAuthMode("sign-in")}
                      >
                        返回登录
                      </button>
                    ) : null}
                  </div>
                </form>
              )}
            </section>

            <div className="mb-5">
              <div className="mb-2 flex items-center justify-between text-sm font-bold text-[#6b5d74]">
                <span>已完成 {completedCount} / {plans.length} 项</span>
                <span>{progress}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-[#eee5f5]">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#f7a8c7,#a9d6ff,#b9e5c8)] transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="mb-2 block text-sm font-bold text-[#6f5d78]" htmlFor="title">
                  标题
                </label>
                <input
                  className="w-full rounded-2xl border border-pink-100 bg-white px-4 py-3 outline-none transition placeholder:text-[#b8aabd] focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
                  id="title"
                  maxLength={48}
                  placeholder="写下今天要做的事"
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-[#6f5d78]" htmlFor="category">
                  分类
                </label>
                <select
                  className="w-full rounded-2xl border border-pink-100 bg-white px-4 py-3 outline-none transition focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
                  id="category"
                  value={form.category}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, category: event.target.value }))
                  }
                >
                  {categoryOptions.map((category) => (
                    <option key={category.id} value={category.name}>
                      {category.icon} {category.name}
                    </option>
                  ))}
                </select>
                <div className="mt-3 rounded-[1.25rem] border border-dashed border-pink-100 bg-pink-50/50 p-3">
                  <label
                    className="mb-2 block text-xs font-black text-[#7a6b84]"
                    htmlFor="custom-category"
                  >
                    + 添加自定义分类
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
                    <input
                      className="min-w-0 flex-1 rounded-2xl border border-pink-100 bg-white px-4 py-2.5 text-sm outline-none transition placeholder:text-[#b8aabd] focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
                      id="custom-category"
                      maxLength={20}
                      placeholder="例如：阅读、旅行"
                      value={customCategoryInput}
                      onChange={(event) => {
                        setCustomCategoryInput(event.target.value);
                        setCustomCategoryStatus("");
                      }}
                    />
                    <button
                      className="rounded-2xl bg-white px-4 py-2.5 text-sm font-black text-pink-600 shadow-sm transition hover:bg-pink-100 disabled:opacity-50"
                      disabled={!customCategoryInput.trim()}
                      type="button"
                      onClick={handleAddCustomCategory}
                    >
                      添加
                    </button>
                  </div>
                  {customCategoryStatus ? (
                    <p className="mt-2 text-xs font-bold text-[#8b7b91]">{customCategoryStatus}</p>
                  ) : null}
                </div>
              </div>

              <div>
                <label
                  className="mb-2 block text-sm font-bold text-[#6f5d78]"
                  htmlFor="target-minutes"
                >
                  目标时长（分钟）
                </label>
                <input
                  className="w-full rounded-2xl border border-pink-100 bg-white px-4 py-3 outline-none transition placeholder:text-[#b8aabd] focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
                  id="target-minutes"
                  inputMode="numeric"
                  min={1}
                  placeholder="可选，填写正整数"
                  step={1}
                  type="number"
                  value={form.targetMinutes}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, targetMinutes: event.target.value }))
                  }
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-[#6f5d78]" htmlFor="note">
                  备注
                </label>
                <textarea
                  className="min-h-24 w-full resize-none rounded-2xl border border-pink-100 bg-white px-4 py-3 outline-none transition placeholder:text-[#b8aabd] focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
                  id="note"
                  maxLength={160}
                  placeholder="可选"
                  value={form.note}
                  onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  className="rounded-2xl bg-[#ff8fbc] px-5 py-3 text-sm font-black text-white shadow-lg shadow-pink-200 transition hover:-translate-y-0.5 hover:bg-[#ff79ad] disabled:opacity-50"
                  type="submit"
                  disabled={!form.title.trim()}
                >
                  {editingId ? "保存修改" : "添加计划"}
                </button>
                {editingId ? (
                  <button
                    className="rounded-2xl border border-[#ded2e8] bg-white px-5 py-3 text-sm font-bold text-[#6f5d78] transition hover:bg-[#f8f2ff]"
                    type="button"
                    onClick={resetForm}
                  >
                    取消
                  </button>
                ) : null}
              </div>
            </form>
          </aside>

          <section className="rounded-[2rem] border border-white/80 bg-white/80 p-4 shadow-sticker backdrop-blur sm:p-6">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-pink-500">Journal Card</p>
                <h2 className="text-2xl font-black text-[#382b44]">{formatDisplayDate(selectedDate)}</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label
                  className="flex min-w-56 flex-col gap-1 text-xs font-black text-[#6f5d78]"
                  htmlFor="export-template"
                >
                  导出模板
                  <select
                    className="max-w-full rounded-2xl border border-pink-100 bg-white px-3 py-2 text-sm font-bold text-[#46394f] outline-none transition focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
                    id="export-template"
                    value={selectedExportTemplateId}
                    onChange={(event) => setSelectedExportTemplateId(event.target.value)}
                  >
                    {exportTemplateGroups.map((group) => (
                      <optgroup key={group.audience} label={group.audience}>
                        {group.templates.map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <button
                  className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-bold text-sky-700 transition hover:bg-sky-100 disabled:opacity-50"
                  type="button"
                  disabled={isExporting}
                  onClick={handleExportPng}
                >
                  {isExporting ? "导出中" : "导出 PNG"}
                </button>
                <button
                  className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-bold text-violet-700 transition hover:bg-violet-100 disabled:opacity-50"
                  type="button"
                  disabled={isExporting}
                  onClick={handleExportPdf}
                >
                  {isExporting ? "导出中" : "导出 PDF"}
                </button>
                <button
                  className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-600 transition hover:bg-rose-100 disabled:opacity-50"
                  type="button"
                  disabled={plans.length === 0}
                  onClick={handleClearDay}
                >
                  清空当天
                </button>
              </div>
            </div>

            <div
              className="rounded-[1.75rem] border-2 border-dashed border-[#e8d9ed] bg-[#fffaf4] p-4 shadow-inner sm:p-6"
              ref={journalRef}
              style={{
                backgroundImage:
                  "repeating-linear-gradient(0deg, rgba(222, 210, 232, 0.18) 0, rgba(222, 210, 232, 0.18) 1px, transparent 1px, transparent 34px)",
              }}
            >
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-black text-pink-500">今日计划手帐</p>
                  <h3 className="mt-1 text-2xl font-black text-[#3f3349]">
                    {formatDisplayDate(selectedDate)}
                  </h3>
                </div>
                <div className="min-w-48">
                  <div className="mb-2 flex items-center justify-between text-xs font-black text-[#786981]">
                    <span>已完成 {completedCount} / {plans.length} 项</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-white">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#f7a8c7,#a9d6ff,#b9e5c8)]"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </div>

              <AnimatePresence>
                {timerNotice ? (
                  <motion.div
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-4 rounded-2xl border border-sky-100 bg-sky-50/90 px-4 py-3 text-sm font-black text-sky-700 shadow-sm"
                    data-export-ignore="true"
                    exit={{ opacity: 0, y: -6 }}
                    initial={{ opacity: 0, y: -6 }}
                  >
                    {timerNotice}
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {plans.length === 0 ? (
                <div className="flex min-h-72 items-center justify-center rounded-[1.5rem] border-2 border-dashed border-[#e8d9ed] bg-white/60 p-8 text-center">
                  <div>
                    <div className="mb-3 text-5xl">📝</div>
                    <p className="text-lg font-black text-[#5a4b63]">今天还没有计划</p>
                    <p className="mt-2 text-sm text-[#8b7b91]">添加第一张小贴纸吧</p>
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {plans.map((item) => {
                    const style = getCategoryStyle(item.category, customCategories);
                    const timerForItem = taskTimer?.itemId === item.id ? taskTimer : null;
                    const timerElapsedSeconds = timerForItem
                      ? getTaskTimerElapsedSeconds(timerForItem, timerTick)
                      : 0;
                    const hasForwardTiming = Boolean(
                      timerForItem?.forwardHasStarted || timerElapsedSeconds > 0,
                    );
                    const isTimerRunning = Boolean(timerForItem?.isRunning);
                    const isTimerPaused = Boolean(hasForwardTiming && !timerForItem?.isRunning);
                    const timerButtonLabel = isTimerRunning
                      ? "暂停计时"
                      : isTimerPaused
                        ? "继续计时"
                        : "开始计时";
                    const countdownRemainingSeconds = timerForItem
                      ? getCountdownRemainingSeconds(timerForItem, timerTick)
                      : 0;
                    const hasCountdownTiming = Boolean(
                      timerForItem?.countdownHasStarted || timerForItem?.countdownIsRunning,
                    );
                    const isCountdownRunning = Boolean(timerForItem?.countdownIsRunning);
                    const activeCountdownSeconds = hasCountdownTiming
                      ? timerForItem?.countdownInitialSeconds
                      : null;

                    return (
                      <motion.article
                        layout
                        animate={{
                          opacity: item.completed ? 0.72 : 1,
                          y: 0,
                          scale:
                            completionFeedback?.itemId === item.id
                              ? [1, 1.035, 1]
                              : 1,
                        }}
                        className={`relative overflow-hidden rounded-[1.5rem] border-2 border-dashed p-4 shadow-sm transition ${style.bg} ${style.border} ${
                          item.completed ? "" : "hover:-translate-y-1"
                        }`}
                        initial={{ opacity: 0, y: 12 }}
                        key={item.id}
                        transition={{ duration: 0.42, ease: "easeOut" }}
                      >
                        <div className="absolute -right-5 -top-5 h-16 w-16 rounded-full border-8 border-white/60 bg-white/30" />
                        <AnimatePresence>
                          {completionFeedback?.itemId === item.id ? (
                            <CardCompletionBurst feedback={completionFeedback} />
                          ) : null}
                        </AnimatePresence>
                        <div className="relative flex gap-3">
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/80 bg-white text-2xl shadow-sm">
                            <span aria-label={style.caption} role="img">
                              {style.emoji}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                              <span
                                className={`rounded-full bg-white/80 px-3 py-1 text-xs font-black ${style.accent}`}
                              >
                                {item.category}
                              </span>
                              <button
                                className={`flex min-h-7 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black transition ${
                                  item.completed
                                    ? "bg-white text-[#7f7188]"
                                    : "bg-[#ff8fbc] text-white shadow-sm shadow-pink-200"
                                }`}
                                data-export-ignore="true"
                                type="button"
                                onClick={() => handleToggle(item.id)}
                              >
                                <AnimatePresence initial={false}>
                                  {item.completed ? (
                                    <motion.span
                                      aria-hidden="true"
                                      className="flex h-4 w-4 items-center justify-center rounded-full bg-[#a7dfbe] text-[10px] text-white"
                                      initial={{ scale: 0, rotate: -45 }}
                                      animate={{ scale: 1, rotate: 0 }}
                                      exit={{ scale: 0, rotate: 45 }}
                                      transition={{ type: "spring", stiffness: 420, damping: 18 }}
                                    >
                                      ✓
                                    </motion.span>
                                  ) : null}
                                </AnimatePresence>
                                {item.completed ? "已完成" : "完成"}
                              </button>
                            </div>
                            <h3
                              className={`break-words text-lg font-black text-[#41354b] ${
                                item.completed ? "line-through decoration-2 opacity-60" : ""
                              }`}
                            >
                              {item.title}
                            </h3>
                            {item.note ? (
                              <p
                                className={`mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#74667d] ${
                                  item.completed ? "opacity-60" : ""
                                }`}
                              >
                                {item.note}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        <div className="relative mt-3 flex w-full flex-row flex-wrap items-center justify-start gap-3 text-xs font-black text-[#74667d] sm:gap-4">
                          <span className="inline-flex min-h-8 shrink-0 items-center rounded-full bg-white/70 px-3 py-1">
                            目标：{formatMinutes(item.targetMinutes)}
                          </span>
                          <button
                            aria-label="编辑实际用时"
                            className="inline-flex min-h-8 shrink-0 items-center rounded-full bg-white/70 px-3 py-1 text-left transition hover:bg-white hover:text-sky-700 focus:outline-none focus:ring-4 focus:ring-sky-100"
                            type="button"
                            onClick={() => startActualMinutesEdit(item)}
                          >
                            实际：{formatMinutes(item.actualMinutes)}
                            <span className="ml-1 text-[10px] text-sky-500/80">可改</span>
                          </button>
                        </div>
                        {actualEditId === item.id ? (
                          <form
                            className="relative mt-3 flex w-full flex-col gap-2 rounded-[1rem] bg-white/70 p-3 sm:flex-row sm:items-end"
                            data-export-ignore="true"
                            onSubmit={(event) => {
                              event.preventDefault();
                              saveActualMinutes(item.id);
                            }}
                          >
                            <label
                              className="min-w-0 flex-1 text-xs font-black text-[#6c5e75]"
                              htmlFor={`actual-minutes-${item.id}`}
                            >
                              实际用时（分钟）
                              <input
                                className="mt-1 w-full rounded-xl border border-sky-100 bg-white px-3 py-2 text-sm font-bold text-[#46394f] outline-none transition placeholder:text-[#b8aabd] focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                                id={`actual-minutes-${item.id}`}
                                inputMode="numeric"
                                min={1}
                                pattern="[1-9][0-9]*"
                                placeholder="留空表示未设置"
                                step={1}
                                type="text"
                                value={actualMinutesDraft}
                                onChange={(event) => {
                                  const nextValue = event.target.value;
                                  if (nextValue === "" || /^[1-9]\d*$/.test(nextValue)) {
                                    setActualMinutesDraft(nextValue);
                                  }
                                  setActualMinutesError("");
                                }}
                              />
                            </label>
                            <div className="flex flex-wrap gap-2">
                              <button
                                className="rounded-full bg-sky-100 px-3 py-2 text-xs font-black text-sky-700 transition hover:bg-sky-200"
                                type="submit"
                              >
                                保存
                              </button>
                              <button
                                className="rounded-full bg-white px-3 py-2 text-xs font-bold text-[#6c5e75] transition hover:bg-slate-50"
                                type="button"
                                onClick={cancelActualMinutesEdit}
                              >
                                取消
                              </button>
                            </div>
                            {actualMinutesError ? (
                              <p className="w-full text-xs font-bold text-rose-600">
                                {actualMinutesError}
                              </p>
                            ) : null}
                          </form>
                        ) : null}

                        <div
                          className="relative mt-4 flex flex-col gap-3 border-t border-white/80 pt-3"
                          data-export-ignore="true"
                        >
                          <div className="flex flex-row flex-wrap items-center gap-2 rounded-[1.25rem] bg-white/45 p-2">
                            <div
                              className={`flex max-w-full flex-wrap items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-black ${
                                isTimerRunning
                                  ? "border-sky-200 bg-sky-50 text-sky-800"
                                  : isTimerPaused
                                    ? "border-violet-200 bg-violet-50 text-violet-800"
                                    : "border-white/80 bg-white/80 text-[#6c5e75]"
                              } ${item.completed ? "opacity-60" : ""}`}
                            >
                              <span className="whitespace-nowrap tabular-nums">
                                ⏱ {formatTimerSeconds(timerElapsedSeconds)}
                              </span>
                              <button
                                className={`rounded-full px-3 py-1 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-55 ${
                                  isTimerRunning
                                    ? "bg-sky-500 text-white shadow-sm shadow-sky-100 hover:bg-sky-600"
                                    : isTimerPaused
                                      ? "bg-violet-500 text-white shadow-sm shadow-violet-100 hover:bg-violet-600"
                                      : "bg-[#ffe4f0] text-pink-700 hover:bg-[#ffd3e6]"
                                }`}
                                disabled={item.completed}
                                type="button"
                                onClick={() => handleTimerClick(item)}
                              >
                                {timerButtonLabel}
                              </button>
                            </div>
                            <div className={`flex max-w-full flex-wrap items-center gap-1.5 ${item.completed ? "opacity-60" : ""}`}>
                              {COUNTDOWN_OPTIONS.map((option) => {
                                const optionSeconds = option.minutes * 60;
                                const isActiveCountdown = activeCountdownSeconds === optionSeconds;

                                return (
                                  <span className="group relative inline-flex" key={option.minutes}>
                                    <button
                                      aria-label={option.title}
                                      className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-55 ${
                                        isActiveCountdown ? option.activeClass : option.baseClass
                                      } ${isActiveCountdown && isCountdownRunning ? "ring-2 ring-white/80" : ""}`}
                                      disabled={item.completed}
                                      type="button"
                                      onClick={() => handleCountdownClick(item, option.minutes)}
                                    >
                                      <span aria-hidden="true">⏳</span>
                                    </button>
                                    <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-[#6c5e75] opacity-0 shadow-sm ring-1 ring-violet-100 transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100">
                                      {option.title}
                                    </span>
                                  </span>
                                );
                              })}
                              {hasCountdownTiming ? (
                                <span className="ml-1 whitespace-nowrap rounded-full bg-white/80 px-2.5 py-1 text-xs font-black tabular-nums text-amber-800">
                                  ⏳ {formatTimerSeconds(countdownRemainingSeconds)}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-bold text-[#6c5e75] transition hover:bg-white"
                              type="button"
                              onClick={() => handleEdit(item)}
                            >
                              编辑
                            </button>
                            <button
                              className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-bold text-rose-600 transition hover:bg-white"
                              type="button"
                              onClick={() => handleDelete(item.id)}
                            >
                              删除
                            </button>
                          </div>
                        </div>
                      </motion.article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </section>

        <div
          aria-hidden="true"
          style={{
            left: "-12000px",
            pointerEvents: "none",
            position: "fixed",
            top: 0,
            width: `${EXPORT_PAGE_WIDTH}px`,
            zIndex: -1,
          }}
        >
          <div ref={exportRef} style={{ width: `${EXPORT_PAGE_WIDTH}px` }}>
            <ExportJournalTemplate
              completedCount={completedCount}
              customCategories={customCategories}
              encouragementText={exportEncouragement}
              plans={plans}
              progress={progress}
              selectedDate={selectedDate}
              template={selectedExportTemplate}
            />
          </div>
        </div>
      </div>
    </main>
  );
}

export default App;
