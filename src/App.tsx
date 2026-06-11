import { DragEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import pptxgen from "pptxgenjs";
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
const avatarImageModules = import.meta.glob("./assets/avatars/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const STORAGE_KEY = "daily-planner-journal-v1";
const LEGACY_SYNC_STATE_KEY = "daily-planner-journal-sync-v1";
const DELETED_ITEM_IDS_KEY = "daily-planner-journal-deleted-v1";
const CUSTOM_CATEGORIES_KEY = "daily-planner-journal-custom-categories-v1";
const COMPLEX_PROJECTS_KEY = "daily-planner-journal-complex-projects-v1";
const MOOD_BOOK_KEY = "daily-planner-journal-moods-v1";
const USER_PROFILE_KEY = "daily-planner-journal-user-profile-v1";
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
const PRIORITY_OPTIONS = [
  {
    id: "high",
    icon: "🌟",
    name: "重要优先",
    hint: "今天必须完成",
    sectionClass: "border-rose-100 bg-rose-50/55",
    activeClass: "border-rose-300 bg-rose-100/80 ring-4 ring-rose-100",
    cardBg: "bg-rose-50",
    cardBorder: "border-rose-200",
    badgeClass: "bg-rose-100 text-rose-700",
  },
  {
    id: "medium",
    icon: "🌿",
    name: "正常推进",
    hint: "尽量完成",
    sectionClass: "border-sky-100 bg-sky-50/55",
    activeClass: "border-sky-300 bg-sky-100/80 ring-4 ring-sky-100",
    cardBg: "bg-sky-50",
    cardBorder: "border-sky-200",
    badgeClass: "bg-sky-100 text-sky-700",
  },
  {
    id: "low",
    icon: "☁️",
    name: "有空再做",
    hint: "有时间再处理",
    sectionClass: "border-emerald-100 bg-emerald-50/55",
    activeClass: "border-emerald-300 bg-emerald-100/80 ring-4 ring-emerald-100",
    cardBg: "bg-emerald-50",
    cardBorder: "border-emerald-200",
    badgeClass: "bg-emerald-100 text-emerald-700",
  },
] as const;
type TaskPriority = (typeof PRIORITY_OPTIONS)[number]["id"];
const DEFAULT_PRIORITY: TaskPriority = "high";
const SORT_ORDER_STEP = 1000;
const MOOD_OPTIONS = [
  {
    id: "low",
    icon: "🌧️",
    label: "低落",
    score: 1,
    swatch: "#fb7185",
    toneClass: "border-rose-100 bg-rose-50 text-rose-700",
  },
  {
    id: "tired",
    icon: "😮‍💨",
    label: "疲惫",
    score: 2,
    swatch: "#f59e0b",
    toneClass: "border-amber-100 bg-amber-50 text-amber-800",
  },
  {
    id: "calm",
    icon: "🍃",
    label: "平静",
    score: 3,
    swatch: "#38bdf8",
    toneClass: "border-sky-100 bg-sky-50 text-sky-700",
  },
  {
    id: "focused",
    icon: "🎯",
    label: "专注",
    score: 4,
    swatch: "#8b5cf6",
    toneClass: "border-violet-100 bg-violet-50 text-violet-700",
  },
  {
    id: "happy",
    icon: "☀️",
    label: "开心",
    score: 5,
    swatch: "#22c55e",
    toneClass: "border-emerald-100 bg-emerald-50 text-emerald-700",
  },
  {
    id: "energized",
    icon: "✨",
    label: "高能",
    score: 6,
    swatch: "#ec4899",
    toneClass: "border-pink-100 bg-pink-50 text-pink-700",
  },
] as const;
type MoodId = (typeof MOOD_OPTIONS)[number]["id"];
const DEFAULT_MOOD_ID: MoodId = "calm";

const AVATAR_LIBRARY = [
  { id: "animal-capybara-cute", group: "特别款" },
  { id: "animal-bee-pig", group: "特别款" },
  { id: "animal-hardworking-bee", group: "特别款" },
  { id: "animal-calf", group: "特别款" },
  { id: "animal-dragon", group: "特别款" },
  { id: "person-anesthesiologist-candy", group: "特别款" },
  { id: "person-office-doctor-girl", group: "特别款" },
  { id: "nature-flower-field", group: "自然" },
  { id: "nature-sunflower", group: "自然" },
  { id: "nature-daisy", group: "自然" },
  { id: "nature-sprout", group: "自然" },
  { id: "nature-green-leaves", group: "自然" },
  { id: "nature-garden", group: "自然" },
  { id: "nature-lavender", group: "自然" },
  { id: "nature-maple-leaf", group: "自然" },
  { id: "nature-sunrise-mountains", group: "自然" },
  { id: "nature-smiling-sun", group: "自然" },
  { id: "nature-moon-stars", group: "自然" },
  { id: "nature-night-stars", group: "自然" },
  { id: "nature-rainbow-cloud", group: "自然" },
  { id: "nature-ocean-wave", group: "自然" },
  { id: "nature-snowflake", group: "自然" },
  { id: "animal-cat", group: "动物" },
  { id: "animal-dog", group: "动物" },
  { id: "animal-rabbit", group: "动物" },
  { id: "animal-bird", group: "动物" },
  { id: "animal-deer", group: "动物" },
  { id: "animal-panda", group: "动物" },
  { id: "animal-fox", group: "动物" },
  { id: "animal-squirrel", group: "动物" },
  { id: "animal-penguin", group: "动物" },
  { id: "animal-dolphin", group: "动物" },
  { id: "animal-butterfly", group: "动物" },
  { id: "animal-bumblebee-basic", group: "动物" },
  { id: "animal-turtle", group: "动物" },
  { id: "animal-koala", group: "动物" },
  { id: "animal-owl", group: "动物" },
  { id: "person-boy-blue", group: "人物" },
  { id: "person-girl-yellow", group: "人物" },
  { id: "person-doctor-boy", group: "人物" },
  { id: "person-nurse", group: "人物" },
  { id: "person-teacher", group: "人物" },
  { id: "person-research-doctor", group: "人物" },
  { id: "person-boy-green", group: "人物" },
  { id: "person-girl-pink", group: "人物" },
  { id: "person-sport-boy", group: "人物" },
  { id: "person-calm-girl", group: "人物" },
  { id: "person-sunshine-girl", group: "人物" },
  { id: "person-happy-boy", group: "人物" },
  { id: "person-longhair-girl", group: "人物" },
  { id: "person-glasses-boy", group: "人物" },
  { id: "person-apron-girl", group: "人物" },
  { id: "person-little-artist", group: "人物" },
  { id: "person-medical-girl", group: "人物" },
  { id: "person-purple-girl", group: "人物" },
  { id: "person-blue-boy", group: "人物" },
  { id: "person-yellow-hat-girl", group: "人物" },
  { id: "workplace-executive-woman-navy", group: "职场" },
  { id: "workplace-executive-man-navy", group: "职场" },
  { id: "workplace-project-manager-woman", group: "职场" },
  { id: "workplace-glasses-man", group: "职场" },
  { id: "workplace-young-man-pen", group: "职场" },
  { id: "workplace-medical-manager-woman", group: "职场" },
  { id: "workplace-tablet-woman", group: "职场" },
  { id: "workplace-young-business-man", group: "职场" },
  { id: "workplace-notebook-woman", group: "职场" },
  { id: "workplace-tie-man", group: "职场" },
  { id: "workplace-white-shirt-woman", group: "职场" },
  { id: "workplace-senior-man", group: "职场" },
] as const;
const DEFAULT_AVATAR_ID = "animal-capybara-cute";
type AvatarId = (typeof AVATAR_LIBRARY)[number]["id"];
type AvatarOption = (typeof AVATAR_LIBRARY)[number] & {
  src: string;
};
type UserProfile = {
  avatarId: AvatarId;
  updatedAt: number;
};

function getAvatarSrc(id: string): string {
  return (
    avatarImageModules[`./assets/avatars/${id}.png`] ??
    avatarImageModules[`./assets/avatars/${DEFAULT_AVATAR_ID}.png`] ??
    ""
  );
}

const AVATAR_OPTIONS: AvatarOption[] = AVATAR_LIBRARY.map((avatar) => ({
  ...avatar,
  src: getAvatarSrc(avatar.id),
}));
const AVATAR_GROUPS = Array.from(
  AVATAR_OPTIONS.reduce<Map<string, AvatarOption[]>>((groups, avatar) => {
    const groupAvatars = groups.get(avatar.group) ?? [];
    groupAvatars.push(avatar);
    groups.set(avatar.group, groupAvatars);
    return groups;
  }, new Map<string, AvatarOption[]>()),
).map(([group, avatars]) => ({ group, avatars }));

function getAvatarOption(avatarId: string | null | undefined): AvatarOption {
  return (
    AVATAR_OPTIONS.find((avatar) => avatar.id === avatarId) ??
    AVATAR_OPTIONS.find((avatar) => avatar.id === DEFAULT_AVATAR_ID) ??
    AVATAR_OPTIONS[0]
  );
}

function isAvatarId(value: unknown): value is AvatarId {
  return typeof value === "string" && AVATAR_OPTIONS.some((avatar) => avatar.id === value);
}

type CustomCategory = {
  id: string;
  name: string;
  icon: string;
};

type TaskTimeEntry = {
  id: string;
  date: string;
  startedAt: number;
  endedAt?: number;
  durationSeconds: number;
};

type PlanItem = {
  id: string;
  date: string;
  title: string;
  category: Category;
  note: string;
  completed: boolean;
  priority: TaskPriority;
  targetMinutes?: number;
  actualMinutes?: number;
  timeEntries: TaskTimeEntry[];
  sortOrder?: number;
  createdAt: number;
  updatedAt?: number;
};

type PlanBook = Record<string, PlanItem[]>;
type ComplexProjectStatus = "active" | "completed" | "archived";
type ComplexProjectPhaseTimeEntry = {
  id: string;
  date: string;
  startedAt: number;
  endedAt?: number;
  durationSeconds: number;
};
type ComplexProjectPhase = {
  id: string;
  title: string;
  note: string;
  startDate: string;
  endDate: string;
  completed: boolean;
  timeEntries: ComplexProjectPhaseTimeEntry[];
  completedAt?: number;
  updatedAt?: number;
};
type ComplexProject = {
  id: string;
  title: string;
  category: Category;
  priority: TaskPriority;
  note: string;
  startDate: string;
  endDate: string;
  status: ComplexProjectStatus;
  phases: ComplexProjectPhase[];
  sourceTaskId?: string;
  createdAt: number;
  updatedAt?: number;
  archivedAt?: number;
};
type ComplexProjectBook = Record<string, ComplexProject>;
type MoodEntry = {
  id: string;
  date: string;
  moodId: MoodId;
  note: string;
  timestamp: number;
  createdAt: number;
  updatedAt?: number;
};
type MoodBook = Record<string, MoodEntry[]>;
type PlanSearchResult = {
  key: string;
  date: string;
  item: PlanItem;
  index: number;
};
type DailyTimeStats = {
  targetTotalMinutes: number;
  savedActualMinutes: number;
  projectActualSeconds: number;
  projectSessionCount: number;
  projectActiveTimerCount: number;
  temporaryTimerSeconds: number;
  liveActualSeconds: number;
  comparableActualSeconds: number;
  differenceSeconds: number | null;
  unplannedActualSeconds: number;
  completedActualMinutes: number;
  incompleteActualMinutes: number;
  unfinishedTargetMinutes: number;
  missingTargetCount: number;
  missingActualCount: number;
  activeTimerCount: number;
  trackedTimerCount: number;
  completedCount: number;
  actualPercent: number;
  actualProgress: number;
};
type TaskDropPlacement = "before" | "after" | "end";
type TaskDropTarget = {
  priority: TaskPriority;
  itemId: string | null;
  placement: TaskDropPlacement;
};
type CloudPayload = {
  plansByDate: PlanBook;
  deletedItemIds: string[];
  customCategories: CustomCategory[];
  complexProjects: ComplexProject[];
  moodBook: MoodBook;
  userProfile: UserProfile;
};

type AuthMode = "sign-in" | "sign-up" | "forgot" | "update-password";
type WorkspaceTab = "tasks" | "projects" | "time" | "export";
type TodayWorkspaceSectionId = "longProjects" | TaskPriority;
type TodayWorkspaceCollapsedState = Record<TodayWorkspaceSectionId, boolean>;

const DEFAULT_TODAY_WORKSPACE_COLLAPSED_STATE: TodayWorkspaceCollapsedState = {
  longProjects: true,
  high: true,
  medium: true,
  low: true,
};

const WORKSPACE_TABS: Array<{
  id: WorkspaceTab;
  label: string;
  toneClass: string;
}> = [
  {
    id: "tasks",
    label: "今日任务",
    toneClass: "border-emerald-100 bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-100/70",
  },
  {
    id: "projects",
    label: "复杂项目",
    toneClass: "border-violet-100 bg-violet-50 text-violet-700 shadow-sm shadow-violet-100/70",
  },
  {
    id: "time",
    label: "用时统计",
    toneClass: "border-sky-100 bg-sky-50 text-sky-700 shadow-sm shadow-sky-100/70",
  },
  {
    id: "export",
    label: "导出/复盘",
    toneClass: "border-amber-100 bg-amber-50 text-amber-800 shadow-sm shadow-amber-100/70",
  },
];

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

type ComplexProjectCompletionFeedback = {
  id: number;
  projectId: string;
  phaseId: string;
  phaseTitle: string;
  progressPercent: number;
  projectCompleted: boolean;
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

type TaskTimersByTaskId = Record<string, TaskTimerState>;

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
  priority: TaskPriority;
  note: string;
  targetMinutes: string;
};

type ComplexProjectForm = {
  title: string;
  category: Category;
  priority: TaskPriority;
  note: string;
  startDate: string;
  endDate: string;
};

type ComplexProjectPhaseForm = {
  title: string;
  note: string;
  startDate: string;
  endDate: string;
  completed: boolean;
};

type ComplexProjectPhaseEdit = {
  projectId: string;
  phaseId: string | null;
};
type ComplexProjectPhaseTimeDetailTarget = {
  projectId: string;
  phaseId: string;
  date: string;
};
type TaskTimeDetailTarget = {
  itemId: string;
  date: string;
};

type TaskInlineField = "category" | "targetMinutes" | "title" | "note";
type TaskInlineFieldEdit = {
  itemId: string;
  field: TaskInlineField;
};

type ChinaHolidayType =
  | "statutory-holiday"
  | "adjusted-workday"
  | "observance"
  | "weekend"
  | "normal";
type ChinaHolidayInfo = {
  date: string;
  name: string;
  isHoliday: boolean;
  isWorkday: boolean;
  type: ChinaHolidayType;
};
type ChinaHolidayDataSource = "fallback" | "cache" | "remote";
type ChinaHolidayYearResult = {
  records: ChinaHolidayInfo[];
  source: ChinaHolidayDataSource;
};
type ChinaHolidaySearchCandidate = {
  date: string;
  name: string;
  priority: number;
};
type ChinaLunarDate = {
  day: number;
  isLeapMonth: boolean;
  month: number;
  year: number;
};
type WeatherStatus = "idle" | "loading" | "ready" | "error" | "permission-denied" | "unavailable";
type WeatherSnapshot = {
  apparentTemperature: number | null;
  humidity: number | null;
  latitude: number;
  longitude: number;
  temperature: number;
  updatedAt: number;
  weatherCode: number;
  windSpeed: number | null;
};
type WeatherState = {
  data: WeatherSnapshot | null;
  isRefreshing: boolean;
  message: string;
  status: WeatherStatus;
};
type WeatherRefreshOptions = {
  force?: boolean;
  silent?: boolean;
};
type WeatherCondition = {
  icon: string;
  text: string;
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
  priority: DEFAULT_PRIORITY,
  note: "",
  targetMinutes: "",
};

function createEmptyComplexProjectForm(dateValue: string): ComplexProjectForm {
  return {
    title: "",
    category: "学习",
    priority: DEFAULT_PRIORITY,
    note: "",
    startDate: dateValue,
    endDate: dateValue,
  };
}

function createComplexProjectFormFromProject(project: ComplexProject): ComplexProjectForm {
  return {
    title: project.title,
    category: project.category,
    priority: normalizePriority(project.priority),
    note: project.note,
    startDate: project.startDate,
    endDate: project.endDate,
  };
}

function createEmptyComplexProjectPhaseForm(
  project: Pick<ComplexProject, "startDate" | "endDate"> | null,
  fallbackDate: string,
): ComplexProjectPhaseForm {
  const startDate = project?.startDate || fallbackDate;

  return {
    title: "",
    note: "",
    startDate,
    endDate: project?.endDate || startDate,
    completed: false,
  };
}

function createComplexProjectPhaseFormFromPhase(
  phase: ComplexProjectPhase,
): ComplexProjectPhaseForm {
  return {
    title: phase.title,
    note: phase.note,
    startDate: phase.startDate,
    endDate: phase.endDate,
    completed: phase.completed,
  };
}

function getComplexProjectProgress(project: ComplexProject) {
  const total = project.phases.length;
  const completed = project.phases.filter((phase) => phase.completed).length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { completed, percent, total };
}

function sortComplexProjectPhases(phases: ComplexProjectPhase[]): ComplexProjectPhase[] {
  return phases
    .map((phase, index) => ({ index, phase }))
    .sort((left, right) => {
      const startDateDifference = left.phase.startDate.localeCompare(right.phase.startDate);

      if (startDateDifference !== 0) {
        return startDateDifference;
      }

      const endDateDifference = left.phase.endDate.localeCompare(right.phase.endDate);

      if (endDateDifference !== 0) {
        return endDateDifference;
      }

      return left.index - right.index;
    })
    .map(({ phase }) => phase);
}

function isDateInRange(dateValue: string, startDate: string, endDate: string): boolean {
  return dateValue >= startDate && dateValue <= endDate;
}

function getCurrentComplexProjectPhase(
  project: ComplexProject,
  dateValue: string,
): ComplexProjectPhase | null {
  const currentPhases = sortComplexProjectPhases(project.phases).filter((phase) =>
    isDateInRange(dateValue, phase.startDate, phase.endDate),
  );

  return (
    currentPhases.find((phase) => !phase.completed) ??
    currentPhases[0] ??
    null
  );
}

function getComplexProjectStatusLabel(status: ComplexProjectStatus): string {
  if (status === "completed") {
    return "已完成";
  }

  if (status === "archived") {
    return "已归档";
  }

  return "进行中";
}

const GANTT_TIMELINE_BASE_WIDTH = 620;
const GANTT_TIMELINE_MIN_WIDTH = 680;
const GANTT_LANE_COLUMN_WIDTH = 72;
const GANTT_LABEL_COLUMN_WIDTH = 220;
const GANTT_ROW_HEIGHT_PX = 96;
const GANTT_EXPORT_HORIZONTAL_PADDING = 96;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const GANTT_PHASE_PALETTE = [
  { background: "#1f8bc3", soft: "#e8f4fb", text: "#ffffff" },
  { background: "#f59e0b", soft: "#fff4db", text: "#ffffff" },
  { background: "#d63a0c", soft: "#fff0e9", text: "#ffffff" },
  { background: "#fff200", soft: "#fffbd2", text: "#9a5f00" },
  { background: "#41a82e", soft: "#edf8e9", text: "#ffffff" },
  { background: "#a22b91", soft: "#f8ebf7", text: "#ffffff" },
] as const;

type ComplexProjectGanttUnit = "day" | "week" | "month";
type ComplexProjectGanttPhaseColor = (typeof GANTT_PHASE_PALETTE)[number];

type ComplexProjectGanttTick = {
  dateValue: string;
  label: string;
  leftPercent: number;
  widthPercent: number;
};

type ComplexProjectGanttPhaseLayout = {
  dateLabelPlacement: "inside" | "below";
  durationDays: number;
  endPercent: number;
  labelAlign: "start" | "end";
  leftPercent: number;
  phase: ComplexProjectPhase;
  shortDateLabel: string;
  widthPercent: number;
};

type ComplexProjectGanttModel = {
  chartMinWidth: number;
  phaseLayouts: ComplexProjectGanttPhaseLayout[];
  tickMinWidth: number;
  ticks: ComplexProjectGanttTick[];
  totalDays: number;
  unit: ComplexProjectGanttUnit;
  unitCount: number;
};

type ComplexProjectGanttAxisMarker = {
  dateValue: string;
  isBoundary: boolean;
  label: string;
  leftPercent: number;
};

type ComplexProjectGanttLayoutMetrics = {
  ganttGridTemplateColumns: string;
  ganttMinWidth: number;
  rowHeightPx: number;
  timelineMinWidth: number;
};

type XmindTopic = {
  children?: {
    attached: XmindTopic[];
  };
  class: "topic";
  id: string;
  title: string;
};

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function getInclusiveDayCount(startDate: string, endDate: string): number {
  const start = parseDateInputValue(startDate);
  const end = parseDateInputValue(endDate);
  const difference = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);

  return Math.max(1, difference + 1);
}

function getGanttShortDateLabel(dateValue: string): string {
  const date = parseDateInputValue(dateValue);

  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function getGanttShortDateRangeLabel(startDate: string, endDate: string): string {
  const startLabel = getGanttShortDateLabel(startDate);
  const endLabel = getGanttShortDateLabel(endDate);

  return startLabel === endLabel ? startLabel : `${startLabel}-${endLabel}`;
}

function getGanttMonthLabel(dateValue: string): string {
  const date = parseDateInputValue(dateValue);

  return `${date.getMonth() + 1}月`;
}

function getDaysBetweenDates(startDate: Date, endDate: Date): number {
  return Math.round((endDate.getTime() - startDate.getTime()) / MS_PER_DAY);
}

function getGanttPhaseColor(index: number): ComplexProjectGanttPhaseColor {
  return GANTT_PHASE_PALETTE[index % GANTT_PHASE_PALETTE.length];
}

function getComplexProjectGanttModel(project: ComplexProject): ComplexProjectGanttModel {
  const totalDays = getInclusiveDayCount(project.startDate, project.endDate);
  const unit: ComplexProjectGanttUnit =
    totalDays <= 30 ? "day" : totalDays <= 90 ? "week" : "month";
  const unitSize = unit === "day" ? 1 : 7;
  const unitCount = Math.max(
    1,
    unit === "month" ? 1 : Math.ceil(totalDays / unitSize),
  );
  const projectStart = parseDateInputValue(project.startDate);
  const projectEndExclusive = addDays(projectStart, totalDays);
  const ticks: ComplexProjectGanttTick[] =
    unit === "month"
      ? (() => {
          const monthTicks: ComplexProjectGanttTick[] = [];
          let cursor = new Date(
            projectStart.getFullYear(),
            projectStart.getMonth(),
            projectStart.getDate(),
          );

          while (cursor < projectEndExclusive) {
            const nextMonthStart = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
            const nextCursor =
              nextMonthStart < projectEndExclusive ? nextMonthStart : projectEndExclusive;
            const startOffset = Math.max(0, getDaysBetweenDates(projectStart, cursor));
            const segmentDays = Math.max(1, getDaysBetweenDates(cursor, nextCursor));
            const dateValue = formatDateInput(cursor);

            const endDateValue = formatDateInput(addDays(nextCursor, -1));

            monthTicks.push({
              dateValue,
              label: getGanttShortDateRangeLabel(dateValue, endDateValue),
              leftPercent: (startOffset / totalDays) * 100,
              widthPercent: (segmentDays / totalDays) * 100,
            });
            cursor = nextCursor;
          }

          return monthTicks.length > 0
            ? monthTicks
            : [
                {
                  dateValue: project.startDate,
                  label: getGanttMonthLabel(project.startDate),
                  leftPercent: 0,
                  widthPercent: 100,
                },
              ];
        })()
      : Array.from({ length: unitCount }, (_, index) => {
          const startOffset = index * unitSize;
          const segmentDays = Math.max(1, Math.min(unitSize, totalDays - startOffset));
          const tickDate = addDays(projectStart, startOffset);
          const dateValue = formatDateInput(tickDate);
          const endDateValue = formatDateInput(addDays(tickDate, segmentDays - 1));

          return {
            dateValue,
            label:
              unit === "day"
                ? getGanttShortDateLabel(dateValue)
                : getGanttShortDateRangeLabel(dateValue, endDateValue),
            leftPercent: (startOffset / totalDays) * 100,
            widthPercent: (segmentDays / totalDays) * 100,
          };
        });
  const resolvedUnitCount = ticks.length;
  const tickMinWidth = unit === "day" ? 42 : unit === "week" ? 78 : 94;
  const chartMinWidth = Math.max(GANTT_TIMELINE_BASE_WIDTH, resolvedUnitCount * tickMinWidth);

  const phaseLayouts = sortComplexProjectPhases(project.phases).map((phase) => {
    const phaseStartOffset = Math.max(
      0,
      Math.round(
        (parseDateInputValue(phase.startDate).getTime() - projectStart.getTime()) / MS_PER_DAY,
      ),
    );
    const phaseEndOffset = Math.min(
      totalDays - 1,
      Math.max(
        phaseStartOffset,
        Math.round(
          (parseDateInputValue(phase.endDate).getTime() - projectStart.getTime()) / MS_PER_DAY,
        ),
      ),
    );
    const durationDays = Math.max(1, phaseEndOffset - phaseStartOffset + 1);
    const widthPercent = Math.max((durationDays / totalDays) * 100, 0.5);
    const leftPercent = Math.min(99.5, (phaseStartOffset / totalDays) * 100);
    const estimatedBarWidth = (chartMinWidth * widthPercent) / 100;
    const dateLabelPlacement: ComplexProjectGanttPhaseLayout["dateLabelPlacement"] =
      estimatedBarWidth >= 92 ? "inside" : "below";
    const labelAlign: ComplexProjectGanttPhaseLayout["labelAlign"] =
      leftPercent + widthPercent >= 84 ? "end" : "start";

    return {
      dateLabelPlacement,
      durationDays,
      endPercent: Math.min(100, leftPercent + widthPercent),
      labelAlign,
      leftPercent,
      phase,
      shortDateLabel: getGanttShortDateRangeLabel(phase.startDate, phase.endDate),
      widthPercent,
    };
  });

  return {
    chartMinWidth,
    phaseLayouts,
    tickMinWidth,
    ticks,
    totalDays,
    unit,
    unitCount: resolvedUnitCount,
  };
}

function getComplexProjectGanttLayoutMetrics(
  model: ComplexProjectGanttModel,
): ComplexProjectGanttLayoutMetrics {
  const timelineMinWidth = Math.max(GANTT_TIMELINE_MIN_WIDTH, model.chartMinWidth);
  const ganttGridTemplateColumns = `${GANTT_LANE_COLUMN_WIDTH}px ${GANTT_LABEL_COLUMN_WIDTH}px minmax(${timelineMinWidth}px, 1fr)`;
  const ganttMinWidth = GANTT_LANE_COLUMN_WIDTH + GANTT_LABEL_COLUMN_WIDTH + timelineMinWidth;

  return {
    ganttGridTemplateColumns,
    ganttMinWidth,
    rowHeightPx: GANTT_ROW_HEIGHT_PX,
    timelineMinWidth,
  };
}

function getComplexProjectGanttExportMinWidth(project: ComplexProject): number {
  const model = getComplexProjectGanttModel(project);
  const { ganttMinWidth } = getComplexProjectGanttLayoutMetrics(model);

  return ganttMinWidth + GANTT_EXPORT_HORIZONTAL_PADDING;
}

function getComplexProjectGanttAxisMarkers(
  project: ComplexProject,
  model: ComplexProjectGanttModel,
): ComplexProjectGanttAxisMarker[] {
  const projectStart = parseDateInputValue(project.startDate);
  const markerMap = new Map<string, ComplexProjectGanttAxisMarker>();
  const addMarker = (dateValue: string, useEndPosition = false, isBoundary = false) => {
    const rawOffset = getDaysBetweenDates(projectStart, parseDateInputValue(dateValue));
    const offset = Math.max(0, Math.min(model.totalDays, rawOffset + (useEndPosition ? 1 : 0)));
    const leftPercent =
      dateValue === project.startDate && !useEndPosition ? 0 : (offset / model.totalDays) * 100;
    const existing = markerMap.get(dateValue);

    markerMap.set(dateValue, {
      dateValue,
      isBoundary: Boolean(existing?.isBoundary || isBoundary),
      label: getGanttShortDateLabel(dateValue),
      leftPercent: existing ? Math.max(existing.leftPercent, leftPercent) : leftPercent,
    });
  };

  addMarker(project.startDate);
  model.phaseLayouts.forEach(({ phase }) => {
    addMarker(phase.startDate);
    addMarker(phase.endDate, true, true);
  });
  addMarker(project.endDate, true);

  const minVisibleGapPercent = model.unit === "day" ? 5 : model.unit === "week" ? 7 : 8;

  return Array.from(markerMap.values())
    .sort((left, right) => left.leftPercent - right.leftPercent)
    .reduce<ComplexProjectGanttAxisMarker[]>((visibleMarkers, marker) => {
      const previous = visibleMarkers[visibleMarkers.length - 1];

      if (!previous || Math.abs(marker.leftPercent - previous.leftPercent) >= minVisibleGapPercent) {
        visibleMarkers.push(marker);
        return visibleMarkers;
      }

      if (marker.isBoundary && !previous.isBoundary) {
        visibleMarkers[visibleMarkers.length - 1] = marker;
      }

      return visibleMarkers;
    }, []);
}

function sanitizeExportFileNamePart(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 48);

  return cleaned || "未命名项目";
}

async function captureGanttElement(element: HTMLElement): Promise<HTMLCanvasElement> {
  if ("fonts" in document) {
    await document.fonts.ready;
  }

  await waitForImages(element);

  const elementRect = element.getBoundingClientRect();
  const ganttContent = element.querySelector<HTMLElement>("[data-gantt-content]");
  const contentWidth = ganttContent
    ? Math.ceil(
        Math.max(0, ganttContent.getBoundingClientRect().left - elementRect.left) +
          ganttContent.scrollWidth +
          32,
      )
    : 0;
  const width = Math.max(Math.ceil(element.scrollWidth), contentWidth);
  const height = Math.ceil(element.scrollHeight);

  return html2canvas(element, {
    backgroundColor: "#fffaf4",
    height,
    logging: false,
    onclone: (_clonedDocument, clonedElement) => {
      clonedElement.style.overflow = "visible";
      clonedElement.style.width = `${width}px`;
      clonedElement.querySelectorAll<HTMLElement>("[data-gantt-scroll-region]").forEach((node) => {
        node.style.overflow = "visible";
      });
      clonedElement.querySelectorAll<HTMLElement>("[data-gantt-legend-item]").forEach((node) => {
        node.style.alignItems = "center";
        node.style.columnGap = "8px";
        node.style.display = "inline-grid";
        node.style.gridTemplateColumns = "36px max-content";
        node.style.height = "32px";
        node.style.lineHeight = "16px";
      });
      clonedElement.querySelectorAll<HTMLElement>("[data-gantt-legend-text]").forEach((node) => {
        node.style.display = "block";
        node.style.height = "16px";
        node.style.lineHeight = "16px";
        node.style.transform = "translateY(-6px)";
        node.style.whiteSpace = "nowrap";
      });
      clonedElement.querySelectorAll<HTMLElement>("[data-gantt-legend-swatch]").forEach((node) => {
        node.style.alignSelf = "center";
        node.style.display = "block";
      });
      clonedElement.querySelectorAll<HTMLElement>("[data-gantt-legend-pill]").forEach((node) => {
        node.style.alignItems = "center";
        node.style.display = "inline-grid";
        node.style.height = "32px";
        node.style.justifyContent = "center";
        node.style.lineHeight = "16px";
      });
      clonedElement.querySelectorAll<HTMLElement>("[data-gantt-priority-pill]").forEach((node) => {
        node.style.alignItems = "center";
        node.style.columnGap = "6px";
        node.style.display = "inline-grid";
        node.style.gridAutoFlow = "column";
        node.style.height = "32px";
        node.style.justifyContent = "center";
        node.style.lineHeight = "16px";
      });
      clonedElement.querySelectorAll<HTMLElement>("[data-gantt-label-text]").forEach((node) => {
        node.style.lineHeight = "1.6";
        node.style.overflow = "visible";
        node.style.whiteSpace = "normal";
      });
    },
    scale: 2,
    useCORS: true,
    width,
    windowHeight: height,
    windowWidth: width,
  });
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.download = fileName;
  link.href = url;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 800);
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let index = 0; index < table.length; index += 1) {
    let value = index;

    for (let bitIndex = 0; bitIndex < 8; bitIndex += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
})();

function getCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;

  bytes.forEach((byte) => {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  });

  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16LittleEndian(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32LittleEndian(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function toBlobPart(bytes: Uint8Array): BlobPart {
  const buffer = new ArrayBuffer(bytes.byteLength);

  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function createStoredZipBlob(
  entries: Array<{ content: string | Uint8Array; path: string }>,
): Blob {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  entries.forEach((entry) => {
    const nameBytes = encoder.encode(entry.path);
    const contentBytes =
      typeof entry.content === "string" ? encoder.encode(entry.content) : entry.content;
    const crc32 = getCrc32(contentBytes);
    const localHeader = new Uint8Array(30 + nameBytes.length);

    writeUint32LittleEndian(localHeader, 0, 0x04034b50);
    writeUint16LittleEndian(localHeader, 4, 20);
    writeUint16LittleEndian(localHeader, 6, 0);
    writeUint16LittleEndian(localHeader, 8, 0);
    writeUint16LittleEndian(localHeader, 10, 0);
    writeUint16LittleEndian(localHeader, 12, 0);
    writeUint32LittleEndian(localHeader, 14, crc32);
    writeUint32LittleEndian(localHeader, 18, contentBytes.length);
    writeUint32LittleEndian(localHeader, 22, contentBytes.length);
    writeUint16LittleEndian(localHeader, 26, nameBytes.length);
    writeUint16LittleEndian(localHeader, 28, 0);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    writeUint32LittleEndian(centralHeader, 0, 0x02014b50);
    writeUint16LittleEndian(centralHeader, 4, 20);
    writeUint16LittleEndian(centralHeader, 6, 20);
    writeUint16LittleEndian(centralHeader, 8, 0);
    writeUint16LittleEndian(centralHeader, 10, 0);
    writeUint16LittleEndian(centralHeader, 12, 0);
    writeUint16LittleEndian(centralHeader, 14, 0);
    writeUint32LittleEndian(centralHeader, 16, crc32);
    writeUint32LittleEndian(centralHeader, 20, contentBytes.length);
    writeUint32LittleEndian(centralHeader, 24, contentBytes.length);
    writeUint16LittleEndian(centralHeader, 28, nameBytes.length);
    writeUint16LittleEndian(centralHeader, 30, 0);
    writeUint16LittleEndian(centralHeader, 32, 0);
    writeUint16LittleEndian(centralHeader, 34, 0);
    writeUint16LittleEndian(centralHeader, 36, 0);
    writeUint32LittleEndian(centralHeader, 38, 0);
    writeUint32LittleEndian(centralHeader, 42, offset);
    centralHeader.set(nameBytes, 46);

    localParts.push(localHeader, contentBytes);
    centralParts.push(centralHeader);
    offset += localHeader.length + contentBytes.length;
  });

  const centralDirectorySize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endOfCentralDirectory = new Uint8Array(22);
  writeUint32LittleEndian(endOfCentralDirectory, 0, 0x06054b50);
  writeUint16LittleEndian(endOfCentralDirectory, 4, 0);
  writeUint16LittleEndian(endOfCentralDirectory, 6, 0);
  writeUint16LittleEndian(endOfCentralDirectory, 8, entries.length);
  writeUint16LittleEndian(endOfCentralDirectory, 10, entries.length);
  writeUint32LittleEndian(endOfCentralDirectory, 12, centralDirectorySize);
  writeUint32LittleEndian(endOfCentralDirectory, 16, offset);
  writeUint16LittleEndian(endOfCentralDirectory, 20, 0);

  return new Blob([...localParts, ...centralParts, endOfCentralDirectory].map(toBlobPart), {
    type: "application/vnd.xmind.workbook",
  });
}

function createXmindTopic(title: string, children: XmindTopic[] = []): XmindTopic {
  return {
    ...(children.length > 0 ? { children: { attached: children } } : {}),
    class: "topic",
    id: createId(),
    title,
  };
}

function createComplexProjectXmindBlob(project: ComplexProject): Blob {
  const progress = getComplexProjectProgress(project);
  const priorityOption = getPriorityOption(project.priority);
  const sortedPhases = sortComplexProjectPhases(project.phases);
  const phaseTopics = sortedPhases.map((phase) =>
    createXmindTopic(phase.title, [
      createXmindTopic(`日期范围：${phase.startDate} 至 ${phase.endDate}`),
      createXmindTopic(`完成状态：${phase.completed ? "已完成" : "未完成"}`),
      createXmindTopic(`备注：${phase.note || "无"}`),
    ]),
  );
  const overviewTopics = [
    createXmindTopic(`分类：${project.category}`),
    createXmindTopic(`优先级：${priorityOption.name}`),
    createXmindTopic(`项目日期：${project.startDate} 至 ${project.endDate}`),
    createXmindTopic(`项目状态：${getComplexProjectStatusLabel(project.status)}`),
    createXmindTopic(`阶段进度：${progress.completed} / ${progress.total}（${progress.percent}%）`),
    createXmindTopic(`备注：${project.note || "无"}`),
  ];
  const sheetId = createId();
  const content = [
    {
      class: "sheet",
      id: sheetId,
      rootTopic: createXmindTopic(project.title, [
        createXmindTopic("项目概览", overviewTopics),
        createXmindTopic(
          "阶段计划",
          phaseTopics.length > 0 ? phaseTopics : [createXmindTopic("暂未添加阶段")],
        ),
        createXmindTopic("风险与调整记录", [createXmindTopic("可在 Xmind 中继续补充")]),
        createXmindTopic("复盘", [createXmindTopic("可在项目完成后补充经验与下一步")]),
      ]),
      title: project.title,
      topicPositioning: "fixed",
    },
  ];
  const metadata = {
    activeSheetId: sheetId,
    creator: {
      name: "每日计划手帐",
      version: "0.1.0",
    },
    modified: new Date(project.updatedAt ?? project.createdAt).toISOString(),
  };
  const manifest = {
    "file-entries": {
      "content.json": {},
      "manifest.json": {},
      "metadata.json": {},
    },
  };

  return createStoredZipBlob([
    { content: JSON.stringify(content, null, 2), path: "content.json" },
    { content: JSON.stringify(metadata, null, 2), path: "metadata.json" },
    { content: JSON.stringify(manifest, null, 2), path: "manifest.json" },
  ]);
}

const PPTX_FONT_FACE = "Microsoft YaHei";
const PPTX_SLIDE_WIDTH = 13.333;
const PPTX_SLIDE_HEIGHT = 7.5;
const PPTX_GANTT_ROWS_PER_SLIDE = 6;

type PptxInstance = InstanceType<typeof pptxgen>;
type PptxSlide = ReturnType<PptxInstance["addSlide"]>;
type PptxTextOptions = NonNullable<Parameters<PptxSlide["addText"]>[1]>;

function getPptxHexColor(color: string): string {
  return color.replace("#", "").toUpperCase();
}

function clampPptxPosition(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function chunkItems<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function addEditablePptxText(slide: PptxSlide, text: string, options: PptxTextOptions) {
  slide.addText(text, {
    breakLine: false,
    color: "26364D",
    fit: "shrink",
    fontFace: PPTX_FONT_FACE,
    margin: 0.02,
    valign: "middle",
    ...options,
  });
}

function addEditablePptxPill(
  slide: PptxSlide,
  pptx: PptxInstance,
  text: string,
  options: {
    fillColor: string;
    fontSize?: number;
    h: number;
    textColor: string;
    w: number;
    x: number;
    y: number;
  },
) {
  slide.addShape(pptx.ShapeType.roundRect, {
    fill: { color: options.fillColor },
    h: options.h,
    line: { color: options.fillColor, transparency: 100 },
    w: options.w,
    x: options.x,
    y: options.y,
  });
  addEditablePptxText(slide, text, {
    align: "center",
    bold: true,
    color: options.textColor,
    fontSize: options.fontSize ?? 7,
    h: options.h,
    margin: 0,
    w: options.w,
    x: options.x,
    y: options.y,
  });
}

function getEditablePptxTextWidth(text: string, minWidth: number, maxWidth: number): number {
  const estimatedWidth = Array.from(text).reduce(
    (width, character) => width + (character.charCodeAt(0) > 255 ? 0.15 : 0.075),
    0.16,
  );

  return clampPptxPosition(estimatedWidth, minWidth, maxWidth);
}

async function createComplexProjectGanttEditablePptx(project: ComplexProject): Promise<void> {
  const pptx = new pptxgen();
  const progress = getComplexProjectProgress(project);
  const priorityOption = getPriorityOption(project.priority);
  const model = getComplexProjectGanttModel(project);
  const axisMarkers = getComplexProjectGanttAxisMarkers(project, model);
  const phasePages = chunkItems(model.phaseLayouts, PPTX_GANTT_ROWS_PER_SLIDE);
  const pages = phasePages.length > 0 ? phasePages : [[]];
  const timelineScaleLabel =
    model.unit === "day" ? "按天显示" : model.unit === "week" ? "按周显示" : "按月显示";

  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "每日计划手帐";
  pptx.company = "每日计划手帐";
  pptx.subject = "复杂项目甘特图";
  pptx.title = project.title;
  pptx.theme = {
    bodyFontFace: PPTX_FONT_FACE,
    headFontFace: PPTX_FONT_FACE,
  };

  pages.forEach((phaseRows, pageIndex) => {
    const slide = pptx.addSlide();
    const cardX = 0.18;
    const cardY = 0.12;
    const cardW = PPTX_SLIDE_WIDTH - cardX * 2;
    const cardH = PPTX_SLIDE_HEIGHT - cardY * 2;
    const innerX = 0.5;
    const innerW = PPTX_SLIDE_WIDTH - innerX * 2;
    const laneW = 0.9;
    const labelW = 2.85;
    const chartX = innerX + laneW + labelW;
    const chartW = innerW - laneW - labelW;
    const headerY = 0.42;
    const legendY = 1.5;
    const axisLabelY = 2.32;
    const axisY = 2.58;
    const tableY = 3.02;
    const rowH = phaseRows.length >= 6 ? 0.62 : phaseRows.length >= 5 ? 0.72 : 0.84;
    const tableH = Math.max(0.88, phaseRows.length * rowH);
    const pageLabel =
      pages.length > 1 ? `第 ${pageIndex + 1} / ${pages.length} 页` : "";

    slide.background = { color: "FFFAF4" };
    slide.addShape(pptx.ShapeType.rect, {
      fill: { color: "FFFAF4" },
      h: PPTX_SLIDE_HEIGHT,
      line: { color: "FFFAF4", transparency: 100 },
      w: PPTX_SLIDE_WIDTH,
      x: 0,
      y: 0,
    });
    slide.addShape(pptx.ShapeType.roundRect, {
      fill: { color: "F3F8FD" },
      h: cardH,
      line: { color: "DBEAFE", transparency: 0, width: 0.65 },
      w: cardW,
      x: cardX,
      y: cardY,
    });

    addEditablePptxText(slide, "复杂项目甘特图", {
      bold: true,
      color: "0369A1",
      fontSize: 8,
      h: 0.28,
      margin: 0.01,
      w: 1.88,
      x: innerX,
      y: headerY - 0.02,
    });
    addEditablePptxText(slide, project.title, {
      bold: true,
      color: "26364D",
      fontSize: 22,
      h: 0.38,
      w: 4.4,
      x: innerX,
      y: headerY + 0.28,
    });
    addEditablePptxText(
      slide,
      `计划安排：${getGanttShortDateRangeLabel(project.startDate, project.endDate)} · 阶段 ${progress.total} 项 · 已完成 ${progress.completed} 项 · ${timelineScaleLabel}`,
      {
        bold: true,
        color: "5D6B7E",
        fontSize: 10,
        h: 0.24,
        w: 5.9,
        x: innerX,
        y: headerY + 0.78,
      },
    );

    let legendX = innerX;
    const legendItems = model.phaseLayouts.slice(0, 4);
    (legendItems.length > 0 ? legendItems : [{ phase: null }]).forEach((item, index) => {
      const phaseTitle = item.phase?.title ?? "阶段任务";
      const color = getGanttPhaseColor(index);
      const textW = getEditablePptxTextWidth(phaseTitle, 0.55, 1.45);

      slide.addShape(pptx.ShapeType.roundRect, {
        fill: { color: getPptxHexColor(color.background) },
        h: 0.12,
        line: { color: getPptxHexColor(color.background), transparency: 100 },
        w: 0.42,
        x: legendX,
        y: legendY + 0.09,
      });
      addEditablePptxText(slide, phaseTitle, {
        bold: true,
        color: "5D6B7E",
        fontSize: 8,
        h: 0.22,
        w: textW,
        x: legendX + 0.55,
        y: legendY + 0.02,
      });
      legendX += 0.55 + textW + 0.38;
    });
    if (model.phaseLayouts.length > 4) {
      addEditablePptxText(slide, `+${model.phaseLayouts.length - 4} 个阶段`, {
        bold: true,
        color: "5D6B7E",
        fontSize: 8,
        h: 0.22,
        w: 0.8,
        x: legendX,
        y: legendY + 0.02,
      });
      legendX += 0.95;
    }
    addEditablePptxPill(slide, pptx, project.category, {
      fillColor: "FFFFFF",
      h: 0.32,
      textColor: "0369A1",
      w: Math.max(0.65, getEditablePptxTextWidth(project.category, 0.5, 1.1) + 0.25),
      x: legendX,
      y: legendY - 0.03,
    });
    addEditablePptxPill(slide, pptx, `${priorityOption.icon} ${priorityOption.name}`, {
      fillColor: "FFFFFF",
      h: 0.32,
      textColor: "6D28D9",
      w: 1.15,
      x: legendX + 1,
      y: legendY - 0.03,
    });

    slide.addShape(pptx.ShapeType.line, {
      h: 0,
      line: { color: "9EB9D2", transparency: 0, width: 0.8 },
      w: chartW,
      x: chartX,
      y: axisY,
    });
    axisMarkers.forEach((marker) => {
      const markerX = chartX + (marker.leftPercent / 100) * chartW;
      const labelW = 0.58;
      const labelX =
        marker.leftPercent <= 2
          ? markerX
          : marker.leftPercent >= 98
            ? markerX - labelW
            : markerX - labelW / 2;

      slide.addShape(pptx.ShapeType.line, {
        h: 0.2,
        line: { color: "9EB9D2", transparency: 12, width: 0.45 },
        w: 0,
        x: markerX,
        y: axisY - 0.08,
      });
      addEditablePptxText(slide, marker.label, {
        align: marker.leftPercent <= 2 ? "left" : marker.leftPercent >= 98 ? "right" : "center",
        bold: true,
        color: "516477",
        fontSize: 8,
        h: 0.2,
        margin: 0,
        w: labelW,
        x: clampPptxPosition(labelX, chartX, chartX + chartW - labelW),
        y: axisLabelY,
      });
    });

    if (phaseRows.length === 0) {
      slide.addShape(pptx.ShapeType.roundRect, {
        fill: { color: "FFFFFF", transparency: 8 },
        h: 0.7,
        line: { color: "BAE6FD", dashType: "dash", width: 0.8 },
        w: innerW,
        x: innerX,
        y: tableY,
      });
      addEditablePptxText(slide, "暂无阶段，添加阶段后即可生成甘特图横条。", {
        align: "center",
        bold: true,
        color: "66788A",
        fontSize: 10,
        h: 0.22,
        w: innerW,
        x: innerX,
        y: tableY + 0.24,
      });
      return;
    }

    slide.addShape(pptx.ShapeType.roundRect, {
      fill: { color: "FFFFFF", transparency: 8 },
      h: tableH,
      line: { color: "DBEAFE", transparency: 0, width: 0.7 },
      w: innerW,
      x: innerX,
      y: tableY,
    });
    slide.addShape(pptx.ShapeType.roundRect, {
      fill: { color: "43A62D" },
      h: tableH,
      line: { color: "43A62D", transparency: 100 },
      w: laneW,
      x: innerX,
      y: tableY,
    });
    addEditablePptxText(slide, "项目\n阶段", {
      align: "center",
      bold: true,
      breakLine: false,
      color: "FFFFFF",
      fontSize: 18,
      fit: "shrink",
      h: tableH,
      margin: 0.02,
      valign: "middle",
      w: laneW,
      x: innerX,
      y: tableY,
    });

    phaseRows.forEach(({ phase }, rowIndex) => {
      const globalRowIndex = pageIndex * PPTX_GANTT_ROWS_PER_SLIDE + rowIndex;
      const color = getGanttPhaseColor(globalRowIndex);
      const rowY = tableY + rowIndex * rowH;
      const statusFill = phase.completed ? "D1FAE5" : "FEF3C7";
      const statusText = phase.completed ? "047857" : "92400E";

      slide.addShape(pptx.ShapeType.rect, {
        fill: { color: getPptxHexColor(color.soft) },
        h: rowH,
        line: { color: "EAF3FB", transparency: 0, width: 0.4 },
        w: labelW,
        x: innerX + laneW,
        y: rowY,
      });
      addEditablePptxText(slide, phase.title, {
        bold: true,
        color: "334155",
        fontSize: 9,
        h: 0.2,
        w: labelW - 0.8,
        x: innerX + laneW + 0.18,
        y: rowY + rowH * 0.22,
      });
      addEditablePptxPill(slide, pptx, phase.completed ? "已完成" : "未完成", {
        fillColor: statusFill,
        fontSize: 6.5,
        h: 0.2,
        textColor: statusText,
        w: 0.58,
        x: innerX + laneW + labelW - 0.72,
        y: rowY + rowH * 0.2,
      });
      addEditablePptxText(slide, `${phase.startDate} 至 ${phase.endDate}`, {
        bold: true,
        color: "66788A",
        fontSize: 7.5,
        h: 0.2,
        w: labelW - 0.35,
        x: innerX + laneW + 0.18,
        y: rowY + rowH * 0.56,
      });
      if (phase.note) {
        addEditablePptxText(slide, phase.note, {
          bold: true,
          color: "8A98A8",
          fontSize: 6.5,
          h: 0.16,
          w: labelW - 0.35,
          x: innerX + laneW + 0.18,
          y: rowY + rowH * 0.78,
        });
      }

      slide.addShape(pptx.ShapeType.rect, {
        fill: { color: "FFFFFF" },
        h: rowH,
        line: { color: "EAF3FB", transparency: 0, width: 0.4 },
        w: chartW,
        x: chartX,
        y: rowY,
      });
    });

    axisMarkers.forEach((marker) => {
      const markerX = chartX + (marker.leftPercent / 100) * chartW;

      slide.addShape(pptx.ShapeType.line, {
        h: tableH,
        line: {
          color: marker.isBoundary ? "EF4444" : "EAF3FB",
          dashType: marker.isBoundary ? "dash" : undefined,
          transparency: marker.isBoundary ? 12 : 0,
          width: marker.isBoundary ? 0.55 : 0.35,
        },
        w: 0,
        x: markerX,
        y: tableY,
      });
    });

    phaseRows.forEach(({ leftPercent, phase, widthPercent }, rowIndex) => {
      const globalRowIndex = pageIndex * PPTX_GANTT_ROWS_PER_SLIDE + rowIndex;
      const color = getGanttPhaseColor(globalRowIndex);
      const rowY = tableY + rowIndex * rowH;
      const barX = chartX + (leftPercent / 100) * chartW;
      const barW = Math.max(0.16, (widthPercent / 100) * chartW);

      slide.addShape(pptx.ShapeType.roundRect, {
        fill: { color: getPptxHexColor(color.background) },
        h: 0.32,
        line: { color: getPptxHexColor(color.background), transparency: 100 },
        w: barW,
        x: barX,
        y: rowY + rowH / 2 - 0.16,
      });
    });

    if (pageLabel) {
      addEditablePptxText(slide, pageLabel, {
        align: "right",
        bold: true,
        color: "66788A",
        fontSize: 7,
        h: 0.18,
        w: 1.2,
        x: PPTX_SLIDE_WIDTH - 1.62,
        y: PPTX_SLIDE_HEIGHT - 0.42,
      });
    }
  });

  await pptx.writeFile({
    compression: true,
    fileName: `复杂项目甘特图-${sanitizeExportFileNamePart(project.title)}.pptx`,
  });
}

function ComplexProjectGanttChart({ project }: { project: ComplexProject }) {
  const progress = getComplexProjectProgress(project);
  const priorityOption = getPriorityOption(project.priority);
  const model = getComplexProjectGanttModel(project);
  const phaseRows = model.phaseLayouts;
  const { ganttGridTemplateColumns, ganttMinWidth, rowHeightPx, timelineMinWidth } =
    getComplexProjectGanttLayoutMetrics(model);
  const timelineScaleLabel =
    model.unit === "day" ? "按天显示" : model.unit === "week" ? "按周显示" : "按月显示";
  const axisMarkers = getComplexProjectGanttAxisMarkers(project, model);
  const legendItems = phaseRows.slice(0, 4);

  return (
    <section
      className="rounded-[1.35rem] border border-sky-100 bg-[#f3f8fd] p-4 text-[#26364d] shadow-sm shadow-sky-100"
    >
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="text-xs font-black text-sky-700">复杂项目甘特图</p>
          <h4 className="mt-1 break-words text-xl font-black">
            {project.title}
          </h4>
          <p className="mt-2 text-sm font-bold leading-6 text-[#5d6b7e]">
            计划安排：{getGanttShortDateRangeLabel(project.startDate, project.endDate)} · 阶段{" "}
            {progress.total} 项 · 已完成 {progress.completed} 项 · {timelineScaleLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-3 text-xs font-bold leading-4 text-[#5d6b7e]">
          {legendItems.length > 0 ? (
            legendItems.map(({ phase }, index) => {
              const color = getGanttPhaseColor(index);

              return (
                <span
                  className="inline-grid h-8 grid-cols-[2.25rem_max-content] items-center gap-2 leading-4"
                  data-gantt-legend-item="true"
                  key={phase.id}
                >
                  <span
                    className="block h-3 w-9 self-center rounded-full"
                    data-gantt-legend-swatch="true"
                    style={{ backgroundColor: color.background }}
                  />
                  <span
                    className="block h-4 translate-y-[-1px] whitespace-nowrap leading-4"
                    data-gantt-legend-text="true"
                  >
                    {phase.title}
                  </span>
                </span>
              );
            })
          ) : (
            <span
              className="inline-grid h-8 grid-cols-[2.25rem_max-content] items-center gap-2 leading-4"
              data-gantt-legend-item="true"
            >
              <span
                className="block h-3 w-9 self-center rounded-full bg-sky-600"
                data-gantt-legend-swatch="true"
              />
              <span
                className="block h-4 translate-y-[-1px] whitespace-nowrap leading-4"
                data-gantt-legend-text="true"
              >
                阶段任务
              </span>
            </span>
          )}
          {phaseRows.length > 4 ? <span>+{phaseRows.length - 4} 个阶段</span> : null}
          <span
            className="inline-grid h-8 min-w-16 place-items-center rounded-full bg-white/90 px-4 font-black leading-4 text-sky-700"
            data-gantt-legend-pill="true"
          >
            <span
              className="block h-4 translate-y-[-1px] whitespace-nowrap leading-4"
              data-gantt-legend-text="true"
            >
              {project.category}
            </span>
          </span>
          <span
            className="inline-grid h-8 min-w-28 grid-flow-col items-center justify-center gap-1.5 rounded-full bg-white/90 px-4 font-black leading-4 text-violet-700"
            data-gantt-legend-pill="true"
            data-gantt-priority-pill="true"
          >
            <span
              className="block h-4 w-4 translate-y-[-1px] text-center text-[13px] leading-4"
              data-gantt-legend-text="true"
            >
              {priorityOption.icon}
            </span>
            <span
              className="block h-4 translate-y-[-1px] whitespace-nowrap leading-4"
              data-gantt-legend-text="true"
            >
              {priorityOption.name}
            </span>
          </span>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto pb-2" data-gantt-scroll-region="true">
        <div data-gantt-content="true" style={{ minWidth: ganttMinWidth }}>
          <div
            className="grid items-end"
            style={{
              gridTemplateColumns: ganttGridTemplateColumns,
            }}
          >
            <div />
            <div />
            <div className="relative h-16" style={{ minWidth: timelineMinWidth }}>
              <span aria-hidden="true" className="absolute left-0 right-0 top-8 border-t border-[#9eb9d2]" />
              {axisMarkers.map((marker) => (
                <span
                  aria-hidden="true"
                  className="absolute top-7 h-4 border-l border-[#9eb9d2]"
                  key={`${marker.dateValue}-${marker.leftPercent}-axis-line`}
                  style={{ left: `${marker.leftPercent}%` }}
                />
              ))}
              {axisMarkers.map((marker) => {
                const alignClass =
                  marker.leftPercent <= 2
                    ? "text-left"
                    : marker.leftPercent >= 98
                      ? "text-right"
                      : "-translate-x-1/2 text-center";
                const labelStyle =
                  marker.leftPercent >= 98
                    ? { right: 0 }
                    : { left: `${marker.leftPercent}%` };

                return (
                  <span
                    className={`absolute top-0 whitespace-nowrap text-xs font-bold text-[#516477] ${alignClass}`}
                    key={`${marker.dateValue}-${marker.leftPercent}`}
                    style={labelStyle}
                  >
                    {marker.label}
                  </span>
                );
              })}
            </div>
          </div>

          {phaseRows.length > 0 ? (
            <div
              className="grid overflow-hidden rounded-[1.15rem] border border-sky-100 bg-white/90 shadow-sm shadow-sky-100"
              style={{
                gridTemplateColumns: ganttGridTemplateColumns,
              }}
            >
              <div
                className="flex items-center justify-center border-r border-sky-100 bg-[#43a62d] px-2 text-center text-lg font-black leading-8 text-white"
                style={{ minHeight: phaseRows.length * rowHeightPx }}
              >
                <span>
                  项目
                  <br />
                  阶段
                </span>
              </div>

              <div className="border-r border-sky-100">
                {phaseRows.map(({ phase }, index) => (
                  <div
                    className="flex min-w-0 flex-col justify-center overflow-visible border-b border-sky-50 px-4 last:border-b-0"
                    key={`${phase.id}-label`}
                    style={{
                      backgroundColor: getGanttPhaseColor(index).soft,
                      height: rowHeightPx,
                    }}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <p
                        className="min-w-0 break-words text-sm font-black leading-6 text-[#334155]"
                        data-gantt-label-text="true"
                        title={phase.title}
                      >
                        {phase.title}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${
                          phase.completed
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {phase.completed ? "已完成" : "未完成"}
                      </span>
                    </div>
                    <p
                      className="mt-1 break-words text-xs font-bold leading-6 text-[#66788a]"
                      data-gantt-label-text="true"
                    >
                      {phase.startDate} 至 {phase.endDate}
                    </p>
                    {phase.note ? (
                      <p
                        className="mt-0.5 break-words text-[10px] font-bold leading-5 text-[#8a98a8]"
                        data-gantt-label-text="true"
                      >
                        {phase.note}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="relative" style={{ minWidth: timelineMinWidth }}>
                {axisMarkers.map((marker) => (
                  <span
                    aria-hidden="true"
                    className={`absolute inset-y-0 z-10 border-l ${
                      marker.isBoundary ? "border-dashed border-red-500" : "border-sky-50"
                    }`}
                    key={`${marker.dateValue}-${marker.leftPercent}-body`}
                    style={{ left: `${marker.leftPercent}%` }}
                  />
                ))}
                {phaseRows.map(
                  ({ leftPercent, phase, widthPercent }, index) => {
                    const color = getGanttPhaseColor(index);

                    return (
                      <div
                        className="relative border-b border-sky-50 last:border-b-0"
                        key={`${phase.id}-timeline`}
                        style={{ height: rowHeightPx }}
                      >
                        <div
                          className="absolute top-1/2 z-20 flex h-8 -translate-y-1/2 items-center justify-center rounded-xl px-2 text-xs font-black leading-4 shadow-sm"
                          style={{
                            backgroundColor: color.background,
                            color: color.text,
                            left: `${leftPercent}%`,
                            minWidth: 16,
                            width: `${widthPercent}%`,
                          }}
                          title={`${phase.title}：${phase.startDate} 至 ${phase.endDate}`}
                        />
                      </div>
                    );
                  },
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-[1rem] border border-dashed border-sky-200 bg-white/80 px-3 py-8 text-center text-sm font-black text-[#66788a]">
              暂无阶段，添加阶段后即可生成甘特图横条。
            </div>
          )}
        </div>
      </div>

    </section>
  );
}

const CHINA_HOLIDAYS_CACHE_PREFIX = "daily-planner-china-holidays";
const CHINA_HOLIDAYS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CHINA_HOLIDAYS_REMOTE_URL: string = "";
const WEATHER_CACHE_KEY = "daily-planner-weather-v1";
const WEATHER_CACHE_TTL_MS = 45 * 60 * 1000;
const WEATHER_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const WEATHER_API_URL = "https://api.open-meteo.com/v1/forecast";
const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"] as const;
const LUNAR_BASE_YEAR = 1900;
const LUNAR_MAX_YEAR = 2100;
const LUNAR_BASE_DATE = new Date(1900, 0, 31);
const CHINA_LUNAR_MONTH_NAMES = [
  "正",
  "二",
  "三",
  "四",
  "五",
  "六",
  "七",
  "八",
  "九",
  "十",
  "冬",
  "腊",
] as const;
const CHINA_LUNAR_DAY_NAMES = [
  "初一",
  "初二",
  "初三",
  "初四",
  "初五",
  "初六",
  "初七",
  "初八",
  "初九",
  "初十",
  "十一",
  "十二",
  "十三",
  "十四",
  "十五",
  "十六",
  "十七",
  "十八",
  "十九",
  "二十",
  "廿一",
  "廿二",
  "廿三",
  "廿四",
  "廿五",
  "廿六",
  "廿七",
  "廿八",
  "廿九",
  "三十",
] as const;
const CHINA_LUNAR_INFO = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
  0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5d0, 0x14573, 0x052d0, 0x0a9a8, 0x0e950, 0x06aa0,
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0,
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
  0x05aa0, 0x076a3, 0x096d0, 0x04bd7, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
  0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0,
  0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4,
  0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0,
  0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160,
  0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252,
  0x0d520,
] as const;
const CHINA_OBSERVANCE_DEFINITIONS = [
  { month: 3, day: 8, name: "妇女节" },
  { month: 3, day: 12, name: "植树节" },
  { month: 5, day: 4, name: "青年节" },
  { month: 5, day: 12, name: "国际护士节" },
  { month: 6, day: 1, name: "儿童节" },
  { month: 7, day: 1, name: "建党节" },
  { month: 8, day: 1, name: "建军节" },
  { month: 8, day: 19, name: "中国医师节" },
  { month: 9, day: 10, name: "教师节" },
  { month: 11, day: 8, name: "记者节" },
] as const;
const CHINA_NAMED_FESTIVAL_DATES_BY_YEAR: Record<
  number,
  Array<{ date: string; name: string }>
> = {
  2025: [
    { date: "2025-01-01", name: "元旦" },
    { date: "2025-01-28", name: "除夕" },
    { date: "2025-01-29", name: "春节" },
    { date: "2025-02-12", name: "元宵节" },
    { date: "2025-04-04", name: "清明节" },
    { date: "2025-05-01", name: "劳动节" },
    { date: "2025-05-31", name: "端午节" },
    { date: "2025-10-01", name: "国庆节" },
    { date: "2025-10-06", name: "中秋节" },
  ],
  2026: [
    { date: "2026-01-01", name: "元旦" },
    { date: "2026-02-16", name: "除夕" },
    { date: "2026-02-17", name: "春节" },
    { date: "2026-03-03", name: "元宵节" },
    { date: "2026-04-05", name: "清明节" },
    { date: "2026-05-01", name: "劳动节" },
    { date: "2026-06-19", name: "端午节" },
    { date: "2026-09-25", name: "中秋节" },
    { date: "2026-10-01", name: "国庆节" },
  ],
};
const CHINA_HOLIDAY_SEARCH_ALIASES_BY_NAME: Record<string, string[]> = {
  元旦: ["新年"],
  除夕: ["除夕夜", "大年三十", "年三十"],
  春节: ["过年", "大年初一", "农历新年"],
  元宵节: ["元宵"],
  妇女节: ["三八", "三八妇女节", "女神节"],
  劳动节: ["五一", "五一劳动节"],
  青年节: ["五四", "五四青年节"],
  国际护士节: ["护士节", "512", "五一二"],
  儿童节: ["六一", "61", "六一儿童节"],
  建党节: ["七一"],
  建军节: ["八一"],
  中国医师节: ["医师节"],
  教师节: ["老师节"],
  国庆节: ["十一", "国庆"],
};
const CHINA_HOLIDAY_FALLBACK_BY_YEAR: Record<number, ChinaHolidayInfo[]> = {
  2025: mergeChinaHolidayRecords(
    createChinaHolidayRecords([
      { end: "2025-01-01", name: "元旦", start: "2025-01-01", type: "statutory-holiday" },
      { end: "2025-02-04", name: "春节", start: "2025-01-28", type: "statutory-holiday" },
      { end: "2025-04-06", name: "清明节", start: "2025-04-04", type: "statutory-holiday" },
      { end: "2025-05-05", name: "劳动节", start: "2025-05-01", type: "statutory-holiday" },
      { end: "2025-06-02", name: "端午节", start: "2025-05-31", type: "statutory-holiday" },
      {
        end: "2025-10-08",
        name: "国庆节/中秋节",
        start: "2025-10-01",
        type: "statutory-holiday",
      },
      { end: "2025-01-26", name: "调休上班", start: "2025-01-26", type: "adjusted-workday" },
      { end: "2025-02-08", name: "调休上班", start: "2025-02-08", type: "adjusted-workday" },
      { end: "2025-04-27", name: "调休上班", start: "2025-04-27", type: "adjusted-workday" },
      { end: "2025-09-28", name: "调休上班", start: "2025-09-28", type: "adjusted-workday" },
      { end: "2025-10-11", name: "调休上班", start: "2025-10-11", type: "adjusted-workday" },
    ]),
    createChinaObservanceRecords(2025),
    createChinaNamedFestivalRecords(2025),
  ),
  2026: mergeChinaHolidayRecords(
    createChinaHolidayRecords([
      { end: "2026-01-03", name: "元旦", start: "2026-01-01", type: "statutory-holiday" },
      { end: "2026-02-23", name: "春节", start: "2026-02-15", type: "statutory-holiday" },
      { end: "2026-04-06", name: "清明节", start: "2026-04-04", type: "statutory-holiday" },
      { end: "2026-05-05", name: "劳动节", start: "2026-05-01", type: "statutory-holiday" },
      { end: "2026-06-21", name: "端午节", start: "2026-06-19", type: "statutory-holiday" },
      { end: "2026-09-27", name: "中秋节", start: "2026-09-25", type: "statutory-holiday" },
      { end: "2026-10-07", name: "国庆节", start: "2026-10-01", type: "statutory-holiday" },
      { end: "2026-01-04", name: "调休上班", start: "2026-01-04", type: "adjusted-workday" },
      { end: "2026-02-14", name: "调休上班", start: "2026-02-14", type: "adjusted-workday" },
      { end: "2026-02-28", name: "调休上班", start: "2026-02-28", type: "adjusted-workday" },
      { end: "2026-05-09", name: "调休上班", start: "2026-05-09", type: "adjusted-workday" },
      { end: "2026-09-20", name: "调休上班", start: "2026-09-20", type: "adjusted-workday" },
      { end: "2026-10-10", name: "调休上班", start: "2026-10-10", type: "adjusted-workday" },
    ]),
    createChinaObservanceRecords(2026),
    createChinaNamedFestivalRecords(2026),
  ),
};

function loadPlanBook(): PlanBook {
  try {
    const rawData = window.localStorage.getItem(STORAGE_KEY);

    if (!rawData) {
      return {};
    }

    const parsedData = JSON.parse(rawData) as PlanBook;
    return parsedData && typeof parsedData === "object" ? normalizePlanBook(parsedData) : {};
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

function loadMoodBook(): MoodBook {
  try {
    const rawData = window.localStorage.getItem(MOOD_BOOK_KEY);
    return normalizeMoodBook(rawData ? JSON.parse(rawData) : {});
  } catch {
    return {};
  }
}

function saveMoodBook(moodBook: MoodBook) {
  try {
    window.localStorage.setItem(MOOD_BOOK_KEY, JSON.stringify(moodBook));
  } catch {
    // localStorage may be unavailable in private or restricted browser modes.
  }
}

function createDefaultUserProfile(): UserProfile {
  return {
    avatarId: DEFAULT_AVATAR_ID,
    updatedAt: 0,
  };
}

function normalizeUserProfile(value: unknown): UserProfile {
  if (!isPlainObject(value)) {
    return createDefaultUserProfile();
  }

  return {
    avatarId: isAvatarId(value.avatarId) ? value.avatarId : DEFAULT_AVATAR_ID,
    updatedAt: normalizeTimestamp(value.updatedAt) ?? 0,
  };
}

function loadUserProfile(): UserProfile {
  try {
    const rawData = window.localStorage.getItem(USER_PROFILE_KEY);
    return normalizeUserProfile(rawData ? JSON.parse(rawData) : {});
  } catch {
    return createDefaultUserProfile();
  }
}

function saveUserProfile(userProfile: UserProfile) {
  try {
    window.localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(userProfile));
  } catch {
    // localStorage may be unavailable in private or restricted browser modes.
  }
}

const COMPLEX_PROJECT_STATUSES: ComplexProjectStatus[] = ["active", "completed", "archived"];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeComplexProjectNote(value: unknown): string {
  const note = normalizeText(value);

  if (note.includes("检查导出甘特图") || note.includes("PPT 版一致性")) {
    return "";
  }

  return note;
}

function normalizeTimestamp(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeDateInputString(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmedValue = value.trim();
  const match = trimmedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return fallback;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? trimmedValue
    : fallback;
}

function isMoodId(value: unknown): value is MoodId {
  return MOOD_OPTIONS.some((option) => option.id === value);
}

function getMoodOption(moodId: unknown) {
  return MOOD_OPTIONS.find((option) => option.id === moodId) ?? MOOD_OPTIONS[2];
}

function normalizeMoodEntry(value: unknown, fallbackDate: string): MoodEntry | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const moodId = isMoodId(value.moodId) ? value.moodId : null;

  if (!moodId) {
    return null;
  }

  const timestamp = normalizeTimestamp(value.timestamp) ?? Date.now();
  const date = normalizeDateInputString(value.date, fallbackDate || getTimestampDateValue(timestamp));
  const createdAt = normalizeTimestamp(value.createdAt) ?? timestamp;
  const updatedAt = normalizeTimestamp(value.updatedAt) ?? createdAt;

  return {
    id: normalizeText(value.id) || createId(),
    date,
    moodId,
    note: normalizeText(value.note).slice(0, 180),
    timestamp,
    createdAt,
    updatedAt,
  };
}

function normalizeMoodBook(value: unknown): MoodBook {
  if (!isPlainObject(value)) {
    return {};
  }

  return Object.entries(value).reduce<MoodBook>((result, [date, entries]) => {
    const fallbackDate = normalizeDateInputString(date, formatDateInput(new Date()));

    if (!Array.isArray(entries)) {
      return result;
    }

    const normalizedEntries = entries
      .map((entry) => normalizeMoodEntry(entry, fallbackDate))
      .filter((entry): entry is MoodEntry => Boolean(entry))
      .sort((left, right) => left.timestamp - right.timestamp);

    if (normalizedEntries.length > 0) {
      result[fallbackDate] = normalizedEntries;
    }

    return result;
  }, {});
}

function normalizeDateRange(startDate: unknown, endDate: unknown, fallbackDate: string) {
  const normalizedStartDate = normalizeDateInputString(startDate, fallbackDate);
  const normalizedEndDate = normalizeDateInputString(endDate, normalizedStartDate);

  return normalizedStartDate <= normalizedEndDate
    ? { endDate: normalizedEndDate, startDate: normalizedStartDate }
    : { endDate: normalizedStartDate, startDate: normalizedStartDate };
}

function normalizeDurationSeconds(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function getTimestampDateValue(timestamp: number): string {
  return formatDateInput(new Date(timestamp));
}

function normalizeTaskTimeEntry(value: unknown, fallbackDate: string): TaskTimeEntry | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const startedAt = normalizeTimestamp(value.startedAt);

  if (!startedAt) {
    return null;
  }

  const endedAt = normalizeTimestamp(value.endedAt);
  const date = normalizeDateInputString(value.date, getTimestampDateValue(startedAt) || fallbackDate);
  const computedDuration =
    endedAt && endedAt >= startedAt ? Math.floor((endedAt - startedAt) / 1000) : 0;
  const durationSeconds = normalizeDurationSeconds(value.durationSeconds) || computedDuration;

  return {
    id: normalizeText(value.id) || createId(),
    date,
    startedAt,
    ...(endedAt && endedAt >= startedAt ? { endedAt } : {}),
    durationSeconds,
  };
}

function normalizeComplexProjectPhaseTimeEntry(
  value: unknown,
  fallbackDate: string,
): ComplexProjectPhaseTimeEntry | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const startedAt = normalizeTimestamp(value.startedAt);

  if (!startedAt) {
    return null;
  }

  const endedAt = normalizeTimestamp(value.endedAt);
  const date = normalizeDateInputString(value.date, getTimestampDateValue(startedAt) || fallbackDate);
  const computedDuration =
    endedAt && endedAt >= startedAt ? Math.floor((endedAt - startedAt) / 1000) : 0;
  const durationSeconds = normalizeDurationSeconds(value.durationSeconds) || computedDuration;

  return {
    id: normalizeText(value.id) || createId(),
    date,
    startedAt,
    ...(endedAt && endedAt >= startedAt ? { endedAt } : {}),
    durationSeconds,
  };
}

function normalizeComplexProjectStatus(value: unknown): ComplexProjectStatus {
  return COMPLEX_PROJECT_STATUSES.includes(value as ComplexProjectStatus)
    ? (value as ComplexProjectStatus)
    : "active";
}

function normalizeComplexProjectPhase(
  value: unknown,
  fallbackDate: string,
): ComplexProjectPhase | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const { endDate, startDate } = normalizeDateRange(value.startDate, value.endDate, fallbackDate);
  const title = normalizeText(value.title, "未命名阶段");
  const updatedAt = normalizeTimestamp(value.updatedAt);
  const completedAt = normalizeTimestamp(value.completedAt);
  const timeEntries = Array.isArray(value.timeEntries)
    ? value.timeEntries
        .map((entry) => normalizeComplexProjectPhaseTimeEntry(entry, startDate))
        .filter((entry): entry is ComplexProjectPhaseTimeEntry => Boolean(entry))
    : [];

  return {
    id: normalizeText(value.id) || createId(),
    title: title || "未命名阶段",
    note: normalizeText(value.note),
    startDate,
    endDate,
    completed: value.completed === true,
    timeEntries,
    ...(completedAt ? { completedAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  };
}

function getComplexProjectPhaseTime(phase: ComplexProjectPhase): number {
  return Math.max(
    phase.updatedAt ?? phase.completedAt ?? 0,
    ...phase.timeEntries.map((entry) => entry.endedAt ?? entry.startedAt),
  );
}

function getComplexProjectTime(project: ComplexProject): number {
  return Math.max(
    project.updatedAt ?? project.createdAt ?? 0,
    project.archivedAt ?? 0,
    ...project.phases.map(getComplexProjectPhaseTime),
  );
}

function normalizeComplexProject(value: unknown, fallbackDate: string): ComplexProject | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const createdAt = normalizeTimestamp(value.createdAt) ?? Date.now();
  const updatedAt = normalizeTimestamp(value.updatedAt) ?? createdAt;
  const archivedAt = normalizeTimestamp(value.archivedAt);
  const { endDate, startDate } = normalizeDateRange(value.startDate, value.endDate, fallbackDate);
  const projectFallbackDate = startDate || fallbackDate;
  const phases = Array.isArray(value.phases)
    ? value.phases
        .map((phase) => normalizeComplexProjectPhase(phase, projectFallbackDate))
        .filter((phase): phase is ComplexProjectPhase => Boolean(phase))
    : [];
  const title = normalizeText(value.title, "未命名项目");
  const sourceTaskId = normalizeText(value.sourceTaskId);

  return {
    id: normalizeText(value.id) || createId(),
    title: title || "未命名项目",
    category: normalizeText(value.category, "其他") || "其他",
    priority: normalizePriority(value.priority),
    note: normalizeComplexProjectNote(value.note),
    startDate,
    endDate,
    status: normalizeComplexProjectStatus(value.status),
    phases,
    ...(sourceTaskId ? { sourceTaskId } : {}),
    createdAt,
    updatedAt,
    ...(archivedAt ? { archivedAt } : {}),
  };
}

function normalizeComplexProjectBook(value: unknown): ComplexProjectBook {
  const fallbackDate = formatDateInput(new Date());
  const rawProjects = Array.isArray(value)
    ? value
    : isPlainObject(value)
      ? Object.values(value)
      : [];
  const projectsById = new Map<string, ComplexProject>();

  rawProjects.forEach((rawProject) => {
    const project = normalizeComplexProject(rawProject, fallbackDate);

    if (!project) {
      return;
    }

    const existingProject = projectsById.get(project.id);

    if (!existingProject || getComplexProjectTime(project) >= getComplexProjectTime(existingProject)) {
      projectsById.set(project.id, project);
    }
  });

  return Array.from(projectsById.values())
    .sort((left, right) => {
      const timeDifference = getComplexProjectTime(right) - getComplexProjectTime(left);

      if (timeDifference !== 0) {
        return timeDifference;
      }

      return left.id.localeCompare(right.id);
    })
    .reduce<ComplexProjectBook>((book, project) => {
      book[project.id] = project;
      return book;
    }, {});
}

function getComplexProjectsForPayload(complexProjectBook: ComplexProjectBook): ComplexProject[] {
  return Object.values(normalizeComplexProjectBook(complexProjectBook));
}

function loadComplexProjectBook(): ComplexProjectBook {
  try {
    const rawData = window.localStorage.getItem(COMPLEX_PROJECTS_KEY);
    return normalizeComplexProjectBook(rawData ? JSON.parse(rawData) : {});
  } catch {
    return {};
  }
}

function saveComplexProjectBook(complexProjectBook: ComplexProjectBook) {
  try {
    window.localStorage.setItem(
      COMPLEX_PROJECTS_KEY,
      JSON.stringify(normalizeComplexProjectBook(complexProjectBook)),
    );
  } catch {
    // localStorage may be unavailable in private or restricted browser modes.
  }
}

function hasPlans(planBook: PlanBook): boolean {
  return Object.values(planBook).some((items) => items.length > 0);
}

function getItemTime(item: PlanItem): number {
  return Math.max(
    item.updatedAt ?? item.createdAt ?? 0,
    ...item.timeEntries.map((entry) => entry.endedAt ?? entry.startedAt),
  );
}

function normalizeMinutes(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  return undefined;
}

function normalizePriority(value: unknown): TaskPriority {
  return PRIORITY_OPTIONS.some((option) => option.id === value)
    ? (value as TaskPriority)
    : DEFAULT_PRIORITY;
}

function getPriorityOption(priority: unknown) {
  const normalizedPriority = normalizePriority(priority);
  return PRIORITY_OPTIONS.find((option) => option.id === normalizedPriority) ?? PRIORITY_OPTIONS[1];
}

function normalizeSortOrder(value: unknown, fallbackIndex: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallbackIndex * SORT_ORDER_STEP;
}

function getPlanSortOrder(item: PlanItem, fallbackIndex = 0): number {
  return normalizeSortOrder(item.sortOrder, fallbackIndex);
}

function normalizePlanItem(
  value: unknown,
  fallbackDate: string,
  fallbackIndex = 0,
): PlanItem | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const createdAt = normalizeTimestamp(value.createdAt) ?? normalizeTimestamp(value.updatedAt) ?? Date.now();
  const updatedAt = normalizeTimestamp(value.updatedAt) ?? createdAt;
  const date = normalizeDateInputString(value.date, fallbackDate);
  const title = normalizeText(value.title, "未命名计划");
  const category = normalizeText(value.category, "其他") || "其他";
  const timeEntries = Array.isArray(value.timeEntries)
    ? value.timeEntries
        .map((entry) => normalizeTaskTimeEntry(entry, date))
        .filter((entry): entry is TaskTimeEntry => Boolean(entry))
        .sort((left, right) => left.startedAt - right.startedAt)
    : [];

  return {
    id: normalizeText(value.id) || createId(),
    date,
    title: title || "未命名计划",
    category,
    note: normalizeText(value.note),
    completed: value.completed === true,
    priority: normalizePriority(value.priority),
    targetMinutes: normalizeMinutes(value.targetMinutes),
    actualMinutes: normalizeMinutes(value.actualMinutes),
    timeEntries,
    sortOrder: normalizeSortOrder(value.sortOrder, fallbackIndex),
    createdAt,
    updatedAt,
  };
}

function getPriorityIndex(priority: unknown): number {
  const normalizedPriority = normalizePriority(priority);
  const index = PRIORITY_OPTIONS.findIndex((option) => option.id === normalizedPriority);
  return index >= 0 ? index : 1;
}

function getSortedPlansForPriority(plans: PlanItem[], priority: TaskPriority): PlanItem[] {
  const targetPriority = normalizePriority(priority);

  return plans
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => normalizePriority(item.priority) === targetPriority)
    .sort((left, right) => {
      const sortOrderDifference =
        getPlanSortOrder(left.item, left.index) - getPlanSortOrder(right.item, right.index);

      if (sortOrderDifference !== 0) {
        return sortOrderDifference;
      }

      const createdAtDifference = (right.item.createdAt ?? 0) - (left.item.createdAt ?? 0);

      if (createdAtDifference !== 0) {
        return createdAtDifference;
      }

      return left.index - right.index;
    })
    .map(({ item }) => item);
}

function sortPlansByDisplayOrder(plans: PlanItem[]): PlanItem[] {
  return plans
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const priorityDifference =
        getPriorityIndex(left.item.priority) - getPriorityIndex(right.item.priority);

      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      const sortOrderDifference =
        getPlanSortOrder(left.item, left.index) - getPlanSortOrder(right.item, right.index);

      if (sortOrderDifference !== 0) {
        return sortOrderDifference;
      }

      const createdAtDifference = (right.item.createdAt ?? 0) - (left.item.createdAt ?? 0);

      if (createdAtDifference !== 0) {
        return createdAtDifference;
      }

      return left.index - right.index;
    })
    .map(({ item }) => item);
}

function getTopSortOrderForPriority(plans: PlanItem[], priority: TaskPriority): number {
  const priorityPlans = getSortedPlansForPriority(plans, priority);
  return priorityPlans.length > 0
    ? getPlanSortOrder(priorityPlans[0], 0) - SORT_ORDER_STEP
    : 0;
}

function movePlanItemToPosition(
  currentPlans: PlanItem[],
  itemId: string,
  priority: TaskPriority,
  targetItemId: string | null,
  placement: TaskDropPlacement,
  updatedAt: number,
): PlanItem[] {
  const movingItem = currentPlans.find((item) => item.id === itemId);

  if (!movingItem || targetItemId === itemId) {
    return currentPlans;
  }

  const targetPriority = normalizePriority(priority);
  const sourcePriority = normalizePriority(movingItem.priority);
  const remainingPlans = currentPlans.filter((item) => item.id !== itemId);
  const targetPriorityPlans = getSortedPlansForPriority(remainingPlans, targetPriority);
  const targetIndex = targetItemId
    ? targetPriorityPlans.findIndex((item) => item.id === targetItemId)
    : -1;
  const insertIndex =
    targetIndex >= 0
      ? placement === "after"
        ? targetIndex + 1
        : targetIndex
      : targetPriorityPlans.length;
  const reorderedTargetPlans = [...targetPriorityPlans];

  reorderedTargetPlans.splice(insertIndex, 0, {
    ...movingItem,
    priority: targetPriority,
  });

  const nextPlansById = new Map(currentPlans.map((item) => [item.id, item]));

  reorderedTargetPlans.forEach((item, index) => {
    nextPlansById.set(item.id, {
      ...item,
      priority: targetPriority,
      sortOrder: index * SORT_ORDER_STEP,
      updatedAt,
    });
  });

  if (sourcePriority !== targetPriority) {
    getSortedPlansForPriority(remainingPlans, sourcePriority).forEach((item, index) => {
      nextPlansById.set(item.id, {
        ...item,
        sortOrder: index * SORT_ORDER_STEP,
        updatedAt,
      });
    });
  }

  return sortPlansByDisplayOrder(Array.from(nextPlansById.values()));
}

function normalizePlanBook(planBook: PlanBook): PlanBook {
  return Object.entries(planBook).reduce<PlanBook>((result, [date, items]) => {
    if (!Array.isArray(items)) {
      return result;
    }

    const fallbackDate = normalizeDateInputString(date, formatDateInput(new Date()));
    const normalizedItems = items
      .map((item, index) => normalizePlanItem(item, fallbackDate, index))
      .filter((item): item is PlanItem => Boolean(item));

    result[fallbackDate] = sortPlansByDisplayOrder(normalizedItems);
    return result;
  }, {});
}

function normalizePayload(payload: unknown): CloudPayload {
  if (
    payload &&
    typeof payload === "object" &&
    ("plansByDate" in payload ||
      "deletedItemIds" in payload ||
      "customCategories" in payload ||
      "complexProjects" in payload ||
      "moodBook" in payload ||
      "userProfile" in payload)
  ) {
    const cloudPayload = payload as Partial<CloudPayload>;

    return {
      plansByDate: normalizePlanBook((cloudPayload.plansByDate ?? {}) as PlanBook),
      deletedItemIds: Array.isArray(cloudPayload.deletedItemIds)
        ? cloudPayload.deletedItemIds
        : [],
      customCategories: normalizeCustomCategories(cloudPayload.customCategories),
      complexProjects: getComplexProjectsForPayload(
        normalizeComplexProjectBook(cloudPayload.complexProjects),
      ),
      moodBook: normalizeMoodBook(cloudPayload.moodBook),
      userProfile: normalizeUserProfile(cloudPayload.userProfile),
    };
  }

  return {
    plansByDate: normalizePlanBook((payload ?? {}) as PlanBook),
    deletedItemIds: [],
    customCategories: [],
    complexProjects: [],
    moodBook: {},
    userProfile: createDefaultUserProfile(),
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
    const dateItems = [...(localPlanBook[date] ?? []), ...(cloudPlanBook[date] ?? [])];

    dateItems.forEach((item, index) => {
      if (deletedSet.has(item.id)) {
        return;
      }

      const normalizedItem = normalizePlanItem(item, date, index);

      if (!normalizedItem) {
        return;
      }

      const existingItem = itemMap.get(item.id);

      if (!existingItem || getItemTime(normalizedItem) >= getItemTime(existingItem)) {
        itemMap.set(item.id, normalizedItem);
      }
    });

    const items = sortPlansByDisplayOrder(Array.from(itemMap.values()));

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

function mergeMoodBooks(localMoodBook: MoodBook, cloudMoodBook: MoodBook): MoodBook {
  const dates = new Set([...Object.keys(localMoodBook), ...Object.keys(cloudMoodBook)]);
  const merged: MoodBook = {};

  dates.forEach((date) => {
    const entryMap = new Map<string, MoodEntry>();
    [...(cloudMoodBook[date] ?? []), ...(localMoodBook[date] ?? [])].forEach((entry) => {
      const existingEntry = entryMap.get(entry.id);

      if (!existingEntry || (entry.updatedAt ?? entry.createdAt) >= (existingEntry.updatedAt ?? existingEntry.createdAt)) {
        entryMap.set(entry.id, entry);
      }
    });

    const entries = Array.from(entryMap.values()).sort(
      (left, right) => left.timestamp - right.timestamp,
    );

    if (entries.length > 0) {
      merged[date] = entries;
    }
  });

  return normalizeMoodBook(merged);
}

function mergeUserProfiles(localUserProfile: UserProfile, cloudUserProfile: UserProfile): UserProfile {
  return cloudUserProfile.updatedAt > localUserProfile.updatedAt ? cloudUserProfile : localUserProfile;
}

function mergeComplexProjectBooks(
  localComplexProjectBook: ComplexProjectBook,
  cloudComplexProjectBook: ComplexProjectBook,
): ComplexProjectBook {
  return normalizeComplexProjectBook({
    ...cloudComplexProjectBook,
    ...localComplexProjectBook,
    ...Object.values(cloudComplexProjectBook).reduce<ComplexProjectBook>((merged, cloudProject) => {
      const localProject = localComplexProjectBook[cloudProject.id];

      merged[cloudProject.id] =
        !localProject || getComplexProjectTime(cloudProject) > getComplexProjectTime(localProject)
          ? cloudProject
          : localProject;

      return merged;
    }, {}),
  });
}

function createCloudPayload(
  planBook: PlanBook,
  deletedItemIds: string[],
  customCategories: CustomCategory[],
  complexProjectBook: ComplexProjectBook = {},
  moodBook: MoodBook = {},
  userProfile: UserProfile = createDefaultUserProfile(),
): CloudPayload {
  return {
    plansByDate: normalizePlanBook(planBook),
    deletedItemIds,
    customCategories: normalizeCustomCategories(customCategories),
    complexProjects: getComplexProjectsForPayload(complexProjectBook),
    moodBook: normalizeMoodBook(moodBook),
    userProfile: normalizeUserProfile(userProfile),
  };
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values));
}

function arePlanBooksEqual(firstPlanBook: PlanBook, secondPlanBook: PlanBook): boolean {
  return JSON.stringify(firstPlanBook) === JSON.stringify(secondPlanBook);
}

function areComplexProjectBooksEqual(
  firstComplexProjectBook: ComplexProjectBook,
  secondComplexProjectBook: ComplexProjectBook,
): boolean {
  return JSON.stringify(firstComplexProjectBook) === JSON.stringify(secondComplexProjectBook);
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

function getTaskTimeEntries(item: PlanItem): TaskTimeEntry[] {
  return item.timeEntries ?? [];
}

function getTaskTimeEntrySeconds(entry: TaskTimeEntry, now = Date.now()): number {
  if (entry.endedAt) {
    return Math.max(
      entry.durationSeconds,
      Math.floor(Math.max(0, entry.endedAt - entry.startedAt) / 1000),
    );
  }

  return entry.durationSeconds + Math.floor(Math.max(0, now - entry.startedAt) / 1000);
}

function getTaskTimeTotalSeconds(item: PlanItem, now = Date.now()): number {
  return getTaskTimeEntries(item).reduce(
    (totalSeconds, entry) => totalSeconds + getTaskTimeEntrySeconds(entry, now),
    0,
  );
}

function getTaskTimeSecondsForDate(
  item: PlanItem,
  dateValue: string,
  now = Date.now(),
): number {
  return getTaskTimeEntries(item)
    .filter((entry) => entry.date === dateValue)
    .reduce((totalSeconds, entry) => totalSeconds + getTaskTimeEntrySeconds(entry, now), 0);
}

function getTaskTimeEntriesForDate(item: PlanItem, dateValue: string): TaskTimeEntry[] {
  return getTaskTimeEntries(item)
    .filter((entry) => entry.date === dateValue)
    .sort((left, right) => left.startedAt - right.startedAt);
}

function getRunningTaskTimeEntry(item: PlanItem): TaskTimeEntry | null {
  return getTaskTimeEntries(item).find((entry) => !entry.endedAt) ?? null;
}

function stopRunningTaskTimeEntries(entries: TaskTimeEntry[], now = Date.now()): TaskTimeEntry[] {
  return entries.map((entry) => {
    if (entry.endedAt) {
      return entry;
    }

    const durationSeconds = Math.max(
      entry.durationSeconds,
      Math.floor(Math.max(0, now - entry.startedAt) / 1000),
    );

    return {
      ...entry,
      endedAt: now,
      durationSeconds,
    };
  });
}

function getComplexProjectPhaseEntrySeconds(
  entry: ComplexProjectPhaseTimeEntry,
  now = Date.now(),
): number {
  if (entry.endedAt) {
    return Math.max(
      entry.durationSeconds,
      Math.floor(Math.max(0, entry.endedAt - entry.startedAt) / 1000),
    );
  }

  return entry.durationSeconds + Math.floor(Math.max(0, now - entry.startedAt) / 1000);
}

function getComplexProjectPhaseTotalSeconds(
  phase: ComplexProjectPhase,
  now = Date.now(),
): number {
  return phase.timeEntries.reduce(
    (totalSeconds, entry) => totalSeconds + getComplexProjectPhaseEntrySeconds(entry, now),
    0,
  );
}

function getComplexProjectPhaseSecondsForDate(
  phase: ComplexProjectPhase,
  dateValue: string,
  now = Date.now(),
): number {
  return phase.timeEntries
    .filter((entry) => entry.date === dateValue)
    .reduce((totalSeconds, entry) => totalSeconds + getComplexProjectPhaseEntrySeconds(entry, now), 0);
}

function getComplexProjectTotalSeconds(project: ComplexProject, now = Date.now()): number {
  return project.phases.reduce(
    (totalSeconds, phase) => totalSeconds + getComplexProjectPhaseTotalSeconds(phase, now),
    0,
  );
}

function getComplexProjectSecondsForDate(
  project: ComplexProject,
  dateValue: string,
  now = Date.now(),
): number {
  return project.phases.reduce(
    (totalSeconds, phase) =>
      totalSeconds + getComplexProjectPhaseSecondsForDate(phase, dateValue, now),
    0,
  );
}

function getComplexProjectSessionCountForDate(project: ComplexProject, dateValue: string): number {
  return project.phases.reduce(
    (count, phase) => count + phase.timeEntries.filter((entry) => entry.date === dateValue).length,
    0,
  );
}

function getRunningComplexProjectPhaseEntry(
  phase: ComplexProjectPhase,
): ComplexProjectPhaseTimeEntry | null {
  return phase.timeEntries.find((entry) => !entry.endedAt) ?? null;
}

function getComplexProjectPhaseEntriesForDate(
  phase: ComplexProjectPhase,
  dateValue: string,
): ComplexProjectPhaseTimeEntry[] {
  return phase.timeEntries
    .filter((entry) => entry.date === dateValue)
    .sort((left, right) => left.startedAt - right.startedAt);
}

function formatClockTime(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function createTimestampForDateAtCurrentTime(dateValue: string): number {
  const selectedDate = parseDateInputValue(dateValue);
  const now = new Date();

  return new Date(
    selectedDate.getFullYear(),
    selectedDate.getMonth(),
    selectedDate.getDate(),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
  ).getTime();
}

function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

function escapeSpreadsheetCell(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function createPhaseTimeEntriesExcelBlob({
  date,
  entries,
  now,
  phaseTitle,
  projectTitle,
}: {
  date: string;
  entries: ComplexProjectPhaseTimeEntry[];
  now: number;
  phaseTitle: string;
  projectTitle: string;
}): Blob {
  const rows = entries.map((entry, index) => {
    const durationSeconds = getComplexProjectPhaseEntrySeconds(entry, now);
    const endedAtLabel = entry.endedAt ? formatDateTime(entry.endedAt) : "进行中";

    return `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeSpreadsheetCell(projectTitle)}</td>
        <td>${escapeSpreadsheetCell(phaseTitle)}</td>
        <td>${escapeSpreadsheetCell(date)}</td>
        <td>${escapeSpreadsheetCell(formatDateTime(entry.startedAt))}</td>
        <td>${escapeSpreadsheetCell(endedAtLabel)}</td>
        <td>${escapeSpreadsheetCell(formatDashboardDuration(durationSeconds))}</td>
        <td>${durationSeconds}</td>
      </tr>`;
  });
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      table { border-collapse: collapse; font-family: Arial, "Microsoft YaHei", sans-serif; }
      th, td { border: 1px solid #d9e2ec; padding: 8px 10px; white-space: nowrap; }
      th { background: #fff7ed; font-weight: 700; }
      caption { padding: 10px; font-size: 16px; font-weight: 700; text-align: left; }
    </style>
  </head>
  <body>
    <table>
      <caption>${escapeSpreadsheetCell(projectTitle)} - ${escapeSpreadsheetCell(phaseTitle)} ${escapeSpreadsheetCell(date)} 计时明细</caption>
      <thead>
        <tr>
          <th>序号</th>
          <th>复杂项目</th>
          <th>阶段</th>
          <th>日期</th>
          <th>开始时间</th>
          <th>结束时间</th>
          <th>持续时间</th>
          <th>持续秒数</th>
        </tr>
      </thead>
      <tbody>
        ${rows.join("")}
      </tbody>
    </table>
  </body>
</html>`;

  return new Blob([`\ufeff${html}`], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
}

function createTaskTimeEntriesExcelBlob({
  category,
  date,
  entries,
  now,
  taskTitle,
}: {
  category: string;
  date: string;
  entries: TaskTimeEntry[];
  now: number;
  taskTitle: string;
}): Blob {
  const rows = entries.map((entry, index) => {
    const durationSeconds = getTaskTimeEntrySeconds(entry, now);
    const endedAtLabel = entry.endedAt ? formatDateTime(entry.endedAt) : "进行中";

    return `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeSpreadsheetCell(taskTitle)}</td>
        <td>${escapeSpreadsheetCell(category)}</td>
        <td>${escapeSpreadsheetCell(date)}</td>
        <td>${escapeSpreadsheetCell(formatDateTime(entry.startedAt))}</td>
        <td>${escapeSpreadsheetCell(endedAtLabel)}</td>
        <td>${escapeSpreadsheetCell(formatDashboardDuration(durationSeconds))}</td>
        <td>${durationSeconds}</td>
      </tr>`;
  });
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      table { border-collapse: collapse; font-family: Arial, "Microsoft YaHei", sans-serif; }
      th, td { border: 1px solid #d9e2ec; padding: 8px 10px; white-space: nowrap; }
      th { background: #eff6ff; font-weight: 700; }
      caption { padding: 10px; font-size: 16px; font-weight: 700; text-align: left; }
    </style>
  </head>
  <body>
    <table>
      <caption>${escapeSpreadsheetCell(taskTitle)} ${escapeSpreadsheetCell(date)} 计时明细</caption>
      <thead>
        <tr>
          <th>序号</th>
          <th>任务</th>
          <th>分类</th>
          <th>日期</th>
          <th>开始时间</th>
          <th>结束时间</th>
          <th>持续时间</th>
          <th>持续秒数</th>
        </tr>
      </thead>
      <tbody>
        ${rows.join("")}
      </tbody>
    </table>
  </body>
</html>`;

  return new Blob([`\ufeff${html}`], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
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

function parseDateInputValue(dateValue: string): Date {
  const [year = "", month = "", day = ""] = dateValue.split("-");
  const parsedYear = Number(year);
  const parsedMonth = Number(month);
  const parsedDay = Number(day);

  if (!parsedYear || !parsedMonth || !parsedDay) {
    return new Date();
  }

  return new Date(parsedYear, parsedMonth - 1, parsedDay);
}

function getChinaLunarYearInfo(year: number): number | null {
  if (year < LUNAR_BASE_YEAR || year > LUNAR_MAX_YEAR) {
    return null;
  }

  return CHINA_LUNAR_INFO[year - LUNAR_BASE_YEAR] ?? null;
}

function getChinaLunarLeapMonth(year: number): number {
  return getChinaLunarYearInfo(year) ? getChinaLunarYearInfo(year)! & 0xf : 0;
}

function getChinaLunarLeapMonthDays(year: number): number {
  const yearInfo = getChinaLunarYearInfo(year);

  if (!yearInfo || getChinaLunarLeapMonth(year) === 0) {
    return 0;
  }

  return yearInfo & 0x10000 ? 30 : 29;
}

function getChinaLunarMonthDays(year: number, month: number): number {
  const yearInfo = getChinaLunarYearInfo(year);

  if (!yearInfo) {
    return 0;
  }

  return yearInfo & (0x10000 >> month) ? 30 : 29;
}

function getChinaLunarYearDays(year: number): number {
  const yearInfo = getChinaLunarYearInfo(year);

  if (!yearInfo) {
    return 0;
  }

  let totalDays = 348;

  for (let monthMask = 0x8000; monthMask > 0x8; monthMask >>= 1) {
    totalDays += yearInfo & monthMask ? 1 : 0;
  }

  return totalDays + getChinaLunarLeapMonthDays(year);
}

function getChinaLunarMonthSequence(year: number): Array<{
  days: number;
  isLeapMonth: boolean;
  month: number;
}> {
  const leapMonth = getChinaLunarLeapMonth(year);
  const sequence: Array<{ days: number; isLeapMonth: boolean; month: number }> = [];

  for (let month = 1; month <= 12; month += 1) {
    sequence.push({
      days: getChinaLunarMonthDays(year, month),
      isLeapMonth: false,
      month,
    });

    if (leapMonth === month) {
      sequence.push({
        days: getChinaLunarLeapMonthDays(year),
        isLeapMonth: true,
        month,
      });
    }
  }

  return sequence;
}

function getChinaLunarDate(dateValue: string): ChinaLunarDate | null {
  const date = parseDateInputValue(dateValue);
  const dateYear = date.getFullYear();

  if (dateYear < LUNAR_BASE_YEAR || dateYear > LUNAR_MAX_YEAR) {
    return null;
  }

  let offsetDays = Math.floor(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
      Date.UTC(LUNAR_BASE_DATE.getFullYear(), LUNAR_BASE_DATE.getMonth(), LUNAR_BASE_DATE.getDate())) /
      86400000,
  );

  if (offsetDays < 0) {
    return null;
  }

  let lunarYear = LUNAR_BASE_YEAR;

  while (lunarYear <= LUNAR_MAX_YEAR) {
    const yearDays = getChinaLunarYearDays(lunarYear);

    if (offsetDays < yearDays) {
      break;
    }

    offsetDays -= yearDays;
    lunarYear += 1;
  }

  if (lunarYear > LUNAR_MAX_YEAR) {
    return null;
  }

  for (const lunarMonth of getChinaLunarMonthSequence(lunarYear)) {
    if (offsetDays < lunarMonth.days) {
      return {
        day: offsetDays + 1,
        isLeapMonth: lunarMonth.isLeapMonth,
        month: lunarMonth.month,
        year: lunarYear,
      };
    }

    offsetDays -= lunarMonth.days;
  }

  return null;
}

function formatChinaLunarMonthName(month: number, isLeapMonth: boolean): string {
  const monthName = CHINA_LUNAR_MONTH_NAMES[month - 1] ?? String(month);
  return `${isLeapMonth ? "闰" : ""}${monthName}月`;
}

function formatChinaLunarDayName(day: number): string {
  return CHINA_LUNAR_DAY_NAMES[day - 1] ?? String(day);
}

function formatChinaLunarCellLabel(dateValue: string): string {
  const lunarDate = getChinaLunarDate(dateValue);

  if (!lunarDate) {
    return "";
  }

  return lunarDate.day === 1
    ? formatChinaLunarMonthName(lunarDate.month, lunarDate.isLeapMonth)
    : formatChinaLunarDayName(lunarDate.day);
}

function formatChinaLunarDisplayDate(dateValue: string): string {
  const lunarDate = getChinaLunarDate(dateValue);

  if (!lunarDate) {
    return "";
  }

  return `${formatChinaLunarMonthName(lunarDate.month, lunarDate.isLeapMonth)}${formatChinaLunarDayName(lunarDate.day)}`;
}

function normalizeDateSearchParts(year: number, month: number, day: number): string | null {
  if (!year || !month || !day || year < 1900 || year > 9999 || month < 1 || month > 12) {
    return null;
  }

  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return formatDateInput(date);
}

function normalizeHolidaySearchText(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, "")
    .replace(/[·・、，,。.!！?？]/g, "")
    .replace(/节假日/g, "节");
}

function getHolidaySearchYearAndText(value: string, fallbackYear: number): {
  searchText: string;
  year: number;
} {
  const trimmedValue = value.trim();
  const yearMatch = trimmedValue.match(/((?:19|20)\d{2})年?/);
  const year = yearMatch ? Number(yearMatch[1]) : fallbackYear;
  const searchText = normalizeHolidaySearchText(
    yearMatch ? trimmedValue.replace(yearMatch[0], "") : trimmedValue,
  );

  return { searchText, year };
}

function getChinaHolidayNameSearchVariants(name: string): string[] {
  const variants = new Set<string>();
  const addVariant = (variant: string) => {
    const normalizedVariant = normalizeHolidaySearchText(variant);

    if (normalizedVariant.length >= 2 || /^\d+$/.test(normalizedVariant)) {
      variants.add(normalizedVariant);
    }
  };
  const addNameVariants = (rawName: string) => {
    const normalizedName = normalizeHolidaySearchText(rawName);

    if (!normalizedName) {
      return;
    }

    addVariant(normalizedName);

    const withoutPrefix = normalizedName.replace(/^(中国|国际)/, "");
    addVariant(withoutPrefix);

    if (normalizedName.endsWith("节")) {
      addVariant(normalizedName.slice(0, -1));
    }

    if (withoutPrefix.endsWith("节")) {
      addVariant(withoutPrefix.slice(0, -1));
    }
  };

  name.split("/").forEach((namePart) => {
    addNameVariants(namePart);
    (CHINA_HOLIDAY_SEARCH_ALIASES_BY_NAME[namePart.trim()] ?? []).forEach(addVariant);
  });

  (CHINA_HOLIDAY_SEARCH_ALIASES_BY_NAME[name] ?? []).forEach(addVariant);

  return Array.from(variants);
}

function getChinaHolidaySearchCandidates(
  year: number,
  holidayMap: Map<string, ChinaHolidayInfo>,
): ChinaHolidaySearchCandidate[] {
  const candidates: ChinaHolidaySearchCandidate[] = [];
  const addCandidate = (date: string, name: string, priority: number) => {
    const normalizedName = normalizeHolidaySearchText(name);

    if (!date.startsWith(`${year}-`) || !normalizedName) {
      return;
    }

    candidates.push({ date, name: normalizedName, priority });
  };

  (CHINA_NAMED_FESTIVAL_DATES_BY_YEAR[year] ?? []).forEach((festival) => {
    addCandidate(festival.date, festival.name, 0);
  });

  CHINA_OBSERVANCE_DEFINITIONS.forEach((definition) => {
    addCandidate(
      `${year}-${String(definition.month).padStart(2, "0")}-${String(definition.day).padStart(2, "0")}`,
      definition.name,
      1,
    );
  });

  holidayMap.forEach((holidayInfo) => {
    if (
      holidayInfo.type !== "statutory-holiday" &&
      holidayInfo.type !== "observance"
    ) {
      return;
    }

    holidayInfo.name.split("/").forEach((namePart) => {
      addCandidate(holidayInfo.date, namePart, 2);
    });
  });

  return candidates.sort(
    (left, right) => left.priority - right.priority || left.date.localeCompare(right.date),
  );
}

function findChinaHolidayDateByName(
  value: string,
  fallbackYear: number,
  holidayMap: Map<string, ChinaHolidayInfo>,
): string | null {
  const { searchText, year } = getHolidaySearchYearAndText(value, fallbackYear);

  if (searchText.length < 2 && !/^\d+$/.test(searchText)) {
    return null;
  }

  const candidates = getChinaHolidaySearchCandidates(year, holidayMap);
  const exactMatch = candidates.find((candidate) =>
    getChinaHolidayNameSearchVariants(candidate.name).includes(searchText),
  );

  if (exactMatch) {
    return exactMatch.date;
  }

  const fuzzyMatch = candidates.find((candidate) =>
    getChinaHolidayNameSearchVariants(candidate.name).some((variant) =>
      searchText.includes(variant) || variant.includes(searchText),
    ),
  );

  return fuzzyMatch?.date ?? null;
}

function parseDateSearchInput(
  value: string,
  fallbackYear: number,
  holidayMap: Map<string, ChinaHolidayInfo>,
): string | null {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const compactDigits = trimmedValue.replace(/\D/g, "");

  if (/^\d{8}$/.test(compactDigits)) {
    return normalizeDateSearchParts(
      Number(compactDigits.slice(0, 4)),
      Number(compactDigits.slice(4, 6)),
      Number(compactDigits.slice(6, 8)),
    );
  }

  const normalizedValue = trimmedValue
    .replace(/[年月./]/g, "-")
    .replace(/[日号]/g, "")
    .replace(/\s+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const fullDateMatch = normalizedValue.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (fullDateMatch) {
    return normalizeDateSearchParts(
      Number(fullDateMatch[1]),
      Number(fullDateMatch[2]),
      Number(fullDateMatch[3]),
    );
  }

  const monthDayMatch = normalizedValue.match(/^(\d{1,2})-(\d{1,2})$/);

  if (monthDayMatch) {
    return normalizeDateSearchParts(
      fallbackYear,
      Number(monthDayMatch[1]),
      Number(monthDayMatch[2]),
    );
  }

  return findChinaHolidayDateByName(trimmedValue, fallbackYear, holidayMap);
}

function getDateInputYear(dateValue: string): number {
  return parseDateInputValue(dateValue).getFullYear();
}

function getMonthStartDateValue(dateValue: string): string {
  const date = parseDateInputValue(dateValue);
  return formatDateInput(new Date(date.getFullYear(), date.getMonth(), 1));
}

function addMonthsToDateValue(dateValue: string, monthOffset: number): string {
  const date = parseDateInputValue(dateValue);
  return formatDateInput(new Date(date.getFullYear(), date.getMonth() + monthOffset, 1));
}

function createDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = parseDateInputValue(startDate);
  const end = parseDateInputValue(endDate);

  for (
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    date.getTime() <= end.getTime();
    date.setDate(date.getDate() + 1)
  ) {
    dates.push(formatDateInput(date));
  }

  return dates;
}

function createChinaHolidayRecords(
  entries: Array<{
    end: string;
    name: string;
    start: string;
    type: Extract<ChinaHolidayType, "statutory-holiday" | "adjusted-workday">;
  }>,
): ChinaHolidayInfo[] {
  return entries.flatMap((entry) =>
    createDateRange(entry.start, entry.end).map((date) => ({
      date,
      name: entry.name,
      isHoliday: entry.type === "statutory-holiday",
      isWorkday: entry.type === "adjusted-workday",
      type: entry.type,
    })),
  );
}

function createChinaObservanceRecords(year: number): ChinaHolidayInfo[] {
  return CHINA_OBSERVANCE_DEFINITIONS.map((definition) => ({
    date: `${year}-${String(definition.month).padStart(2, "0")}-${String(definition.day).padStart(2, "0")}`,
    name: definition.name,
    isHoliday: false,
    isWorkday: false,
    type: "observance",
  }));
}

function createChinaNamedFestivalRecords(year: number): ChinaHolidayInfo[] {
  return (CHINA_NAMED_FESTIVAL_DATES_BY_YEAR[year] ?? []).map((festival) => ({
    date: festival.date,
    name: festival.name,
    isHoliday: false,
    isWorkday: false,
    type: "observance",
  }));
}

function getDefaultChinaHolidayInfo(dateValue: string): ChinaHolidayInfo {
  const date = parseDateInputValue(dateValue);
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;

  return {
    date: dateValue,
    name: isWeekend ? "周末" : "",
    isHoliday: false,
    isWorkday: false,
    type: isWeekend ? "weekend" : "normal",
  };
}

function getChinaHolidayInfo(
  dateValue: string,
  holidayMap: Map<string, ChinaHolidayInfo>,
): ChinaHolidayInfo {
  return holidayMap.get(dateValue) ?? getDefaultChinaHolidayInfo(dateValue);
}

function getChinaSpecialDateText(holidayInfo: ChinaHolidayInfo): string {
  if (holidayInfo.type === "statutory-holiday") {
    return holidayInfo.name ? `休 · ${holidayInfo.name}` : "休";
  }

  if (holidayInfo.type === "adjusted-workday") {
    return holidayInfo.name ? `班 · ${holidayInfo.name}` : "班";
  }

  if (holidayInfo.type === "observance") {
    return holidayInfo.name;
  }

  return "";
}

function getChinaCalendarDateName(holidayInfo: ChinaHolidayInfo): string {
  if (
    holidayInfo.type === "statutory-holiday" ||
    holidayInfo.type === "adjusted-workday" ||
    holidayInfo.type === "observance"
  ) {
    return holidayInfo.name;
  }

  return "";
}

function mergeChinaHolidayRecords(...recordLists: ChinaHolidayInfo[][]): ChinaHolidayInfo[] {
  const recordsByDate = new Map<string, ChinaHolidayInfo>();

  recordLists.flat().forEach((record) => {
    const existingRecord = recordsByDate.get(record.date);

    if (!existingRecord) {
      recordsByDate.set(record.date, record);
      return;
    }

    const nameParts = [existingRecord.name, record.name]
      .flatMap((name) => name.split("/"))
      .map((name) => name.trim())
      .filter(Boolean);
    const name = Array.from(new Set(nameParts)).join("/");
    const isHoliday = existingRecord.isHoliday || record.isHoliday;
    const isWorkday = existingRecord.isWorkday || record.isWorkday;
    const type = isWorkday
      ? "adjusted-workday"
      : isHoliday
        ? "statutory-holiday"
        : existingRecord.type === "observance" || record.type === "observance"
          ? "observance"
          : existingRecord.type;

    recordsByDate.set(record.date, {
      date: record.date,
      name,
      isHoliday,
      isWorkday,
      type,
    });
  });

  return Array.from(recordsByDate.values()).sort((left, right) =>
    left.date.localeCompare(right.date),
  );
}

function getChinaHolidayCacheKey(year: number): string {
  return `${CHINA_HOLIDAYS_CACHE_PREFIX}-${year}`;
}

function isChinaHolidayType(value: unknown): value is ChinaHolidayType {
  return (
    value === "statutory-holiday" ||
    value === "adjusted-workday" ||
    value === "observance" ||
    value === "weekend" ||
    value === "normal"
  );
}

function normalizeChinaHolidayInfo(value: unknown, year: number): ChinaHolidayInfo | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<ChinaHolidayInfo>;

  if (typeof candidate.date !== "string" || !candidate.date.startsWith(`${year}-`)) {
    return null;
  }

  const type = isChinaHolidayType(candidate.type)
    ? candidate.type
    : candidate.isWorkday
      ? "adjusted-workday"
      : candidate.isHoliday
        ? "statutory-holiday"
        : "normal";

  return {
    date: candidate.date,
    name: typeof candidate.name === "string" ? candidate.name : "",
    isHoliday: Boolean(candidate.isHoliday || type === "statutory-holiday"),
    isWorkday: Boolean(candidate.isWorkday || type === "adjusted-workday"),
    type,
  };
}

function normalizeChinaHolidayPayload(payload: unknown, year: number): ChinaHolidayInfo[] {
  const rawRecords =
    Array.isArray(payload)
      ? payload
      : payload && typeof payload === "object" && Array.isArray((payload as { holidays?: unknown }).holidays)
        ? (payload as { holidays: unknown[] }).holidays
        : [];

  return rawRecords
    .map((record) => normalizeChinaHolidayInfo(record, year))
    .filter((record): record is ChinaHolidayInfo => Boolean(record));
}

function loadCachedChinaHolidayYear(year: number): ChinaHolidayInfo[] | null {
  try {
    const rawData = window.localStorage.getItem(getChinaHolidayCacheKey(year));

    if (!rawData) {
      return null;
    }

    const parsedData = JSON.parse(rawData) as { records?: unknown; updatedAt?: unknown };
    const updatedAt = typeof parsedData.updatedAt === "number" ? parsedData.updatedAt : 0;

    if (Date.now() - updatedAt > CHINA_HOLIDAYS_CACHE_TTL_MS) {
      return null;
    }

    return normalizeChinaHolidayPayload(parsedData.records, year);
  } catch {
    return null;
  }
}

function saveCachedChinaHolidayYear(year: number, records: ChinaHolidayInfo[]) {
  try {
    window.localStorage.setItem(
      getChinaHolidayCacheKey(year),
      JSON.stringify({ records, updatedAt: Date.now() }),
    );
  } catch {
    // localStorage may be unavailable in private or restricted browser modes.
  }
}

async function fetchRemoteChinaHolidayYear(year: number): Promise<ChinaHolidayInfo[] | null> {
  if (!CHINA_HOLIDAYS_REMOTE_URL) {
    return null;
  }

  const url = CHINA_HOLIDAYS_REMOTE_URL.replace("{year}", String(year));
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("节假日远程数据读取失败");
  }

  const payload = await response.json();
  const records = normalizeChinaHolidayPayload(payload, year);
  return records.length > 0 ? records : null;
}

async function loadChinaHolidayYear(year: number): Promise<ChinaHolidayYearResult> {
  const fallbackRecords = CHINA_HOLIDAY_FALLBACK_BY_YEAR[year] ?? [];
  const cachedRecords = loadCachedChinaHolidayYear(year);

  if (cachedRecords && cachedRecords.length > 0) {
    return {
      records: mergeChinaHolidayRecords(fallbackRecords, cachedRecords),
      source: "cache",
    };
  }

  try {
    const remoteRecords = await fetchRemoteChinaHolidayYear(year);

    if (remoteRecords && remoteRecords.length > 0) {
      const records = mergeChinaHolidayRecords(fallbackRecords, remoteRecords);
      saveCachedChinaHolidayYear(year, records);
      return { records, source: "remote" };
    }
  } catch {
    // Remote holiday data must never block date selection.
  }

  return {
    records: fallbackRecords,
    source: "fallback",
  };
}

function readFiniteNumber(value: unknown): number | null {
  const numberValue =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeWeatherSnapshot(value: unknown): WeatherSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<WeatherSnapshot>;
  const apparentTemperature = readFiniteNumber(candidate.apparentTemperature);
  const humidity = readFiniteNumber(candidate.humidity);
  const latitude = readFiniteNumber(candidate.latitude);
  const longitude = readFiniteNumber(candidate.longitude);
  const temperature = readFiniteNumber(candidate.temperature);
  const updatedAt = readFiniteNumber(candidate.updatedAt);
  const weatherCode = readFiniteNumber(candidate.weatherCode);
  const windSpeed = readFiniteNumber(candidate.windSpeed);

  if (latitude === null || longitude === null || temperature === null || updatedAt === null || weatherCode === null) {
    return null;
  }

  return {
    apparentTemperature,
    humidity,
    latitude,
    longitude,
    temperature,
    updatedAt,
    weatherCode,
    windSpeed,
  };
}

function loadCachedWeatherSnapshot(allowStale = false): WeatherSnapshot | null {
  try {
    const rawData = window.localStorage.getItem(WEATHER_CACHE_KEY);

    if (!rawData) {
      return null;
    }

    const snapshot = normalizeWeatherSnapshot(JSON.parse(rawData));

    if (!snapshot) {
      return null;
    }

    if (!allowStale && Date.now() - snapshot.updatedAt > WEATHER_CACHE_TTL_MS) {
      return null;
    }

    return snapshot;
  } catch {
    return null;
  }
}

function saveCachedWeatherSnapshot(snapshot: WeatherSnapshot) {
  try {
    window.localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Weather is a convenience widget; failing to cache should not affect planning.
  }
}

function getWeatherCondition(weatherCode: number): WeatherCondition {
  if (weatherCode === 0) {
    return { icon: "☀️", text: "晴" };
  }

  if (weatherCode === 1 || weatherCode === 2) {
    return { icon: "🌤️", text: "少云" };
  }

  if (weatherCode === 3) {
    return { icon: "☁️", text: "阴" };
  }

  if (weatherCode === 45 || weatherCode === 48) {
    return { icon: "🌫️", text: "雾" };
  }

  if ([51, 53, 55, 56, 57].includes(weatherCode)) {
    return { icon: "🌦️", text: "毛毛雨" };
  }

  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) {
    return { icon: "🌧️", text: "雨" };
  }

  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) {
    return { icon: "❄️", text: "雪" };
  }

  if ([95, 96, 99].includes(weatherCode)) {
    return { icon: "⛈️", text: "雷阵雨" };
  }

  return { icon: "🌡️", text: "天气" };
}

function formatWeatherTemperature(value: number): string {
  return `${Math.round(value)}°C`;
}

function formatWeatherUpdatedTime(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function isGeolocationPermissionDenied(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === 1,
  );
}

function getWeatherErrorMessage(error: unknown): string {
  if (isGeolocationPermissionDenied(error)) {
    return "允许定位后显示天气";
  }

  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === 3
  ) {
    return "定位超时，稍后重试";
  }

  return "天气更新失败";
}

function requestBrowserPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("当前浏览器不支持定位"));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      maximumAge: 10 * 60 * 1000,
      timeout: 10 * 1000,
    });
  });
}

async function fetchWeatherSnapshot(latitude: number, longitude: number): Promise<WeatherSnapshot> {
  const params = new URLSearchParams({
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    timezone: "auto",
  });
  const response = await fetch(`${WEATHER_API_URL}?${params.toString()}`);

  if (!response.ok) {
    throw new Error("天气接口读取失败");
  }

  const payload = (await response.json()) as { current?: Record<string, unknown> };
  const currentWeather = payload.current ?? {};
  const temperature = readFiniteNumber(currentWeather.temperature_2m);
  const weatherCode = readFiniteNumber(currentWeather.weather_code);

  if (temperature === null || weatherCode === null) {
    throw new Error("天气接口数据格式异常");
  }

  return {
    apparentTemperature: readFiniteNumber(currentWeather.apparent_temperature),
    humidity: readFiniteNumber(currentWeather.relative_humidity_2m),
    latitude,
    longitude,
    temperature,
    updatedAt: Date.now(),
    weatherCode,
    windSpeed: readFiniteNumber(currentWeather.wind_speed_10m),
  };
}

function getCalendarMonthCells(monthDateValue: string): Array<{
  dateValue: string;
  isCurrentMonth: boolean;
}> {
  const monthStart = parseDateInputValue(monthDateValue);
  const firstDayOffset = (monthStart.getDay() + 6) % 7;
  const gridStart = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1 - firstDayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);

    return {
      dateValue: formatDateInput(date),
      isCurrentMonth: date.getMonth() === monthStart.getMonth(),
    };
  });
}

function formatCalendarMonthLabel(monthDateValue: string): string {
  const date = parseDateInputValue(monthDateValue);
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function formatDisplayDate(dateValue: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(`${dateValue}T00:00:00`));
}

function formatDisplayDateWithYear(dateValue: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(`${dateValue}T00:00:00`));
}

function getPlanDateSearchValues(dateValue: string): string[] {
  const [year = "", month = "", day = ""] = dateValue.split("-");
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  const compactMonth = Number.isFinite(monthNumber) && monthNumber > 0 ? String(monthNumber) : month;
  const compactDay = Number.isFinite(dayNumber) && dayNumber > 0 ? String(dayNumber) : day;
  const values = [
    dateValue,
    dateValue.replace(/-/g, "/"),
    compactMonth && compactDay ? `${compactMonth}月${compactDay}日` : "",
    year && compactMonth && compactDay ? `${year}年${compactMonth}月${compactDay}日` : "",
  ];

  try {
    values.push(formatDisplayDate(dateValue));
  } catch {
    // Keep search resilient for older or manually edited date keys.
  }

  return values.filter(Boolean);
}

function formatPlanSearchDate(dateValue: string): string {
  try {
    return formatDisplayDate(dateValue);
  } catch {
    return dateValue;
  }
}

function getPlanDateTime(dateValue: string): number {
  const time = new Date(`${dateValue}T00:00:00`).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getPlanSearchSummary(note: string | undefined): string {
  const normalizedNote = (note ?? "").trim().replace(/\s+/g, " ");
  if (normalizedNote.length <= 42) {
    return normalizedNote;
  }

  return `${normalizedNote.slice(0, 42)}...`;
}

function searchPlans(query: string, planBook: PlanBook): PlanSearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  return Object.entries(planBook)
    .flatMap(([date, items]) =>
      (Array.isArray(items) ? items : []).map((item, index) => ({
        date,
        index,
        item,
        key: `${date}-${item.id || index}`,
      })),
    )
    .filter(({ date, item }) => {
      const searchableValues = [
        item.title ?? "",
        item.note ?? "",
        item.category ?? "",
        ...getPlanDateSearchValues(date),
      ];

      return searchableValues.some((value) => value.toLowerCase().includes(normalizedQuery));
    })
    .sort((left, right) => {
      const dateDiff = getPlanDateTime(right.date) - getPlanDateTime(left.date);

      if (dateDiff !== 0) {
        return dateDiff;
      }

      return (right.item.updatedAt ?? right.item.createdAt ?? 0) - (left.item.updatedAt ?? left.item.createdAt ?? 0);
    })
    .slice(0, 20);
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
  titleLineHeight: number;
  titlePaddingY: number;
  titleLines: number;
  noteLines: number;
  showNotes: boolean;
};

function getExportDensity(planCount: number, template: ExportTemplate): ExportDensity {
  const taskTitleSize = Math.max(template.taskTitleSize + 4, 23);

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
      titleLineHeight: 1.38,
      titlePaddingY: 2,
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
      titleLineHeight: 1.4,
      titlePaddingY: 2,
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
      taskTitleSize: Math.min(Math.max(taskTitleSize - 4, 19), 21),
      metaSize: 11,
      noteSize: 12,
      titleLineHeight: 1.45,
      titlePaddingY: 3,
      titleLines: 2,
      noteLines: 1,
      showNotes: true,
    };
  }

  if (planCount <= 15) {
    return {
      columns: 3,
      maxVisibleItems: 15,
      gap: 10,
      cardHeight: 142,
      cardPadding: 13,
      checkboxSize: 28,
      categorySize: 11,
      taskTitleSize: Math.min(Math.max(taskTitleSize - 5, 18), 19),
      metaSize: 11,
      noteSize: 0,
      titleLineHeight: 1.48,
      titlePaddingY: 3,
      titleLines: 2,
      noteLines: 0,
      showNotes: false,
    };
  }

  if (planCount <= 24) {
    return {
      columns: 3,
      maxVisibleItems: 15,
      gap: 9,
      cardHeight: 136,
      cardPadding: 12,
      checkboxSize: 26,
      categorySize: 10,
      taskTitleSize: Math.min(Math.max(taskTitleSize - 6, 16), 18),
      metaSize: 10,
      noteSize: 0,
      titleLineHeight: 1.48,
      titlePaddingY: 3,
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
    titleLineHeight: 1.5,
    titlePaddingY: 2,
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

function formatDashboardDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));

  if (safeSeconds === 0) {
    return "0 分钟";
  }

  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`;
  }

  if (minutes > 0) {
    return remainingSeconds > 0
      ? `${minutes} 分钟 ${remainingSeconds} 秒`
      : `${minutes} 分钟`;
  }

  return `${remainingSeconds} 秒`;
}

function formatDashboardMinutes(minutes: number): string {
  return formatDashboardDuration(minutes * 60);
}

function formatSignedDashboardDuration(seconds: number): string {
  if (seconds === 0) {
    return "持平";
  }

  return `${seconds > 0 ? "+" : "-"}${formatDashboardDuration(Math.abs(seconds))}`;
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

  if (planCount <= 15) {
    return 82;
  }

  if (planCount <= 18) {
    return 58;
  }

  return 44;
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

  if (planCount <= 15) {
    return [
      { src: stickerA, style: { bottom: "10px", left: "22%", opacity: 0.48, transform: "translateX(-50%) rotate(-5deg)", width: "72px" } },
      { src: stickerB, style: { bottom: "10px", left: "50%", opacity: 0.48, transform: "translateX(-50%) rotate(-1deg)", width: "80px" } },
      { src: stickerC, style: { bottom: "10px", left: "78%", opacity: 0.48, transform: "translateX(-50%) rotate(5deg)", width: "72px" } },
    ];
  }

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

  if (planCount <= 15) {
    return [
      { src: stickerA, style: { bottom: "10px", left: "18%", opacity: 0.44, transform: "translateX(-50%) rotate(-6deg)", width: "70px" } },
      { src: stickerB, style: { bottom: "10px", left: "50%", opacity: 0.44, transform: "translateX(-50%) rotate(-2deg)", width: "78px" } },
      { src: stickerC, style: { bottom: "10px", left: "82%", opacity: 0.44, transform: "translateX(-50%) rotate(6deg)", width: "70px" } },
    ];
  }

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
        style: { bottom: "32px", left: "96px", opacity: 0.72, transform: "rotate(-8deg)", width: "72px" },
      },
      {
        src: stickerB,
        style: { bottom: "32px", opacity: 0.72, right: "118px", transform: "rotate(7deg)", width: "72px" },
      },
      {
        src: stickerC,
        style: { bottom: "28px", left: "50%", opacity: 0.74, transform: "translateX(-50%) rotate(-2deg)", width: "82px" },
      },
      {
        src: stickerD,
        style: { bottom: "92px", left: "32%", opacity: 0.46, transform: "rotate(4deg)", width: "42px" },
      },
      {
        src: stickerE,
        style: { bottom: "92px", opacity: 0.46, right: "32%", transform: "rotate(-3deg)", width: "42px" },
      },
      {
        src: stickerF,
        style: { bottom: "84px", opacity: 0.38, right: "82px", transform: "rotate(8deg)", width: "36px" },
      },
    ];
  }

  const [stickerA, stickerB, stickerC, stickerD, stickerE, stickerF] = getPrimaryPinkStickerSet(plans, selectedDate, 6);

  return [
    {
      src: stickerA,
      style: { bottom: "18px", left: "86px", opacity: 0.52, transform: "rotate(-8deg)", width: "46px" },
    },
    {
      src: stickerB,
      style: { bottom: "18px", opacity: 0.52, right: "92px", transform: "rotate(8deg)", width: "46px" },
    },
    {
      src: stickerC,
      style: { bottom: "16px", left: "318px", opacity: 0.44, transform: "rotate(-13deg)", width: "40px" },
    },
    {
      src: stickerD,
      style: { bottom: "16px", opacity: 0.44, right: "318px", transform: "rotate(2deg)", width: "40px" },
    },
    {
      src: stickerE,
      style: { bottom: "48px", left: "470px", opacity: 0.34, transform: "rotate(-3deg)", width: "30px" },
    },
    {
      src: stickerF,
      style: { bottom: "48px", opacity: 0.34, right: "70px", transform: "rotate(8deg)", width: "30px" },
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
  const maxVisibleItems = 15;
  const displayPlans = plans.slice(0, maxVisibleItems);
  const visiblePlanCount = displayPlans.length;
  const crowdedTaskGrid = visiblePlanCount > 12;
  const columns = visiblePlanCount <= 1 ? 1 : crowdedTaskGrid ? 3 : 2;
  const overflowCount = Math.max(planCount - displayPlans.length, 0);
  const dateLabel = formatDisplayDateWithYear(selectedDate);
  const denseTaskGrid = visiblePlanCount > 8;
  const compactTwoColumnGrid = visiblePlanCount > 6 && visiblePlanCount <= 8;
  const taskTitleSize = visiblePlanCount <= 4 ? 30 : visiblePlanCount <= 8 ? 25 : crowdedTaskGrid ? 18 : 20;
  const taskTitleLineClamp = denseTaskGrid || compactTwoColumnGrid ? 2 : visiblePlanCount <= 6 ? undefined : 3;
  const taskTitleLineHeight = crowdedTaskGrid ? 1.48 : denseTaskGrid ? 1.46 : compactTwoColumnGrid ? 1.42 : 1.36;
  const taskTitlePaddingY = denseTaskGrid || compactTwoColumnGrid ? 3 : 2;
  const taskTitleLineHeightPx = taskTitleSize * taskTitleLineHeight;
  const taskTitleMaxHeight = taskTitleLineClamp
    ? taskTitleLineHeightPx * taskTitleLineClamp + taskTitlePaddingY * 2
    : undefined;
  const noteSize = visiblePlanCount <= 4 ? 20 : visiblePlanCount <= 6 ? 18 : compactTwoColumnGrid ? 16 : 0;
  const noteLineClamp = compactTwoColumnGrid ? 1 : visiblePlanCount <= 6 ? undefined : 1;
  const showNotes = visiblePlanCount <= 8;
  const cardMinHeight = visiblePlanCount <= 2 ? 380 : visiblePlanCount <= 4 ? 270 : visiblePlanCount <= 6 ? 172 : 0;
  const taskTextIndent = crowdedTaskGrid ? 28 : denseTaskGrid ? 36 : 48;
  const taskCardPaddingTop = crowdedTaskGrid ? 14 : denseTaskGrid ? 18 : compactTwoColumnGrid ? 24 : 36;
  const taskCardPaddingX = crowdedTaskGrid ? 14 : denseTaskGrid ? 18 : compactTwoColumnGrid ? 20 : 22;
  const taskCardPaddingBottom = crowdedTaskGrid ? 12 : denseTaskGrid ? 14 : compactTwoColumnGrid ? 18 : 22;
  const taskGridGap = crowdedTaskGrid ? "12px" : denseTaskGrid ? "20px" : compactTwoColumnGrid ? "22px" : "24px";
  const taskBoardPaddingTop = crowdedTaskGrid ? 24 : denseTaskGrid ? 32 : compactTwoColumnGrid ? 36 : 42;
  const taskBoardPaddingX = crowdedTaskGrid ? 24 : denseTaskGrid ? 32 : compactTwoColumnGrid ? 36 : 42;
  const taskTitleGap = crowdedTaskGrid ? "8px" : denseTaskGrid ? "10px" : "12px";
  const taskTitlePaddingRight = crowdedTaskGrid ? "4px" : denseTaskGrid ? "18px" : "30px";
  const taskStatusWidth = crowdedTaskGrid ? "24px" : denseTaskGrid ? "30px" : "36px";
  const primaryStickerBottomPadding = getPrimaryPinkStickerBottomPadding(planCount);
  const taskRowCount = Math.max(1, Math.ceil(displayPlans.length / columns));
  const sectionRows =
    compactTwoColumnGrid || denseTaskGrid
      ? `repeat(${taskRowCount}, minmax(0, 1fr))`
      : displayPlans.length <= 2
        ? "auto"
        : displayPlans.length <= 4
          ? "repeat(2, auto)"
          : undefined;
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
	        <header
	          style={{
	            display: "grid",
	            gap: "24px",
	            gridTemplateColumns: "minmax(0, 1fr) 290px",
	            position: "relative",
	            zIndex: 4,
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
            zIndex: 4,
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
              overflow: "hidden",
              padding: `${taskBoardPaddingTop}px ${taskBoardPaddingX}px ${primaryStickerBottomPadding}px`,
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
            {getPrimaryPinkPageStickers(plans, selectedDate).map((sticker, stickerIndex) => (
              <img
                key={`primary-page-sticker-${stickerIndex}`}
                alt=""
                aria-hidden="true"
                decoding="sync"
                loading="eager"
                src={sticker.src}
                style={{
                  filter: "drop-shadow(0 14px 20px rgba(166, 94, 130, 0.16))",
                  pointerEvents: "none",
                  position: "absolute",
                  userSelect: "none",
                  zIndex: 1,
                  ...sticker.style,
                }}
              />
            ))}
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
                  position: "relative",
                  textAlign: "center",
                  zIndex: 5,
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
                  position: "relative",
                  width: "100%",
                  zIndex: 5,
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
                        borderRadius: denseTaskGrid ? "22px" : "26px",
                        boxShadow: "0 14px 30px rgba(154, 88, 123, 0.11)",
	                        boxSizing: "border-box",
	                        display: "flex",
	                        flexDirection: "column",
                          height: compactTwoColumnGrid || denseTaskGrid ? "100%" : undefined,
	                        isolation: "isolate",
	                        justifyContent: "flex-start",
                          maxWidth: "100%",
                          minHeight: cardMinHeight ? `${cardMinHeight}px` : 0,
                          minWidth: 0,
                          overflow: "hidden",
	                        padding: `${taskCardPaddingTop}px ${taskCardPaddingX}px ${taskCardPaddingBottom}px`,
	                        position: "relative",
                          width: "100%",
                          zIndex: 6,
	                      }}
	                    >
	                      <div
	                        className="export-task-line"
	                        style={{
	                          alignItems: "flex-start",
	                          color: item.completed ? "#806d7b" : "#3f3146",
	                          display: "flex",
	                          fontSize: `${taskTitleSize}px`,
	                          fontWeight: 800,
	                          gap: taskTitleGap,
	                          lineHeight: `${taskTitleLineHeightPx}px`,
	                          margin: 0,
	                          maxWidth: "100%",
	                          overflowWrap: "anywhere",
	                          padding: 0,
	                          paddingRight: taskTitlePaddingRight,
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
	                            flex: "0 0 auto",
	                            fontWeight: 800,
	                            lineHeight: `${taskTitleLineHeightPx}px`,
	                            paddingTop: `${taskTitlePaddingY}px`,
	                            textAlign: "center",
	                            width: taskStatusWidth,
	                          }}
	                        >
	                          {item.completed ? "☑" : "☐"}
	                        </span>
	                        <span
	                          className="export-task-text"
	                          style={{
	                            display: taskTitleLineClamp ? "-webkit-box" : "block",
	                            flex: "1 1 auto",
	                            boxSizing: "border-box",
	                            lineHeight: `${taskTitleLineHeightPx}px`,
	                            margin: 0,
	                            maxHeight: taskTitleMaxHeight ? `${taskTitleMaxHeight}px` : undefined,
	                            minWidth: 0,
	                            overflow: taskTitleLineClamp ? "hidden" : "visible",
	                            padding: `${taskTitlePaddingY}px 0`,
	                            WebkitBoxOrient: taskTitleLineClamp ? "vertical" : undefined,
	                            WebkitLineClamp: taskTitleLineClamp,
	                          }}
	                        >
	                          {item.title}
	                        </span>
                      </div>

                      {noteVisible ? (
                        <div
                          style={{
                            color: "#8f6f82",
                            display: noteLineClamp ? "-webkit-box" : "block",
                            fontSize: `${noteSize}px`,
	                            fontWeight: 750,
	                            lineHeight: 1.45,
	                            marginTop: compactTwoColumnGrid ? "8px" : "10px",
	                            overflow: noteLineClamp ? "hidden" : "visible",
                            overflowWrap: "anywhere",
                            paddingLeft: `${taskTextIndent}px`,
                            position: "relative",
	                            wordBreak: "break-word",
	                            WebkitBoxOrient: noteLineClamp ? "vertical" : undefined,
	                            WebkitLineClamp: noteLineClamp,
	                            zIndex: 2,
                          }}
                        >
                          {item.note}
                        </div>
                      ) : null}

                      {durationText ? (
                        <div
                          className="export-task-time-row"
                          style={{
                            color: "#987486",
                            display: denseTaskGrid ? "-webkit-box" : "block",
                            fontSize: denseTaskGrid ? "15px" : "17px",
                            fontWeight: 750,
                            lineHeight: 1.42,
                            marginTop: noteVisible ? "8px" : "10px",
                            overflow: denseTaskGrid ? "hidden" : "visible",
                            overflowWrap: "anywhere",
                            paddingLeft: `${taskTextIndent}px`,
                            position: "relative",
                            wordBreak: "break-word",
                            WebkitBoxOrient: denseTaskGrid ? "vertical" : undefined,
                            WebkitLineClamp: denseTaskGrid ? 1 : undefined,
                            zIndex: 2,
                          }}
                        >
                          {durationText}
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
  const dateLabel = formatDisplayDateWithYear(selectedDate);
  const footerText = encouragementText ?? template.footer;
  const dailyWord = getExportDailyWord(selectedDate, template);
  const isMedicalTemplate = template.id === "medical-study";
  const exportTaskTitleLineHeightPx = density.taskTitleSize * density.titleLineHeight;
  const exportTaskTitleMaxHeight =
    exportTaskTitleLineHeightPx * density.titleLines + density.titlePaddingY * 2;
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
  const shouldClampExportTaskText = plans.length > 6;
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
                  zIndex: 1,
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
                zIndex: 3,
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
                        overflow: "hidden",
	                      padding: `${density.cardPadding}px`,
                      position: "relative",
                      zIndex: 4,
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
                        zIndex: 5,
                      }}
                    >
                      <div
                        className="export-task-line"
                        style={{
                          alignItems: "flex-start",
                          color: item.completed ? template.muted : template.ink,
                          display: "flex",
                          gap: density.columns === 3 ? "8px" : "12px",
                          fontSize: `${density.taskTitleSize}px`,
                          fontWeight: 800,
                          letterSpacing: 0,
                          lineHeight: `${exportTaskTitleLineHeightPx}px`,
                          marginBottom: "0",
                          overflowWrap: "anywhere",
                          wordBreak: "break-word",
                        }}
                      >
                        <span
                          aria-hidden="true"
                          className="export-task-status"
                          style={{
                            color: item.completed ? cardAccent : template.checkbox,
                            flex: "0 0 auto",
                            fontWeight: 800,
                            lineHeight: `${exportTaskTitleLineHeightPx}px`,
                            paddingTop: `${density.titlePaddingY}px`,
                          }}
                        >
                          {item.completed ? "☑" : "☐"}
                        </span>
                        <span
                          className="export-task-text"
                          style={{
                            display: shouldClampExportTaskText ? "-webkit-box" : "block",
                            flex: "1 1 auto",
                            boxSizing: "border-box",
                            lineHeight: `${exportTaskTitleLineHeightPx}px`,
                            maxHeight: shouldClampExportTaskText ? `${exportTaskTitleMaxHeight}px` : undefined,
                            minWidth: 0,
                            overflow: shouldClampExportTaskText ? "hidden" : "visible",
                            padding: `${density.titlePaddingY}px 0`,
                            textDecoration: "none",
                            WebkitBoxOrient: shouldClampExportTaskText ? "vertical" : undefined,
                            WebkitLineClamp: shouldClampExportTaskText ? density.titleLines : undefined,
                          }}
                        >
                          {item.title}
                        </span>
                      </div>

                      {noteVisible ? (
                        <div
                          className="export-task-note"
                          style={{
                            color: template.muted,
                            display: shouldClampExportTaskText ? "-webkit-box" : "block",
                            fontSize: `${Math.max(density.noteSize + 3, 15)}px`,
                            fontWeight: 750,
                            lineHeight: 1.4,
                            marginTop: "8px",
                            overflow: shouldClampExportTaskText ? "hidden" : "visible",
                            paddingLeft: density.columns === 3 ? "0" : "40px",
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                            WebkitBoxOrient: shouldClampExportTaskText ? "vertical" : undefined,
                            WebkitLineClamp: shouldClampExportTaskText ? density.noteLines : undefined,
                          }}
                        >
                          {item.note}
                        </div>
                      ) : null}

                      {durationText ? (
                        <div
                          className="export-task-time-row"
                          style={{
                            color: template.muted,
                            fontSize: `${Math.max(density.metaSize + 3, 14)}px`,
                            fontWeight: 750,
                            lineHeight: 1.42,
                            marginTop: noteVisible ? "8px" : "10px",
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

type ChinaHolidayDatePickerProps = {
  calendarMonthDate: string;
  holidayMap: Map<string, ChinaHolidayInfo>;
  onCalendarMonthDateChange: (dateValue: string) => void;
  onSelectDate: (dateValue: string) => void;
  selectedDate: string;
  summaryAside?: ReactNode;
  today: string;
};

type WeatherWidgetProps = {
  onRefresh: () => void;
  weatherState: WeatherState;
};

type MoodWidgetProps = {
  entryCount: number;
  latestEntry: MoodEntry | null;
  onOpen: () => void;
};

type MoodTimelineCardProps = {
  entries: MoodEntry[];
  selectedDate: string;
};

function WeatherWidget({ onRefresh, weatherState }: WeatherWidgetProps) {
  const snapshot = weatherState.data;
  const condition = snapshot ? getWeatherCondition(snapshot.weatherCode) : null;
  const isLoading = weatherState.status === "loading" || weatherState.isRefreshing;
  const detailText = snapshot
    ? `${condition?.text ?? "天气"} · ${snapshot.humidity !== null ? `湿度 ${Math.round(snapshot.humidity)}%` : `更新 ${formatWeatherUpdatedTime(snapshot.updatedAt)}`}`
    : weatherState.message || "等待定位";

  return (
    <button
      aria-label={snapshot ? "刷新天气" : "获取天气"}
      className="flex min-h-[3.8rem] w-full items-center gap-2 rounded-2xl border border-sky-100 bg-sky-50/75 px-3 py-2 text-left shadow-sm outline-none transition hover:bg-sky-100/75 focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
      type="button"
      onClick={onRefresh}
    >
      <span aria-hidden="true" className="shrink-0 text-xl leading-none">
        {condition?.icon ?? (isLoading ? "🌡️" : "☀️")}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-black text-sky-800">
          {snapshot ? formatWeatherTemperature(snapshot.temperature) : isLoading ? "更新中" : "天气"}
        </span>
        <span className="mt-0.5 block truncate text-[11px] font-bold text-sky-700/80">
          {isLoading && snapshot ? "正在更新" : detailText}
        </span>
      </span>
    </button>
  );
}

function MoodWidget({ entryCount, latestEntry, onOpen }: MoodWidgetProps) {
  const moodOption = latestEntry ? getMoodOption(latestEntry.moodId) : null;

  return (
    <button
      id="mood-open-button"
      className="flex min-h-[3.8rem] w-full items-center gap-2 rounded-2xl border border-pink-100 bg-pink-50/75 px-3 py-2 text-left shadow-sm outline-none transition hover:bg-pink-100/75 focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
      type="button"
      onClick={onOpen}
    >
      <span aria-hidden="true" className="shrink-0 text-xl leading-none">
        {moodOption?.icon ?? "💗"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-black text-pink-700">
          {moodOption ? moodOption.label : "当日心情"}
        </span>
        <span className="mt-0.5 block truncate text-[11px] font-bold text-pink-700/80">
          {entryCount > 0 ? `${entryCount} 次记录` : "记录此刻"}
        </span>
      </span>
    </button>
  );
}

function MoodTimelineCard({ entries, selectedDate }: MoodTimelineCardProps) {
  const sortedEntries = [...entries].sort((left, right) => left.timestamp - right.timestamp);
  const width = 680;
  const height = 250;
  const chart = { bottom: 38, left: 52, right: 24, top: 24 };
  const chartWidth = width - chart.left - chart.right;
  const chartHeight = height - chart.top - chart.bottom;
  const getX = (timestamp: number) => {
    const date = new Date(timestamp);
    const minutes = date.getHours() * 60 + date.getMinutes();

    return chart.left + (minutes / (24 * 60 - 1)) * chartWidth;
  };
  const getY = (score: number) =>
    chart.top + ((MOOD_OPTIONS.length - score) / (MOOD_OPTIONS.length - 1)) * chartHeight;
  const points = sortedEntries.map((entry) => {
    const option = getMoodOption(entry.moodId);

    return {
      entry,
      option,
      x: getX(entry.timestamp),
      y: getY(option.score),
    };
  });
  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
  const latestPoint = points[points.length - 1] ?? null;

  return (
    <section className="rounded-[1.35rem] border border-pink-100 bg-white p-4 shadow-sm shadow-pink-100/60">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-black text-pink-600">心情轨迹</p>
          <h3 className="mt-1 text-lg font-black text-[#3f3349]">
            {formatDisplayDateWithYear(selectedDate)}
          </h3>
        </div>
        <span className="rounded-full bg-pink-50 px-3 py-1 text-xs font-black text-pink-700">
          {entries.length} 次记录
        </span>
      </div>

      <div className="overflow-hidden rounded-[1rem] border border-pink-50 bg-[#fff8fb] px-2 py-3">
        <svg
          aria-label="当天心情轨迹图"
          className="h-64 w-full"
          preserveAspectRatio="none"
          viewBox={`0 0 ${width} ${height}`}
        >
          {[1, 2, 3, 4, 5, 6].map((score) => {
            const y = getY(score);

            return (
              <g key={score}>
                <line
                  stroke="#fce7f3"
                  strokeWidth="1"
                  x1={chart.left}
                  x2={width - chart.right}
                  y1={y}
                  y2={y}
                />
                <text
                  fill="#9b8ca4"
                  fontSize="10"
                  fontWeight="700"
                  textAnchor="end"
                  x={chart.left - 8}
                  y={y + 4}
                >
                  {score}
                </text>
              </g>
            );
          })}
          {[0, 6, 12, 18, 24].map((hour) => {
            const x = chart.left + (hour / 24) * chartWidth;

            return (
              <g key={hour}>
                <line
                  stroke="#fbcfe8"
                  strokeDasharray="4 6"
                  strokeWidth="1"
                  x1={x}
                  x2={x}
                  y1={chart.top}
                  y2={height - chart.bottom}
                />
                <text
                  fill="#8b7b91"
                  fontSize="11"
                  fontWeight="800"
                  textAnchor={hour === 0 ? "start" : hour === 24 ? "end" : "middle"}
                  x={x}
                  y={height - 12}
                >
                  {String(hour).padStart(2, "0")}:00
                </text>
              </g>
            );
          })}
          {points.length > 1 ? (
            <path d={linePath} fill="none" stroke="#ec4899" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
          ) : null}
          {points.map((point) => (
            <g key={point.entry.id}>
              <circle cx={point.x} cy={point.y} fill="#ffffff" r="10" stroke={point.option.swatch} strokeWidth="3" />
              <text dominantBaseline="central" fontSize="14" textAnchor="middle" x={point.x} y={point.y + 0.5}>
                {point.option.icon}
              </text>
            </g>
          ))}
          {points.length === 0 ? (
            <text fill="#9b8ca4" fontSize="16" fontWeight="800" textAnchor="middle" x={width / 2} y={height / 2}>
              暂无心情记录
            </text>
          ) : null}
        </svg>
      </div>

      {latestPoint ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-black text-[#6f5d78]">
          <span className={`rounded-full border px-3 py-1 ${latestPoint.option.toneClass}`}>
            最近：{latestPoint.option.icon} {latestPoint.option.label}
          </span>
          <span className="rounded-full bg-slate-50 px-3 py-1">
            {formatClockTime(latestPoint.entry.timestamp)}
          </span>
          {latestPoint.entry.note ? (
            <span className="min-w-0 max-w-full truncate rounded-full bg-white px-3 py-1">
              {latestPoint.entry.note}
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ChinaHolidayDatePicker({
  calendarMonthDate,
  holidayMap,
  onCalendarMonthDateChange,
  onSelectDate,
  selectedDate,
  summaryAside,
  today,
}: ChinaHolidayDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dateSearchInput, setDateSearchInput] = useState("");
  const [dateSearchError, setDateSearchError] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedHolidayInfo = getChinaHolidayInfo(selectedDate, holidayMap);
  const calendarCells = useMemo(
    () => getCalendarMonthCells(calendarMonthDate),
    [calendarMonthDate],
  );
  const selectedSpecialText = getChinaSpecialDateText(selectedHolidayInfo);
  const selectedLunarText = formatChinaLunarDisplayDate(selectedDate);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;

      if (target && rootRef.current?.contains(target)) {
        return;
      }

      setIsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen]);

  const openCalendar = () => {
    onCalendarMonthDateChange(getMonthStartDateValue(selectedDate));
    setIsOpen((current) => !current);
  };

  const selectDate = (dateValue: string) => {
    onSelectDate(dateValue);
    onCalendarMonthDateChange(getMonthStartDateValue(dateValue));
    setDateSearchInput("");
    setDateSearchError("");
    setIsOpen(false);
  };

  const handleDateSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedDate = parseDateSearchInput(
      dateSearchInput,
      getDateInputYear(selectedDate),
      holidayMap,
    );

    if (!parsedDate) {
      setDateSearchError("请输入有效日期或节日名称");
      return;
    }

    selectDate(parsedDate);
  };

  return (
    <div className="relative" ref={rootRef}>
      <form className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center" onSubmit={handleDateSearchSubmit}>
        <label
          className="shrink-0 text-sm font-bold text-[#6f5d78]"
          htmlFor="planner-date-search"
        >
          选择日期
        </label>
        <input
          className="min-w-0 flex-1 rounded-2xl border border-pink-100 bg-white px-3 py-2 text-sm font-bold text-[#46394f] shadow-sm outline-none transition placeholder:text-[#b8aabd] focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
          id="planner-date-search"
          inputMode="text"
          placeholder="输入日期、节日或农历关键词"
          value={dateSearchInput}
          onChange={(event) => {
            setDateSearchInput(event.target.value);
            setDateSearchError("");
          }}
        />
        <button
          className="shrink-0 rounded-2xl bg-pink-50 px-3 py-2 text-sm font-black text-pink-600 transition hover:bg-pink-100 disabled:opacity-50"
          disabled={!dateSearchInput.trim()}
          type="submit"
        >
          前往
        </button>
      </form>
      {dateSearchError ? (
        <p className="-mt-1 mb-2 text-xs font-bold text-rose-600">{dateSearchError}</p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          aria-expanded={isOpen}
          className="flex min-h-[3.8rem] min-w-0 flex-1 items-center justify-center rounded-2xl border border-pink-100 bg-white px-4 py-3 text-center text-[#46394f] shadow-sm outline-none transition hover:bg-pink-50/50 focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
          id="planner-date"
          type="button"
          onClick={openCalendar}
        >
          <span className="flex min-h-full items-center justify-center truncate text-base font-black leading-none">
            {formatDisplayDateWithYear(selectedDate)}
          </span>
        </button>
        {summaryAside ? <div className="min-w-0 sm:w-auto sm:shrink-0">{summaryAside}</div> : null}
      </div>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="absolute right-0 top-[calc(100%+10px)] z-[9999] w-[min(92vw,24rem)] rounded-[1.5rem] border border-pink-100 bg-white/95 p-3 shadow-2xl shadow-pink-200/50 backdrop-blur"
            data-export-ignore="true"
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <button
                aria-label="上一月"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-pink-50 text-lg font-black text-pink-600 transition hover:bg-pink-100"
                type="button"
                onClick={() => onCalendarMonthDateChange(addMonthsToDateValue(calendarMonthDate, -1))}
              >
                ‹
              </button>
              <div className="text-center">
                <p className="text-base font-black text-[#46394f]">
                  {formatCalendarMonthLabel(calendarMonthDate)}
                </p>
              </div>
              <button
                aria-label="下一月"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-pink-50 text-lg font-black text-pink-600 transition hover:bg-pink-100"
                type="button"
                onClick={() => onCalendarMonthDateChange(addMonthsToDateValue(calendarMonthDate, 1))}
              >
                ›
              </button>
            </div>

            <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px] font-black text-[#9b8ca4]">
              {WEEKDAY_LABELS.map((weekday) => (
                <span key={weekday}>周{weekday}</span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {calendarCells.map(({ dateValue, isCurrentMonth }) => {
                const holidayInfo = getChinaHolidayInfo(dateValue, holidayMap);
                const isSelected = dateValue === selectedDate;
                const isToday = dateValue === today;
                const dayNumber = Number(dateValue.slice(8, 10));
                const badgeText = holidayInfo.isHoliday
                  ? "休"
                  : holidayInfo.isWorkday
                    ? "班"
                    : "";
                const holidayName = getChinaCalendarDateName(holidayInfo);
                const lunarLabel = formatChinaLunarCellLabel(dateValue);
                const toneClass = isSelected
                  ? "border-pink-400 bg-[#ff8fbc] text-white shadow-sm shadow-pink-200"
                  : holidayInfo.type === "statutory-holiday"
                    ? "border-rose-100 bg-rose-50 text-rose-700 hover:bg-rose-100"
                    : holidayInfo.type === "adjusted-workday"
                      ? "border-amber-100 bg-amber-50 text-amber-800 hover:bg-amber-100"
                      : holidayInfo.type === "weekend"
                        ? "border-slate-100 bg-slate-50/80 text-[#65566f] hover:bg-white"
                        : holidayInfo.type === "observance"
                          ? "border-violet-100 bg-violet-50/70 text-violet-800 hover:bg-violet-100"
                        : "border-white bg-white/80 text-[#46394f] hover:bg-pink-50";

                return (
                  <button
                    aria-label={`${dateValue} ${holidayName} ${lunarLabel ? `农历${lunarLabel}` : ""}`.trim()}
                    className={`relative flex min-h-[4.25rem] flex-col items-start rounded-xl border px-1.5 py-1 text-left transition focus:outline-none focus:ring-4 focus:ring-pink-100 ${toneClass} ${
                      isCurrentMonth ? "" : "opacity-35"
                    } ${isToday && !isSelected ? "ring-2 ring-sky-200" : ""}`}
                    key={dateValue}
                    type="button"
                    onClick={() => selectDate(dateValue)}
                  >
                    {badgeText ? (
                      <span
                        className={`absolute right-1 top-1 rounded-full px-1 text-[10px] font-black leading-4 ${
                          isSelected
                            ? "bg-white/90 text-pink-600"
                            : holidayInfo.isWorkday
                              ? "bg-amber-200 text-amber-900"
                              : "bg-rose-200 text-rose-700"
                        }`}
                      >
                        {badgeText}
                      </span>
                    ) : null}
                    <span className="text-sm font-black tabular-nums">{dayNumber}</span>
                    <span className="mt-auto w-full min-w-0">
                      {holidayName ? (
                        <span
                          className={`block w-full truncate text-[10px] font-black leading-3 ${
                            isSelected ? "text-white/95" : ""
                          }`}
                        >
                          {holidayName}
                        </span>
                      ) : null}
                      {lunarLabel ? (
                        <span
                          className={`block w-full truncate text-[9px] font-bold leading-3 ${
                            isSelected
                              ? "text-white/85"
                              : holidayName
                                ? "text-[#8b7b91]"
                                : "text-[#9b8ca4]"
                          }`}
                        >
                          {lunarLabel}
                        </span>
                      ) : (
                        <span className="block h-3" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-pink-50 pt-3">
              <p className="min-w-0 text-xs font-bold text-[#8b7b91]">
                选中：{selectedSpecialText || "无特殊节日"}
                {selectedLunarText ? ` · 农历${selectedLunarText}` : ""}
              </p>
              <button
                className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-black text-sky-700 transition hover:bg-sky-100"
                type="button"
                onClick={() => selectDate(today)}
              >
                今天
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function App() {
  const today = useMemo(() => formatDateInput(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [calendarMonthDate, setCalendarMonthDate] = useState<string>(() =>
    getMonthStartDateValue(today),
  );
  const [chinaHolidayRecordsByYear, setChinaHolidayRecordsByYear] = useState<
    Record<number, ChinaHolidayInfo[]>
  >(() => CHINA_HOLIDAY_FALLBACK_BY_YEAR);
  const [chinaHolidaySourceByYear, setChinaHolidaySourceByYear] = useState<
    Record<number, ChinaHolidayDataSource>
  >(
    () =>
      Object.fromEntries(
        Object.keys(CHINA_HOLIDAY_FALLBACK_BY_YEAR).map((year) => [Number(year), "fallback"]),
      ) as Record<number, ChinaHolidayDataSource>,
  );
  const [weatherState, setWeatherState] = useState<WeatherState>(() => {
    const cachedWeather = loadCachedWeatherSnapshot();

    return cachedWeather
      ? {
          data: cachedWeather,
          isRefreshing: false,
          message: "",
          status: "ready",
        }
      : {
          data: null,
          isRefreshing: false,
          message: "等待定位",
          status: "idle",
        };
  });
  const [plansByDate, setPlansByDate] = useState<PlanBook>(() => loadPlanBook());
  const [complexProjectBook, setComplexProjectBook] = useState<ComplexProjectBook>(() =>
    loadComplexProjectBook(),
  );
  const [moodBook, setMoodBook] = useState<MoodBook>(() => loadMoodBook());
  const [userProfile, setUserProfile] = useState<UserProfile>(() => loadUserProfile());
  const [complexProjectForm, setComplexProjectForm] = useState<ComplexProjectForm>(() =>
    createEmptyComplexProjectForm(selectedDate),
  );
  const [editingComplexProjectId, setEditingComplexProjectId] = useState<string | null>(null);
  const [isComplexProjectFormOpen, setIsComplexProjectFormOpen] = useState<boolean>(false);
  const [complexProjectFormError, setComplexProjectFormError] = useState<string>("");
  const [complexProjectPhaseForm, setComplexProjectPhaseForm] =
    useState<ComplexProjectPhaseForm>(() =>
      createEmptyComplexProjectPhaseForm(null, selectedDate),
    );
  const [complexProjectPhaseEdit, setComplexProjectPhaseEdit] =
    useState<ComplexProjectPhaseEdit | null>(null);
  const [complexProjectPhaseFormError, setComplexProjectPhaseFormError] = useState<string>("");
  const [complexProjectPhaseMessage, setComplexProjectPhaseMessage] = useState<string>("");
  const [phaseTimeDetailTarget, setPhaseTimeDetailTarget] =
    useState<ComplexProjectPhaseTimeDetailTarget | null>(null);
  const [taskTimeDetailTarget, setTaskTimeDetailTarget] = useState<TaskTimeDetailTarget | null>(
    null,
  );
  const [ganttPreviewProjectId, setGanttPreviewProjectId] = useState<string | null>(null);
  const [ganttExportProjectId, setGanttExportProjectId] = useState<string | null>(null);
  const [ganttExportWidth, setGanttExportWidth] = useState<number>(1020);
  const [form, setForm] = useState<PlanForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [taskInlineEdit, setTaskInlineEdit] = useState<TaskInlineFieldEdit | null>(null);
  const [inlineTitleDraft, setInlineTitleDraft] = useState<string>("");
  const [inlineNoteDraft, setInlineNoteDraft] = useState<string>("");
  const [targetMinutesEditDraft, setTargetMinutesEditDraft] = useState<string>("");
  const [targetMinutesEditError, setTargetMinutesEditError] = useState<string>("");
  const [completionFeedback, setCompletionFeedback] = useState<CompletionFeedback | null>(null);
  const [complexProjectFeedback, setComplexProjectFeedback] =
    useState<ComplexProjectCompletionFeedback | null>(null);
  const [actualEditId, setActualEditId] = useState<string | null>(null);
  const [actualMinutesDraft, setActualMinutesDraft] = useState<string>("");
  const [actualMinutesError, setActualMinutesError] = useState<string>("");
  const [planSearchQuery, setPlanSearchQuery] = useState<string>("");
  const [isPlanSearchOpen, setIsPlanSearchOpen] = useState<boolean>(false);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTab>("tasks");
  const [todayWorkspaceCollapsed, setTodayWorkspaceCollapsed] =
    useState<TodayWorkspaceCollapsedState>(() => DEFAULT_TODAY_WORKSPACE_COLLAPSED_STATE);
  const [isTaskFormOpen, setIsTaskFormOpen] = useState<boolean>(false);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverPriority, setDragOverPriority] = useState<TaskPriority | null>(null);
  const [taskDropTarget, setTaskDropTarget] = useState<TaskDropTarget | null>(null);
  const [taskTimersByTaskId, setTaskTimersByTaskId] = useState<TaskTimersByTaskId>({});
  const [timerTick, setTimerTick] = useState<number>(() => Date.now());
  const [timerNotice, setTimerNotice] = useState<string>("");
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>(() =>
    loadCustomCategories(),
  );
  const [customCategoryInput, setCustomCategoryInput] = useState<string>("");
  const [customCategoryStatus, setCustomCategoryStatus] = useState<string>("");
  const [isCustomCategoryOpen, setIsCustomCategoryOpen] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isGanttExporting, setIsGanttExporting] = useState<boolean>(false);
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
    isSupabaseConfigured ? "" : "Supabase 环境变量未配置，请先配置登录服务",
  );
  const [cloudStatus, setCloudStatus] = useState<string>(() =>
    isSupabaseConfigured ? "本地模式" : "Supabase 环境变量未配置，本地模式",
  );
  const [isAuthPanelOpen, setIsAuthPanelOpen] = useState<boolean>(() =>
    hasPasswordRecoveryMarker(),
  );
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState<boolean>(false);
  const [isAuthBusy, setIsAuthBusy] = useState<boolean>(false);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(() => isSupabaseConfigured);
  const [isCloudSaving, setIsCloudSaving] = useState<boolean>(false);
  const [isMoodPanelOpen, setIsMoodPanelOpen] = useState<boolean>(false);
  const [moodDraftId, setMoodDraftId] = useState<MoodId>(DEFAULT_MOOD_ID);
  const [moodNoteDraft, setMoodNoteDraft] = useState<string>("");
  const [moodStatus, setMoodStatus] = useState<string>("");
  const [isMoodExporting, setIsMoodExporting] = useState<boolean>(false);
  const journalRef = useRef<HTMLDivElement | null>(null);
  const exportRef = useRef<HTMLDivElement | null>(null);
  const ganttExportRef = useRef<HTMLDivElement | null>(null);
  const moodTimelineRef = useRef<HTMLDivElement | null>(null);
  const feedbackTimer = useRef<number | null>(null);
  const complexProjectFeedbackTimer = useRef<number | null>(null);
  const timerNoticeTimer = useRef<number | null>(null);
  const highlightedTaskTimer = useRef<number | null>(null);
  const cloudTimer = useRef<number | null>(null);
  const weatherPermissionDenied = useRef<boolean>(false);
  const skipInlineBlurSave = useRef<boolean>(false);
  const cloudReady = useRef<boolean>(false);
  const latestPlanBook = useRef<PlanBook>(plansByDate);
  const latestComplexProjectBook = useRef<ComplexProjectBook>(complexProjectBook);
  const latestMoodBook = useRef<MoodBook>(moodBook);
  const latestUserProfile = useRef<UserProfile>(userProfile);
  const latestDeletedItemIds = useRef<string[]>(deletedItemIds);
  const latestCustomCategories = useRef<CustomCategory[]>(customCategories);
  const currentUserId = currentUser?.id ?? null;
  const selectedAvatar = getAvatarOption(userProfile.avatarId);
  const ganttExportProject = ganttExportProjectId
    ? complexProjectBook[ganttExportProjectId] ?? null
    : null;

  const refreshWeather = useCallback(async (options: WeatherRefreshOptions = {}) => {
    if (weatherPermissionDenied.current && !options.force) {
      return;
    }

    if (!("geolocation" in navigator)) {
      setWeatherState((current) => ({
        data: current.data,
        isRefreshing: false,
        message: "当前浏览器不支持定位",
        status: current.data ? "ready" : "unavailable",
      }));
      return;
    }

    setWeatherState((current) => ({
      data: current.data,
      isRefreshing: true,
      message: options.silent && current.data ? current.message : "正在更新天气",
      status: current.data ? "ready" : "loading",
    }));

    try {
      const position = await requestBrowserPosition();
      const snapshot = await fetchWeatherSnapshot(
        position.coords.latitude,
        position.coords.longitude,
      );

      weatherPermissionDenied.current = false;
      saveCachedWeatherSnapshot(snapshot);
      setWeatherState({
        data: snapshot,
        isRefreshing: false,
        message: "",
        status: "ready",
      });
    } catch (error) {
      const staleWeather = loadCachedWeatherSnapshot(true);
      const fallbackMessage = getWeatherErrorMessage(error);
      const denied = isGeolocationPermissionDenied(error);

      weatherPermissionDenied.current = denied;
      setWeatherState((current) => {
        const fallbackData = current.data ?? staleWeather;

        return {
          data: fallbackData,
          isRefreshing: false,
          message: fallbackMessage,
          status: denied ? "permission-denied" : fallbackData ? "ready" : "error",
        };
      });
    }
  }, []);

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
  const complexProjectCategoryOptions = useMemo(() => {
    const hasSelectedCategory = categoryOptions.some(
      (category) => category.name === complexProjectForm.category,
    );

    return hasSelectedCategory
      ? categoryOptions
      : [
          ...categoryOptions,
          {
            id: complexProjectForm.category,
            name: complexProjectForm.category,
            icon: "🏷️",
          },
        ];
  }, [categoryOptions, complexProjectForm.category]);
  const complexProjects = useMemo(
    () =>
      Object.values(complexProjectBook).sort((left, right) => {
        const timeDifference = getComplexProjectTime(right) - getComplexProjectTime(left);

        if (timeDifference !== 0) {
          return timeDifference;
        }

        return left.title.localeCompare(right.title);
      }),
    [complexProjectBook],
  );
  const dailyComplexProjects = useMemo(
    () =>
      complexProjects
        .filter(
          (project) =>
            project.status !== "archived" &&
            isDateInRange(selectedDate, project.startDate, project.endDate),
        )
        .sort((left, right) => {
          const statusDifference =
            (left.status === "completed" ? 1 : 0) - (right.status === "completed" ? 1 : 0);

          if (statusDifference !== 0) {
            return statusDifference;
          }

          const priorityDifference = getPriorityIndex(left.priority) - getPriorityIndex(right.priority);

          if (priorityDifference !== 0) {
            return priorityDifference;
          }

          const phaseDifference =
            (getCurrentComplexProjectPhase(right, selectedDate) ? 1 : 0) -
            (getCurrentComplexProjectPhase(left, selectedDate) ? 1 : 0);

          if (phaseDifference !== 0) {
            return phaseDifference;
          }

          const endDateDifference = left.endDate.localeCompare(right.endDate);

          if (endDateDifference !== 0) {
            return endDateDifference;
          }

          return left.title.localeCompare(right.title);
        }),
    [complexProjects, selectedDate],
  );
  const chinaHolidayMap = useMemo(() => {
    const holidayMap = new Map<string, ChinaHolidayInfo>();

    Object.values(chinaHolidayRecordsByYear)
      .flat()
      .forEach((record) => {
        holidayMap.set(record.date, record);
      });

    return holidayMap;
  }, [chinaHolidayRecordsByYear]);
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
  const selectedMoodEntries = useMemo(
    () => [...(moodBook[selectedDate] ?? [])].sort((left, right) => left.timestamp - right.timestamp),
    [moodBook, selectedDate],
  );
  const latestMoodEntry = selectedMoodEntries[selectedMoodEntries.length - 1] ?? null;
  const phaseTimeDetailProject = phaseTimeDetailTarget
    ? complexProjectBook[phaseTimeDetailTarget.projectId] ?? null
    : null;
  const phaseTimeDetailPhase =
    phaseTimeDetailProject && phaseTimeDetailTarget
      ? phaseTimeDetailProject.phases.find((phase) => phase.id === phaseTimeDetailTarget.phaseId) ??
        null
      : null;
  const phaseTimeDetailEntries =
    phaseTimeDetailPhase && phaseTimeDetailTarget
      ? getComplexProjectPhaseEntriesForDate(phaseTimeDetailPhase, phaseTimeDetailTarget.date)
      : [];
  const phaseTimeDetailTotalSeconds = phaseTimeDetailEntries.reduce(
    (totalSeconds, entry) => totalSeconds + getComplexProjectPhaseEntrySeconds(entry, timerTick),
    0,
  );
  const taskTimeDetailItem =
    taskTimeDetailTarget
      ? (plansByDate[taskTimeDetailTarget.date] ?? []).find(
          (item) => item.id === taskTimeDetailTarget.itemId,
        ) ?? null
      : null;
  const taskTimeDetailEntries =
    taskTimeDetailItem && taskTimeDetailTarget
      ? getTaskTimeEntriesForDate(taskTimeDetailItem, taskTimeDetailTarget.date)
      : [];
  const taskTimeDetailTotalSeconds = taskTimeDetailEntries.reduce(
    (totalSeconds, entry) => totalSeconds + getTaskTimeEntrySeconds(entry, timerTick),
    0,
  );
  const planSearchResults = useMemo(
    () => searchPlans(planSearchQuery, plansByDate),
    [planSearchQuery, plansByDate],
  );
  const plansByPriority = useMemo(
    () =>
      PRIORITY_OPTIONS.map((priorityOption) => ({
        ...priorityOption,
        plans: getSortedPlansForPriority(plans, priorityOption.id),
      })),
    [plans],
  );
  const completedCount = plans.filter((item) => item.completed).length;
  const progress = plans.length > 0 ? Math.round((completedCount / plans.length) * 100) : 0;
  const isDailyComplexProjectsCollapsed = todayWorkspaceCollapsed.longProjects;
  const dailyTimeStats = useMemo<DailyTimeStats>(() => {
    const targetTotalMinutes = getTotalMinutes(plans, "targetMinutes");
    const savedActualMinutes = getTotalMinutes(plans, "actualMinutes");
    const completedPlans = plans.filter((item) => item.completed);
    const unfinishedPlans = plans.filter((item) => !item.completed);
    const plannedTimePlans = plans.filter((item) => item.targetMinutes);
    const projectActualSeconds = complexProjects.reduce(
      (totalSeconds, project) =>
        totalSeconds + getComplexProjectSecondsForDate(project, selectedDate, timerTick),
      0,
    );
    const projectSessionCount = complexProjects.reduce(
      (count, project) => count + getComplexProjectSessionCountForDate(project, selectedDate),
      0,
    );
    const projectActiveTimerCount = complexProjects.reduce(
      (count, project) =>
        count +
        project.phases.filter((phase) => phase.timeEntries.some((entry) => !entry.endedAt)).length,
      0,
    );
    const temporaryTimerSeconds = plans.reduce((totalSeconds, item) => {
      if (item.actualMinutes) {
        return totalSeconds;
      }

      return totalSeconds + getTaskTimeSecondsForDate(item, selectedDate, timerTick);
    }, 0);
    const liveActualSeconds = savedActualMinutes * 60 + temporaryTimerSeconds + projectActualSeconds;
    const targetTotalSeconds = targetTotalMinutes * 60;
    const comparableSavedActualMinutes = getTotalMinutes(plannedTimePlans, "actualMinutes");
    const comparableTemporaryTimerSeconds = plannedTimePlans.reduce((totalSeconds, item) => {
      if (item.actualMinutes) {
        return totalSeconds;
      }

      return totalSeconds + getTaskTimeSecondsForDate(item, selectedDate, timerTick);
    }, 0);
    const comparableActualSeconds =
      comparableSavedActualMinutes * 60 + comparableTemporaryTimerSeconds;
    const unplannedActualSeconds = Math.max(0, liveActualSeconds - comparableActualSeconds);
    const actualPercent =
      targetTotalSeconds > 0
        ? Math.round((comparableActualSeconds / targetTotalSeconds) * 100)
        : 0;

    return {
      targetTotalMinutes,
      savedActualMinutes,
      projectActualSeconds,
      projectSessionCount,
      projectActiveTimerCount,
      temporaryTimerSeconds,
      liveActualSeconds,
      comparableActualSeconds,
      differenceSeconds:
        targetTotalSeconds > 0 ? comparableActualSeconds - targetTotalSeconds : null,
      unplannedActualSeconds,
      completedActualMinutes: getTotalMinutes(completedPlans, "actualMinutes"),
      incompleteActualMinutes: getTotalMinutes(unfinishedPlans, "actualMinutes"),
      unfinishedTargetMinutes: getTotalMinutes(unfinishedPlans, "targetMinutes"),
      missingTargetCount: plans.filter((item) => !item.targetMinutes).length,
      missingActualCount: plans.filter((item) => !item.actualMinutes).length,
      activeTimerCount:
        plans.filter((item) => Boolean(getRunningTaskTimeEntry(item))).length +
        projectActiveTimerCount,
      trackedTimerCount: plans.filter((item) => {
        return !item.actualMinutes && getTaskTimeEntriesForDate(item, selectedDate).length > 0;
      }).length,
      completedCount: completedPlans.length,
      actualPercent,
      actualProgress: Math.min(100, actualPercent),
    };
  }, [complexProjects, plans, selectedDate, timerTick]);

  useEffect(() => {
    savePlanBook(plansByDate);
    latestPlanBook.current = plansByDate;
  }, [plansByDate]);

  useEffect(() => {
    saveComplexProjectBook(complexProjectBook);
    latestComplexProjectBook.current = complexProjectBook;
  }, [complexProjectBook]);

  useEffect(() => {
    saveMoodBook(moodBook);
    latestMoodBook.current = moodBook;
  }, [moodBook]);

  useEffect(() => {
    saveUserProfile(userProfile);
    latestUserProfile.current = userProfile;
  }, [userProfile]);

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
    refreshWeather({ silent: true });

    const intervalId = window.setInterval(() => {
      refreshWeather({ silent: true });
    }, WEATHER_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshWeather]);

  useEffect(() => {
    return () => {
      if (feedbackTimer.current) {
        window.clearTimeout(feedbackTimer.current);
      }
      if (complexProjectFeedbackTimer.current) {
        window.clearTimeout(complexProjectFeedbackTimer.current);
      }
      if (cloudTimer.current) {
        window.clearTimeout(cloudTimer.current);
      }
      if (timerNoticeTimer.current) {
        window.clearTimeout(timerNoticeTimer.current);
      }
      if (highlightedTaskTimer.current) {
        window.clearTimeout(highlightedTaskTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    const hasRunningTaskTimer = Object.values(plansByDate).some((items) =>
      items.some((item) => Boolean(getRunningTaskTimeEntry(item))),
    );
    const hasRunningCountdownTimer = Object.values(taskTimersByTaskId).some(
      (timer) => timer.countdownIsRunning,
    );
    const hasRunningComplexProjectTimer = complexProjects.some((project) =>
      project.phases.some((phase) => phase.timeEntries.some((entry) => !entry.endedAt)),
    );
    const hasRunningTimer =
      hasRunningTaskTimer || hasRunningCountdownTimer || hasRunningComplexProjectTimer;

    if (!hasRunningTimer) {
      return;
    }

    setTimerTick(Date.now());
    const intervalId = window.setInterval(() => {
      setTimerTick(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [complexProjects, plansByDate, taskTimersByTaskId]);

  useEffect(() => {
    const finishedCountdownIds = Object.entries(taskTimersByTaskId)
      .filter(([, timer]) => timer.countdownIsRunning && getCountdownRemainingSeconds(timer, timerTick) <= 0)
      .map(([itemId]) => itemId);

    if (finishedCountdownIds.length === 0) {
      return;
    }

    showTimerNotice("倒计时结束啦！");
    setTaskTimersByTaskId((currentTimers) => {
      const nextTimers = { ...currentTimers };

      finishedCountdownIds.forEach((itemId) => {
        const currentTimer = currentTimers[itemId];

        if (!currentTimer) {
          return;
        }

        if (!currentTimer.forwardHasStarted && !currentTimer.isRunning) {
          delete nextTimers[itemId];
          return;
        }

        nextTimers[itemId] = {
          ...currentTimer,
          countdownHasStarted: false,
          countdownIsRunning: false,
          countdownRemainingSeconds: currentTimer.countdownInitialSeconds,
          countdownStartedAt: null,
        };
      });

      return nextTimers;
    });
    setTimerTick(Date.now());
  }, [taskTimersByTaskId, timerTick]);

  useEffect(() => {
    let isCancelled = false;
    const years = Array.from(
      new Set([getDateInputYear(selectedDate), getDateInputYear(calendarMonthDate)]),
    );

    years.forEach((year) => {
      void loadChinaHolidayYear(year).then((result) => {
        if (isCancelled) {
          return;
        }

        setChinaHolidayRecordsByYear((currentRecords) => ({
          ...currentRecords,
          [year]: result.records,
        }));
        setChinaHolidaySourceByYear((currentSources) => ({
          ...currentSources,
          [year]: result.source,
        }));
      });
    });

    return () => {
      isCancelled = true;
    };
  }, [calendarMonthDate, selectedDate]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsAuthChecking(false);
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
          setIsAuthChecking(false);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setAuthStatus(error instanceof Error ? error.message : "读取登录状态失败");
          setIsAuthChecking(false);
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
        const localComplexProjectBook = normalizeComplexProjectBook(
          latestComplexProjectBook.current,
        );
        const localMoodBook = normalizeMoodBook(latestMoodBook.current);
        const localUserProfile = normalizeUserProfile(latestUserProfile.current);
        const nextDeletedItemIds = uniqueValues([
          ...latestDeletedItemIds.current,
          ...cloudPayload.deletedItemIds,
        ]);
        const nextCustomCategories = mergeCustomCategories(
          latestCustomCategories.current,
          cloudPayload.customCategories,
        );
        const mergedComplexProjectBook = mergeComplexProjectBooks(
          localComplexProjectBook,
          normalizeComplexProjectBook(cloudPayload.complexProjects),
        );
        const mergedPlanBook = mergePlanBooks(
          localPlanBook,
          cloudPayload.plansByDate,
          nextDeletedItemIds,
        );
        const mergedMoodBook = mergeMoodBooks(localMoodBook, cloudPayload.moodBook);
        const mergedUserProfile = mergeUserProfiles(localUserProfile, cloudPayload.userProfile);

        if (isCancelled) {
          return;
        }

        setDeletedItemIds(nextDeletedItemIds);
        setCustomCategories(nextCustomCategories);
        setComplexProjectBook(mergedComplexProjectBook);
        setMoodBook(mergedMoodBook);
        setUserProfile(mergedUserProfile);
        setPlansByDate(mergedPlanBook);
        await upsertDailyPlannerUserData({
          userId: currentUserId,
          payload: createCloudPayload(
            mergedPlanBook,
            nextDeletedItemIds,
            nextCustomCategories,
            mergedComplexProjectBook,
            mergedMoodBook,
            mergedUserProfile,
          ),
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
  }, [currentUserId, complexProjectBook, customCategories, deletedItemIds, moodBook, plansByDate, userProfile]);

  const updatePlansForSelectedDate = (updater: (current: PlanItem[]) => PlanItem[]) => {
    setPlansByDate((currentBook) => ({
      ...currentBook,
      [selectedDate]: updater(currentBook[selectedDate] ?? []),
    }));
  };

  const addMoodEntry = () => {
    const timestamp = createTimestampForDateAtCurrentTime(selectedDate);
    const moodOption = getMoodOption(moodDraftId);
    const now = Date.now();
    const entry: MoodEntry = {
      id: createId(),
      createdAt: now,
      date: selectedDate,
      moodId: moodOption.id,
      note: moodNoteDraft.trim(),
      timestamp,
      updatedAt: now,
    };

    setMoodBook((currentBook) => {
      const entries = [...(currentBook[selectedDate] ?? []), entry].sort(
        (left, right) => left.timestamp - right.timestamp,
      );

      return {
        ...currentBook,
        [selectedDate]: entries,
      };
    });
    setMoodNoteDraft("");
    setMoodStatus(`已记录 ${formatClockTime(timestamp)} 的${moodOption.label}`);
  };

  const exportMoodTimelinePng = async () => {
    if (!moodTimelineRef.current) {
      setMoodStatus("心情轨迹还没有准备好");
      return;
    }

    setIsMoodExporting(true);

    try {
      if ("fonts" in document) {
        await document.fonts.ready;
      }
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

      const canvas = await html2canvas(moodTimelineRef.current, {
        backgroundColor: "#ffffff",
        logging: false,
        scale: 2,
        useCORS: true,
      });
      const link = document.createElement("a");

      link.download = `心情轨迹-${selectedDate}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      setMoodStatus("心情轨迹 PNG 已生成");
    } catch (error) {
      setMoodStatus(error instanceof Error ? error.message : "心情轨迹导出失败");
    } finally {
      setIsMoodExporting(false);
    }
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const resetComplexProjectForm = (dateValue = selectedDate) => {
    setComplexProjectForm(createEmptyComplexProjectForm(dateValue));
    setEditingComplexProjectId(null);
    setComplexProjectFormError("");
    setIsComplexProjectFormOpen(false);
  };

  const resetComplexProjectPhaseForm = (
    project: Pick<ComplexProject, "startDate" | "endDate"> | null = null,
  ) => {
    setComplexProjectPhaseForm(createEmptyComplexProjectPhaseForm(project, selectedDate));
    setComplexProjectPhaseEdit(null);
    setComplexProjectPhaseFormError("");
  };

  const showComplexProjectFeedback = (
    feedback: Omit<ComplexProjectCompletionFeedback, "id">,
  ) => {
    setComplexProjectFeedback({
      ...feedback,
      id: Date.now(),
    });

    if (complexProjectFeedbackTimer.current) {
      window.clearTimeout(complexProjectFeedbackTimer.current);
    }

    complexProjectFeedbackTimer.current = window.setTimeout(() => {
      setComplexProjectFeedback(null);
      complexProjectFeedbackTimer.current = null;
    }, feedback.projectCompleted ? 2400 : 1700);
  };

  const openNewComplexProjectForm = () => {
    setActiveWorkspaceTab("projects");
    resetForm();
    resetComplexProjectPhaseForm();
    setComplexProjectPhaseMessage("");
    setComplexProjectForm(createEmptyComplexProjectForm(selectedDate));
    setEditingComplexProjectId(null);
    setComplexProjectFormError("");
    setIsComplexProjectFormOpen(true);
  };

  const startComplexProjectEdit = (project: ComplexProject) => {
    setActiveWorkspaceTab("projects");
    resetForm();
    resetComplexProjectPhaseForm();
    setComplexProjectPhaseMessage("");
    setComplexProjectForm(createComplexProjectFormFromProject(project));
    setEditingComplexProjectId(project.id);
    setComplexProjectFormError("");
    setIsComplexProjectFormOpen(true);
  };

  const openNewComplexProjectPhaseForm = (project: ComplexProject) => {
    setActiveWorkspaceTab("projects");
    resetForm();
    resetComplexProjectForm();
    setComplexProjectPhaseMessage("");
    setComplexProjectPhaseForm(createEmptyComplexProjectPhaseForm(project, selectedDate));
    setComplexProjectPhaseEdit({ projectId: project.id, phaseId: null });
    setComplexProjectPhaseFormError("");
  };

  const startComplexProjectPhaseEdit = (
    project: ComplexProject,
    phase: ComplexProjectPhase,
  ) => {
    setActiveWorkspaceTab("projects");
    resetForm();
    resetComplexProjectForm();
    setComplexProjectPhaseMessage("");
    setComplexProjectPhaseForm(createComplexProjectPhaseFormFromPhase(phase));
    setComplexProjectPhaseEdit({ projectId: project.id, phaseId: phase.id });
    setComplexProjectPhaseFormError("");
  };

  const handleComplexProjectSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const title = complexProjectForm.title.trim();
    const note = complexProjectForm.note.trim();
    const category = complexProjectForm.category || "其他";
    const priority = normalizePriority(complexProjectForm.priority);
    const startDate = complexProjectForm.startDate;
    const endDate = complexProjectForm.endDate;
    const updatedAt = Date.now();

    if (!title) {
      setComplexProjectFormError("项目标题不能为空");
      return;
    }

    if (!startDate || !endDate) {
      setComplexProjectFormError("请选择项目开始日期和结束日期");
      return;
    }

    if (startDate > endDate) {
      setComplexProjectFormError("开始日期不能晚于结束日期");
      return;
    }

    setComplexProjectBook((currentBook) => {
      if (editingComplexProjectId) {
        const currentProject = currentBook[editingComplexProjectId];

        if (!currentProject) {
          return currentBook;
        }

        return normalizeComplexProjectBook({
          ...currentBook,
          [editingComplexProjectId]: {
            ...currentProject,
            title,
            category,
            priority,
            note,
            startDate,
            endDate,
            updatedAt,
          },
        });
      }

      const nextProject: ComplexProject = {
        id: createId(),
        title,
        category,
        priority,
        note,
        startDate,
        endDate,
        status: "active",
        phases: [],
        createdAt: updatedAt,
        updatedAt,
      };

      return normalizeComplexProjectBook({
        ...currentBook,
        [nextProject.id]: nextProject,
      });
    });
    resetComplexProjectForm();
  };

  const handleComplexProjectPhaseSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!complexProjectPhaseEdit) {
      return;
    }

    const currentProject = complexProjectBook[complexProjectPhaseEdit.projectId];
    const title = complexProjectPhaseForm.title.trim();
    const note = complexProjectPhaseForm.note.trim();
    const startDate = complexProjectPhaseForm.startDate;
    const endDate = complexProjectPhaseForm.endDate;
    const updatedAt = Date.now();

    if (!currentProject) {
      setComplexProjectPhaseFormError("项目不存在，无法保存阶段");
      return;
    }

    if (!title) {
      setComplexProjectPhaseFormError("阶段标题不能为空");
      return;
    }

    if (!startDate || !endDate) {
      setComplexProjectPhaseFormError("请选择阶段开始日期和结束日期");
      return;
    }

    if (startDate > endDate) {
      setComplexProjectPhaseFormError("阶段开始日期不能晚于结束日期");
      return;
    }

    const existingPhase = complexProjectPhaseEdit.phaseId
      ? currentProject.phases.find((phase) => phase.id === complexProjectPhaseEdit.phaseId)
      : null;

    if (complexProjectPhaseEdit.phaseId && !existingPhase) {
      setComplexProjectPhaseFormError("阶段不存在，无法保存");
      return;
    }

    const completedAt = complexProjectPhaseForm.completed
      ? existingPhase?.completedAt ?? updatedAt
      : undefined;
    const nextPhase: ComplexProjectPhase = {
      id: existingPhase?.id ?? createId(),
      title,
      note,
      startDate,
      endDate,
      completed: complexProjectPhaseForm.completed,
      timeEntries: existingPhase?.timeEntries ?? [],
      ...(completedAt ? { completedAt } : {}),
      updatedAt,
    };
    const didExtendProject = startDate < currentProject.startDate || endDate > currentProject.endDate;

    setComplexProjectBook((currentBook) => {
      const project = currentBook[complexProjectPhaseEdit.projectId];

      if (!project) {
        return currentBook;
      }

      const phases = existingPhase
        ? project.phases.map((phase) => (phase.id === existingPhase.id ? nextPhase : phase))
        : [...project.phases, nextPhase];

      return normalizeComplexProjectBook({
        ...currentBook,
        [project.id]: {
          ...project,
          startDate: startDate < project.startDate ? startDate : project.startDate,
          endDate: endDate > project.endDate ? endDate : project.endDate,
          phases,
          updatedAt,
        },
      });
    });
    setComplexProjectPhaseMessage(
      didExtendProject
        ? "阶段日期超出原项目周期，已自动扩展项目日期"
        : existingPhase
          ? "阶段已更新，项目进度已同步"
          : "阶段已添加，项目进度已同步",
    );
    resetComplexProjectPhaseForm();
  };

  const toggleComplexProjectPhaseCompleted = (projectId: string, phaseId: string) => {
    const project = complexProjectBook[projectId];
    const currentPhase = project?.phases.find((phase) => phase.id === phaseId);

    if (!project || !currentPhase) {
      return;
    }

    const updatedAt = Date.now();
    const nextCompleted = !currentPhase.completed;
    const completedPhaseCount = project.phases.filter((phase) =>
      phase.id === phaseId ? nextCompleted : phase.completed,
    ).length;
    const progressPercent =
      project.phases.length > 0
        ? Math.round((completedPhaseCount / project.phases.length) * 100)
        : 0;
    const projectCompleted = nextCompleted && completedPhaseCount === project.phases.length;

    setComplexProjectBook((currentBook) => {
      const project = currentBook[projectId];

      if (!project) {
        return currentBook;
      }

      return normalizeComplexProjectBook({
        ...currentBook,
        [projectId]: {
          ...project,
          phases: project.phases.map((phase) =>
            phase.id === phaseId
              ? {
                  ...phase,
                  completed: nextCompleted,
                  ...(nextCompleted ? { completedAt: updatedAt } : { completedAt: undefined }),
                  updatedAt,
                }
              : phase,
          ),
          updatedAt,
        },
      });
    });
    setComplexProjectPhaseMessage(
      nextCompleted ? "阶段已完成，项目进度已更新" : "阶段已恢复为未完成，项目进度已更新",
    );

    if (nextCompleted) {
      showComplexProjectFeedback({
        projectId,
        phaseId,
        phaseTitle: currentPhase.title,
        progressPercent,
        projectCompleted,
      });
    } else if (complexProjectFeedback?.phaseId === phaseId) {
      setComplexProjectFeedback(null);
    }
  };

  const openComplexProjectPhaseTimeDetails = (
    projectId: string,
    phaseId: string,
    date = selectedDate,
  ) => {
    setPhaseTimeDetailTarget({ projectId, phaseId, date });
  };

  const exportPhaseTimeDetailsExcel = () => {
    if (!phaseTimeDetailProject || !phaseTimeDetailPhase || !phaseTimeDetailTarget) {
      return;
    }

    const blob = createPhaseTimeEntriesExcelBlob({
      date: phaseTimeDetailTarget.date,
      entries: phaseTimeDetailEntries,
      now: timerTick,
      phaseTitle: phaseTimeDetailPhase.title,
      projectTitle: phaseTimeDetailProject.title,
    });

    downloadBlob(
      blob,
      `阶段计时明细-${sanitizeExportFileNamePart(phaseTimeDetailProject.title)}-${sanitizeExportFileNamePart(phaseTimeDetailPhase.title)}-${phaseTimeDetailTarget.date}.xls`,
    );
  };

  const openTaskTimeDetails = (itemId: string, date = selectedDate) => {
    setTaskTimeDetailTarget({ itemId, date });
  };

  const exportTaskTimeDetailsExcel = () => {
    if (!taskTimeDetailItem || !taskTimeDetailTarget) {
      return;
    }

    const blob = createTaskTimeEntriesExcelBlob({
      category: taskTimeDetailItem.category,
      date: taskTimeDetailTarget.date,
      entries: taskTimeDetailEntries,
      now: timerTick,
      taskTitle: taskTimeDetailItem.title,
    });

    downloadBlob(
      blob,
      `任务计时明细-${sanitizeExportFileNamePart(taskTimeDetailItem.title)}-${taskTimeDetailTarget.date}.xls`,
    );
  };

  const toggleComplexProjectPhaseTimer = (projectId: string, phaseId: string) => {
    const project = complexProjectBook[projectId];
    const phase = project?.phases.find((item) => item.id === phaseId);

    if (!project || !phase) {
      return;
    }

    const now = Date.now();
    const activeEntry = getRunningComplexProjectPhaseEntry(phase);

    setTimerTick(now);
    setComplexProjectBook((currentBook) => {
      const currentProject = currentBook[projectId];

      if (!currentProject) {
        return currentBook;
      }

      const shouldStopCurrentPhase = Boolean(
        currentProject.phases
          .find((currentPhase) => currentPhase.id === phaseId)
          ?.timeEntries.some((entry) => !entry.endedAt),
      );

      const phases = currentProject.phases.map((currentPhase) => {
        const stoppedEntries = currentPhase.timeEntries.map((entry) => {
          if (entry.endedAt) {
            return entry;
          }

          const durationSeconds = Math.max(
            entry.durationSeconds,
            Math.floor(Math.max(0, now - entry.startedAt) / 1000),
          );

          return {
            ...entry,
            endedAt: now,
            durationSeconds,
          };
        });

        if (currentPhase.id !== phaseId || shouldStopCurrentPhase) {
          return {
            ...currentPhase,
            timeEntries: stoppedEntries,
            updatedAt: now,
          };
        }

        return {
          ...currentPhase,
          timeEntries: [
            ...stoppedEntries,
            {
              id: createId(),
              date: selectedDate,
              startedAt: now,
              durationSeconds: 0,
            },
          ],
          updatedAt: now,
        };
      });

      return normalizeComplexProjectBook({
        ...currentBook,
        [projectId]: {
          ...currentProject,
          phases,
          updatedAt: now,
        },
      });
    });

    setComplexProjectPhaseMessage(
      activeEntry
        ? `已结束“${phase.title}”本次计时，已计入 ${formatDisplayDate(selectedDate)}`
        : `已开始“${phase.title}”计时`,
    );
  };

  const deleteComplexProjectPhase = (projectId: string, phaseId: string) => {
    const project = complexProjectBook[projectId];
    const phase = project?.phases.find((item) => item.id === phaseId);

    if (!project || !phase) {
      return;
    }

    if (!window.confirm(`删除阶段“${phase.title}”？`)) {
      return;
    }

    const updatedAt = Date.now();

    setComplexProjectBook((currentBook) => {
      const currentProject = currentBook[projectId];

      if (!currentProject) {
        return currentBook;
      }

      return normalizeComplexProjectBook({
        ...currentBook,
        [projectId]: {
          ...currentProject,
          phases: currentProject.phases.filter((item) => item.id !== phaseId),
          updatedAt,
        },
      });
    });

    if (
      complexProjectPhaseEdit?.projectId === projectId &&
      complexProjectPhaseEdit.phaseId === phaseId
    ) {
      resetComplexProjectPhaseForm();
    }

    setComplexProjectPhaseMessage("阶段已删除，项目进度已同步");
  };

  const toggleComplexProjectCompleted = (projectId: string) => {
    const project = complexProjectBook[projectId];

    if (!project || project.status === "archived") {
      return;
    }

    const updatedAt = Date.now();
    const nextStatus: ComplexProjectStatus =
      project.status === "completed" ? "active" : "completed";

    setComplexProjectBook((currentBook) => {
      const currentProject = currentBook[projectId];

      if (!currentProject || currentProject.status === "archived") {
        return currentBook;
      }

      return normalizeComplexProjectBook({
        ...currentBook,
        [projectId]: {
          ...currentProject,
          status: nextStatus,
          updatedAt,
        },
      });
    });
    setComplexProjectPhaseMessage(
      nextStatus === "completed" ? "项目已标记完成" : "项目已恢复为进行中",
    );
  };

  const archiveComplexProject = (projectId: string) => {
    const project = complexProjectBook[projectId];

    if (!project || project.status === "archived") {
      return;
    }

    if (!window.confirm(`归档项目“${project.title}”？归档后不会显示在每日任务看板上方。`)) {
      return;
    }

    const updatedAt = Date.now();

    setComplexProjectBook((currentBook) => {
      const currentProject = currentBook[projectId];

      if (!currentProject || currentProject.status === "archived") {
        return currentBook;
      }

      return normalizeComplexProjectBook({
        ...currentBook,
        [projectId]: {
          ...currentProject,
          status: "archived",
          archivedAt: updatedAt,
          updatedAt,
        },
      });
    });
    resetComplexProjectPhaseForm();
    if (editingComplexProjectId === projectId) {
      resetComplexProjectForm();
    }
    setComplexProjectPhaseMessage("项目已归档，不再显示在每日任务看板上方");
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

  const clearTaskDragState = () => {
    setDraggedTaskId(null);
    setDragOverPriority(null);
    setTaskDropTarget(null);
  };

  const getTaskDropPlacement = (event: DragEvent<HTMLElement>): Exclude<TaskDropPlacement, "end"> => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
  };

  const updateTaskPriority = (itemId: string, priority: TaskPriority) => {
    const nextPriority = normalizePriority(priority);
    const updatedAt = Date.now();

    updatePlansForSelectedDate((currentPlans) => {
      const currentItem = currentPlans.find((item) => item.id === itemId);

      if (!currentItem || normalizePriority(currentItem.priority) === nextPriority) {
        return currentPlans;
      }

      return movePlanItemToPosition(currentPlans, itemId, nextPriority, null, "end", updatedAt);
    });
  };

  const handleTaskDragStart = (event: DragEvent<HTMLElement>, item: PlanItem) => {
    setDraggedTaskId(item.id);
    setTaskDropTarget(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.id);
  };

  const handleTaskDragEnd = () => {
    clearTaskDragState();
  };

  const handlePriorityDragOver = (event: DragEvent<HTMLElement>, priority: TaskPriority) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverPriority(priority);

    const targetElement = event.target instanceof Element ? event.target : null;
    const isOverTaskCard = Boolean(targetElement?.closest("[data-task-card='true']"));

    if (!isOverTaskCard) {
      setTaskDropTarget({ priority, itemId: null, placement: "end" });
    }
  };

  const handlePriorityDrop = (event: DragEvent<HTMLElement>, priority: TaskPriority) => {
    event.preventDefault();
    const itemId = event.dataTransfer.getData("text/plain") || draggedTaskId;
    const targetElement = event.target instanceof Element ? event.target : null;
    const isOverTaskCard = Boolean(targetElement?.closest("[data-task-card='true']"));

    if (itemId && !isOverTaskCard) {
      updatePlansForSelectedDate((currentPlans) =>
        movePlanItemToPosition(currentPlans, itemId, priority, null, "end", Date.now()),
      );
    }

    clearTaskDragState();
  };

  const handleTaskDragOver = (
    event: DragEvent<HTMLElement>,
    priority: TaskPriority,
    targetItemId: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDragOverPriority(priority);

    if (draggedTaskId === targetItemId) {
      setTaskDropTarget(null);
      return;
    }

    setTaskDropTarget({
      priority,
      itemId: targetItemId,
      placement: getTaskDropPlacement(event),
    });
  };

  const handleTaskDrop = (
    event: DragEvent<HTMLElement>,
    priority: TaskPriority,
    targetItemId: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const itemId = event.dataTransfer.getData("text/plain") || draggedTaskId;
    const placement = getTaskDropPlacement(event);

    if (itemId && itemId !== targetItemId) {
      updatePlansForSelectedDate((currentPlans) =>
        movePlanItemToPosition(
          currentPlans,
          itemId,
          priority,
          targetItemId,
          placement,
          Date.now(),
        ),
      );
    }

    clearTaskDragState();
  };

  const jumpToPlanSearchResult = (result: PlanSearchResult) => {
    setSelectedDate(result.date);
    setCalendarMonthDate(getMonthStartDateValue(result.date));
    resetForm();
    cancelTaskInlineEdit();
    setActualEditId(null);
    setActualMinutesDraft("");
    setActualMinutesError("");
    setIsPlanSearchOpen(false);

    if (!result.item.id) {
      return;
    }

    setHighlightedTaskId(result.item.id);

    if (highlightedTaskTimer.current) {
      window.clearTimeout(highlightedTaskTimer.current);
    }

    window.setTimeout(() => {
      document
        .getElementById(`task-${result.item.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);

    highlightedTaskTimer.current = window.setTimeout(() => {
      setHighlightedTaskId(null);
      highlightedTaskTimer.current = null;
    }, 1800);
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
      const mergedComplexProjectBook = mergeComplexProjectBooks(
        latestComplexProjectBook.current,
        normalizeComplexProjectBook(cloudPayload.complexProjects),
      );
      const mergedPlanBook = mergePlanBooks(
        latestPlanBook.current,
        cloudPayload.plansByDate,
        nextDeletedItemIds,
      );
      const mergedMoodBook = mergeMoodBooks(latestMoodBook.current, cloudPayload.moodBook);
      const mergedUserProfile = mergeUserProfiles(
        latestUserProfile.current,
        cloudPayload.userProfile,
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
      if (
        !areComplexProjectBooksEqual(
          latestComplexProjectBook.current,
          mergedComplexProjectBook,
        )
      ) {
        setComplexProjectBook(mergedComplexProjectBook);
      }
      if (JSON.stringify(mergedMoodBook) !== JSON.stringify(latestMoodBook.current)) {
        setMoodBook(mergedMoodBook);
      }
      if (JSON.stringify(mergedUserProfile) !== JSON.stringify(latestUserProfile.current)) {
        setUserProfile(mergedUserProfile);
      }

      await upsertDailyPlannerUserData({
        userId,
        payload: createCloudPayload(
          mergedPlanBook,
          nextDeletedItemIds,
          nextCustomCategories,
          mergedComplexProjectBook,
          mergedMoodBook,
          mergedUserProfile,
        ),
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

        const updatedUser = await updatePassword(password);
        setCurrentUser(updatedUser);
        cleanAuthUrl();
        setAuthMode("sign-in");
        setAuthForm((current) => ({ ...current, password: "", confirmPassword: "" }));
        setAuthStatus("新密码已设置，当前账户已登录");
        setIsAuthPanelOpen(false);
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

      const signedInUser = await signIn(email, password);
      setCurrentUser(signedInUser);
      setAuthForm({ email, password: "", confirmPassword: "" });
      setAuthStatus("登录成功，正在合并云端数据");
      setIsAuthPanelOpen(false);
    } catch (error) {
      setAuthStatus(error instanceof Error ? error.message : "登录操作失败");
    } finally {
      setIsAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    const returnToLoginPage = () => {
      setIsAuthPanelOpen(false);
      window.location.href = `${window.location.origin}${window.location.pathname}`;
    };

    if (isPreviewMode || !isSignedIn) {
      returnToLoginPage();
      return;
    }

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
      setAuthStatus("已退出登录，请重新登录");
      setCloudStatus("已退出登录");
      returnToLoginPage();
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
    setAuthStatus(
      !isSupabaseConfigured
        ? "Supabase 环境变量未配置，请先配置登录服务"
        : nextMode === "forgot"
          ? "输入邮箱接收重置密码邮件"
          : "",
    );
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
    setIsCustomCategoryOpen(false);
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
      updatePlansForSelectedDate((currentPlans) => {
        const currentItem = currentPlans.find((item) => item.id === editingId);
        const priorityChanged =
          currentItem && normalizePriority(currentItem.priority) !== normalizePriority(form.priority);
        const basePlans = priorityChanged
          ? movePlanItemToPosition(
              currentPlans,
              editingId,
              normalizePriority(form.priority),
              null,
              "end",
              updatedAt,
            )
          : currentPlans;

        return basePlans.map((item) =>
          item.id === editingId
            ? {
                ...item,
                title,
                category: form.category,
                priority: form.priority,
                note: form.note.trim(),
                targetMinutes,
                updatedAt,
              }
            : item,
        );
      });
      resetForm();
      setTodayWorkspaceCollapsed((current) => ({
        ...current,
        [normalizePriority(form.priority)]: false,
      }));
      setIsTaskFormOpen(false);
      return;
    }

    const nextPlan: PlanItem = {
      id: createId(),
      date: selectedDate,
      title,
      category: form.category,
      priority: form.priority,
      note: form.note.trim(),
      completed: false,
      targetMinutes,
      timeEntries: [],
      createdAt: updatedAt,
      updatedAt,
    };

    updatePlansForSelectedDate((currentPlans) =>
      sortPlansByDisplayOrder([
        {
          ...nextPlan,
          sortOrder: getTopSortOrderForPriority(currentPlans, form.priority),
        },
        ...currentPlans,
      ]),
    );
    resetForm();
    setTodayWorkspaceCollapsed((current) => ({
      ...current,
      [normalizePriority(form.priority)]: false,
    }));
    setIsTaskFormOpen(false);
  };

  const shouldSaveTaskInlineBlur = () => {
    if (!skipInlineBlurSave.current) {
      return true;
    }

    skipInlineBlurSave.current = false;
    return false;
  };

  const cancelTaskInlineEdit = (skipNextBlurSave = false) => {
    skipInlineBlurSave.current = skipNextBlurSave;
    setTaskInlineEdit(null);
    setInlineTitleDraft("");
    setInlineNoteDraft("");
    setTargetMinutesEditDraft("");
    setTargetMinutesEditError("");

    if (skipNextBlurSave) {
      window.setTimeout(() => {
        skipInlineBlurSave.current = false;
      }, 0);
    }
  };

  const startTaskInlineEdit = (item: PlanItem, field: TaskInlineField) => {
    if (editingId) {
      resetForm();
    }

    setTaskInlineEdit({ itemId: item.id, field });
    setInlineTitleDraft(field === "title" ? item.title : "");
    setInlineNoteDraft(field === "note" ? item.note : "");
    setTargetMinutesEditDraft(
      field === "targetMinutes" && item.targetMinutes ? String(item.targetMinutes) : "",
    );
    setTargetMinutesEditError("");
    setActualEditId(null);
    setActualMinutesDraft("");
    setActualMinutesError("");
  };

  const handleEdit = (item: PlanItem) => {
    startTaskInlineEdit(item, "note");
  };

  const updateTaskCategory = (id: string, category: Category) => {
    updatePlansForSelectedDate((currentPlans) =>
      currentPlans.map((item) =>
        item.id === id
          ? {
              ...item,
              category,
              updatedAt: Date.now(),
            }
          : item,
      ),
    );
    cancelTaskInlineEdit();
  };

  const saveInlineTitle = (id: string) => {
    const title = inlineTitleDraft.trim();

    if (!title) {
      cancelTaskInlineEdit();
      return;
    }

    updatePlansForSelectedDate((currentPlans) =>
      currentPlans.map((item) =>
        item.id === id
          ? {
              ...item,
              title,
              updatedAt: Date.now(),
            }
          : item,
      ),
    );
    cancelTaskInlineEdit();
  };

  const saveInlineNote = (id: string) => {
    updatePlansForSelectedDate((currentPlans) =>
      currentPlans.map((item) =>
        item.id === id
          ? {
              ...item,
              note: inlineNoteDraft.trim(),
              updatedAt: Date.now(),
            }
          : item,
      ),
    );
    cancelTaskInlineEdit();
  };

  const saveTargetMinutesEdit = (id: string) => {
    const targetMinutes = parseOptionalMinutes(targetMinutesEditDraft);

    if (targetMinutes === null) {
      setTargetMinutesEditError("请输入正整数分钟，或留空");
      return;
    }

    updatePlansForSelectedDate((currentPlans) =>
      currentPlans.map((item) =>
        item.id === id
          ? {
              ...item,
              targetMinutes,
              updatedAt: Date.now(),
            }
          : item,
      ),
    );
    cancelTaskInlineEdit();
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
    if (taskInlineEdit?.itemId === id) {
      cancelTaskInlineEdit();
    }
    setTaskTimersByTaskId((currentTimers) => {
      const nextTimers = { ...currentTimers };
      delete nextTimers[id];
      return nextTimers;
    });
  };

  const startActualMinutesEdit = (item: PlanItem) => {
    cancelTaskInlineEdit();
    setActualEditId(item.id);
    setActualMinutesDraft(item.actualMinutes ? String(item.actualMinutes) : "");
    setActualMinutesError("");
  };

  const cancelActualMinutesEdit = (skipNextBlurSave = false) => {
    skipInlineBlurSave.current = skipNextBlurSave;
    setActualEditId(null);
    setActualMinutesDraft("");
    setActualMinutesError("");

    if (skipNextBlurSave) {
      window.setTimeout(() => {
        skipInlineBlurSave.current = false;
      }, 0);
    }
  };

  const selectPlannerDate = (dateValue: string) => {
    setSelectedDate(dateValue);
    resetForm();
    cancelTaskInlineEdit();
    cancelActualMinutesEdit();
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

    clearTimerNotice();

    const now = Date.now();
    setTimerTick(now);

    updatePlansForSelectedDate((currentPlans) =>
      currentPlans.map((currentItem) => {
        if (currentItem.id !== item.id || currentItem.completed) {
          return currentItem;
        }

        const timeEntries = getTaskTimeEntries(currentItem);
        const hasRunningEntry = timeEntries.some((entry) => !entry.endedAt);
        const stoppedEntries = stopRunningTaskTimeEntries(timeEntries, now);

        return {
          ...currentItem,
          timeEntries: hasRunningEntry
            ? stoppedEntries
            : [
                ...stoppedEntries,
                {
                  id: createId(),
                  date: selectedDate,
                  startedAt: now,
                  durationSeconds: 0,
                },
              ],
          updatedAt: now,
        };
      }),
    );

    setTaskTimersByTaskId((currentTimers) => {
      const currentTimer = currentTimers[item.id];

      if (!currentTimer) {
        return currentTimers;
      }

      const nextTimers = { ...currentTimers };

      if (!currentTimer.countdownHasStarted && !currentTimer.countdownIsRunning) {
        delete nextTimers[item.id];
        return nextTimers;
      }

      nextTimers[item.id] = {
        ...currentTimer,
        elapsedSeconds: 0,
        forwardHasStarted: false,
        isRunning: false,
        startedAt: null,
      };

      return nextTimers;
    });
  };

  const handleCountdownClick = (item: PlanItem, minutes: number) => {
    if (item.completed) {
      return;
    }

    clearTimerNotice();

    const now = Date.now();
    const selectedSeconds = minutes * 60;
    setTimerTick(now);
    const currentTimer = taskTimersByTaskId[item.id];
    const nextBaseTimer = currentTimer ?? createTaskTimerState(item.id);
    const remainingSeconds = getCountdownRemainingSeconds(nextBaseTimer, now);
    const isSameCountdown =
      nextBaseTimer.countdownInitialSeconds === selectedSeconds &&
      (nextBaseTimer.countdownHasStarted || nextBaseTimer.countdownIsRunning);

    if (!isSameCountdown) {
      setTaskTimersByTaskId((currentTimers) => ({
        ...currentTimers,
        [item.id]: {
          ...nextBaseTimer,
          countdownHasStarted: true,
          countdownInitialSeconds: selectedSeconds,
          countdownIsRunning: true,
          countdownRemainingSeconds: selectedSeconds,
          countdownStartedAt: now,
        },
      }));
      return;
    }

    setTaskTimersByTaskId((currentTimers) => ({
      ...currentTimers,
      [item.id]: {
        ...nextBaseTimer,
        countdownHasStarted: true,
        countdownInitialSeconds: selectedSeconds,
        countdownIsRunning: !nextBaseTimer.countdownIsRunning,
        countdownRemainingSeconds: nextBaseTimer.countdownIsRunning
          ? remainingSeconds
          : remainingSeconds > 0
            ? remainingSeconds
            : selectedSeconds,
        countdownStartedAt: nextBaseTimer.countdownIsRunning ? null : now,
      },
    }));
  };

  const toggleCountdownTimer = (item: PlanItem) => {
    if (item.completed) {
      return;
    }

    clearTimerNotice();

    const now = Date.now();
    setTimerTick(now);
    setTaskTimersByTaskId((currentTimers) => {
      const currentTimer = currentTimers[item.id];

      if (!currentTimer?.countdownHasStarted) {
        return currentTimers;
      }

      const remainingSeconds = getCountdownRemainingSeconds(currentTimer, now);

      return {
        ...currentTimers,
        [item.id]: {
          ...currentTimer,
          countdownIsRunning: !currentTimer.countdownIsRunning,
          countdownRemainingSeconds: currentTimer.countdownIsRunning
            ? remainingSeconds
            : remainingSeconds > 0
              ? remainingSeconds
              : currentTimer.countdownInitialSeconds,
          countdownStartedAt: currentTimer.countdownIsRunning ? null : now,
        },
      };
    });
  };

  const endCountdownTimer = (item: PlanItem) => {
    if (item.completed) {
      return;
    }

    clearTimerNotice();

    const now = Date.now();
    setTimerTick(now);
    setTaskTimersByTaskId((currentTimers) => {
      const currentTimer = currentTimers[item.id];

      if (!currentTimer) {
        return currentTimers;
      }

      const nextTimers = { ...currentTimers };

      if (!currentTimer.forwardHasStarted && !currentTimer.isRunning) {
        delete nextTimers[item.id];
        return nextTimers;
      }

      nextTimers[item.id] = {
        ...currentTimer,
        countdownHasStarted: false,
        countdownInitialSeconds: 0,
        countdownIsRunning: false,
        countdownRemainingSeconds: 0,
        countdownStartedAt: null,
      };

      return nextTimers;
    });
  };

  const handleToggle = (id: string) => {
    const targetPlan = plans.find((item) => item.id === id);
    const now = Date.now();
    const taskTimer = taskTimersByTaskId[id];
    const hasTimerForTask = Boolean(taskTimer);

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
      setTaskTimersByTaskId((currentTimers) => {
        const nextTimers = { ...currentTimers };
        delete nextTimers[id];
        return nextTimers;
      });
      setTimerTick(now);
    }

    if (targetPlan?.completed && actualEditId === id) {
      cancelActualMinutesEdit();
    }

    updatePlansForSelectedDate((currentPlans) =>
      currentPlans.map((item) => {
        if (item.id !== id) {
          return item;
        }

        const isCompleting = !item.completed;
        const timeEntries = isCompleting
          ? stopRunningTaskTimeEntries(getTaskTimeEntries(item), now)
          : getTaskTimeEntries(item);
        const totalTimeSeconds = getTaskTimeTotalSeconds({ ...item, timeEntries }, now);

        return {
          ...item,
          completed: !item.completed,
          actualMinutes:
            isCompleting && totalTimeSeconds > 0 && !item.actualMinutes
              ? timerSecondsToActualMinutes(totalTimeSeconds)
              : item.actualMinutes,
          timeEntries,
          updatedAt: now,
        };
      }),
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
    cancelTaskInlineEdit();
    setTaskTimersByTaskId({});
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

  const captureComplexProjectGantt = async (project: ComplexProject) => {
    setIsGanttExporting(true);

    try {
      flushSync(() => {
        setActiveWorkspaceTab("projects");
        setGanttPreviewProjectId(project.id);
      });
      await new Promise<void>((resolve) =>
        window.requestAnimationFrame(() =>
          window.requestAnimationFrame(() => resolve()),
        ),
      );

      const previewElement = Array.from(
        document.querySelectorAll<HTMLElement>("[data-gantt-preview-project-id]"),
      ).find((element) => {
        if (element.dataset.ganttPreviewProjectId !== project.id) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);

        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          !element.closest('[aria-hidden="true"]')
        );
      });
      const measuredWidth = previewElement
        ? Math.max(720, Math.ceil(previewElement.getBoundingClientRect().width || previewElement.scrollWidth))
        : Math.max(720, Math.min(1120, document.documentElement.clientWidth - 320));
      const exportWidth = Math.max(measuredWidth, getComplexProjectGanttExportMinWidth(project));

      flushSync(() => {
        setGanttExportWidth(exportWidth);
        setGanttExportProjectId(project.id);
      });

      let exportElement: HTMLDivElement | null = null;

      for (let attempt = 0; attempt < 10; attempt += 1) {
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        exportElement = ganttExportRef.current;

        if (exportElement && exportElement.scrollWidth > 0 && exportElement.scrollHeight > 0) {
          break;
        }
      }

      if (!exportElement || exportElement.scrollWidth <= 0 || exportElement.scrollHeight <= 0) {
        throw new Error("甘特图导出容器尚未准备好");
      }

      return await captureGanttElement(exportElement);
    } finally {
      flushSync(() => {
        setGanttExportProjectId(null);
      });
      setIsGanttExporting(false);
    }
  };

  const handleExportComplexProjectGanttPng = async (projectId: string) => {
    const project = complexProjectBook[projectId];

    if (!project) {
      setComplexProjectPhaseMessage("项目不存在，无法导出甘特图");
      return;
    }

    try {
      const canvas = await captureComplexProjectGantt(project);
      const link = document.createElement("a");

      link.download = `复杂项目甘特图-${sanitizeExportFileNamePart(project.title)}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      setComplexProjectPhaseMessage("甘特图 PNG 已生成");
    } catch (error) {
      setComplexProjectPhaseMessage(
        error instanceof Error ? error.message : "甘特图 PNG 导出失败",
      );
    }
  };

  const handleExportComplexProjectGanttPdf = async (projectId: string) => {
    const project = complexProjectBook[projectId];

    if (!project) {
      setComplexProjectPhaseMessage("项目不存在，无法导出甘特图");
      return;
    }

    try {
      const canvas = await captureComplexProjectGantt(project);
      const imageData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ format: "a4", orientation: "landscape", unit: "pt" });
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

      pdf.save(`复杂项目甘特图-${sanitizeExportFileNamePart(project.title)}.pdf`);
      setComplexProjectPhaseMessage("甘特图 PDF 已生成");
    } catch (error) {
      setComplexProjectPhaseMessage(
        error instanceof Error ? error.message : "甘特图 PDF 导出失败",
      );
    }
  };

  const handleExportComplexProjectGanttPptx = async (projectId: string) => {
    const project = complexProjectBook[projectId];

    if (!project) {
      setComplexProjectPhaseMessage("项目不存在，无法导出 PPT");
      return;
    }

    try {
      await createComplexProjectGanttEditablePptx(project);
      setComplexProjectPhaseMessage("甘特图 PPTX 已生成");
    } catch (error) {
      setComplexProjectPhaseMessage(
        error instanceof Error ? error.message : "甘特图 PPTX 导出失败",
      );
    }
  };

  const handleExportComplexProjectXmind = (projectId: string) => {
    const project = complexProjectBook[projectId];

    if (!project) {
      setComplexProjectPhaseMessage("项目不存在，无法导出 Xmind");
      return;
    }

    try {
      const xmindBlob = createComplexProjectXmindBlob(project);

      downloadBlob(
        xmindBlob,
        `复杂项目思维导图-${sanitizeExportFileNamePart(project.title)}.xmind`,
      );
      setComplexProjectPhaseMessage("Xmind 文件已生成");
    } catch (error) {
      setComplexProjectPhaseMessage(
        error instanceof Error ? error.message : "Xmind 文件导出失败",
      );
    }
  };

  const timeDifferenceToneClass =
    dailyTimeStats.differenceSeconds === null
      ? "border-slate-100 bg-slate-50 text-slate-700"
      : dailyTimeStats.differenceSeconds > 0
      ? "border-rose-100 bg-rose-50 text-rose-700"
      : dailyTimeStats.differenceSeconds < 0
        ? "border-emerald-100 bg-emerald-50 text-emerald-700"
        : "border-slate-100 bg-slate-50 text-slate-700";
  const timeDifferenceDetail =
    dailyTimeStats.differenceSeconds === null
      ? "没有可比较的目标"
      : dailyTimeStats.differenceSeconds > 0
      ? "实际已超计划"
      : dailyTimeStats.differenceSeconds < 0
        ? "实际少于计划"
        : "实际与计划持平";
  const timeDifferenceValue =
    dailyTimeStats.differenceSeconds === null
      ? "暂无计划"
      : formatSignedDashboardDuration(dailyTimeStats.differenceSeconds);
  const dailyTimeStatCards = [
    {
      label: "计划总用时",
      value: formatDashboardMinutes(dailyTimeStats.targetTotalMinutes),
      detail: `${dailyTimeStats.missingTargetCount} 项未填目标`,
      className: "border-sky-100 bg-sky-50 text-sky-700",
    },
    {
      label: "实际总用时",
      value: formatDashboardDuration(dailyTimeStats.liveActualSeconds),
      detail:
        dailyTimeStats.projectActualSeconds > 0
          ? `含项目 ${formatDashboardDuration(dailyTimeStats.projectActualSeconds)}`
          : dailyTimeStats.temporaryTimerSeconds > 0
            ? `含计时 ${formatTimerSeconds(dailyTimeStats.temporaryTimerSeconds)}`
            : `已记录 ${formatDashboardMinutes(dailyTimeStats.savedActualMinutes)}`,
      className: "border-violet-100 bg-violet-50 text-violet-700",
    },
    {
      label: "项目执行用时",
      value: formatDashboardDuration(dailyTimeStats.projectActualSeconds),
      detail:
        dailyTimeStats.projectSessionCount > 0
          ? `${dailyTimeStats.projectSessionCount} 段项目计时`
          : "暂无项目计时",
      className: "border-amber-100 bg-amber-50 text-amber-800",
    },
    {
      label: "用时差值",
      value: timeDifferenceValue,
      detail: timeDifferenceDetail,
      className: timeDifferenceToneClass,
    },
  ];
  const getLiveActualSecondsForPlan = (item: PlanItem) => {
    const liveTimerSeconds = item.actualMinutes
      ? 0
      : getTaskTimeSecondsForDate(item, selectedDate, timerTick);

    return (item.actualMinutes ?? 0) * 60 + liveTimerSeconds;
  };
  const categoryTimeChartItems = Array.from(
    plans.reduce((categoryMap, item) => {
      const key = item.category || "未分类";
      const current = categoryMap.get(key) ?? {
        actualSeconds: 0,
        count: 0,
        label: key,
        targetSeconds: 0,
      };

      current.count += 1;
      current.targetSeconds += (item.targetMinutes ?? 0) * 60;
      current.actualSeconds += getLiveActualSecondsForPlan(item);
      categoryMap.set(key, current);
      return categoryMap;
    }, new Map<string, { actualSeconds: number; count: number; label: string; targetSeconds: number }>()),
  )
    .map(([, value]) => value)
    .filter((item) => item.targetSeconds > 0 || item.actualSeconds > 0)
    .sort((left, right) => right.actualSeconds + right.targetSeconds - (left.actualSeconds + left.targetSeconds))
    .slice(0, 5);
  const priorityTimeChartItems = PRIORITY_OPTIONS.map((priorityOption) => {
    const priorityPlans = plans.filter((item) => normalizePriority(item.priority) === priorityOption.id);

    return {
      actualSeconds: priorityPlans.reduce(
        (totalSeconds, item) => totalSeconds + getLiveActualSecondsForPlan(item),
        0,
      ),
      count: priorityPlans.length,
      hint: priorityOption.hint,
      icon: priorityOption.icon,
      id: priorityOption.id,
      label: priorityOption.name,
      targetSeconds: getTotalMinutes(priorityPlans, "targetMinutes") * 60,
    };
  }).filter((item) => item.count > 0);
  const taskTimeChartItems = plans
    .map((item) => {
      const targetSeconds = (item.targetMinutes ?? 0) * 60;
      const actualSeconds = getLiveActualSecondsForPlan(item);

      return {
        actualSeconds,
        id: item.id,
        targetSeconds,
        title: item.title || "未命名计划",
      };
    })
    .filter((item) => item.targetSeconds > 0 || item.actualSeconds > 0)
    .slice(0, 6);
  const taskTimeChartMaxSeconds = Math.max(
    ...taskTimeChartItems.flatMap((item) => [item.targetSeconds, item.actualSeconds]),
    60,
  );
  const chartPalette = ["#38bdf8", "#a78bfa", "#fbbf24", "#34d399", "#fb7185"];
  const categoryChartMaxSeconds = Math.max(
    ...categoryTimeChartItems.flatMap((item) => [item.targetSeconds, item.actualSeconds]),
    60,
  );
  const categoryVisualizationItems = categoryTimeChartItems.map((item, index) => ({
    ...item,
    actualHeight:
      item.actualSeconds > 0 ? Math.max(8, Math.min(100, (item.actualSeconds / categoryChartMaxSeconds) * 100)) : 0,
    color: chartPalette[index % chartPalette.length],
    targetHeight:
      item.targetSeconds > 0 ? Math.max(8, Math.min(100, (item.targetSeconds / categoryChartMaxSeconds) * 100)) : 0,
  }));
  const priorityChartStyleById = {
    high: {
      accentColor: "#f43f5e",
      backgroundColor: "#fff1f2",
      borderColor: "#fecdd3",
      targetColor: "#7dd3fc",
    },
    medium: {
      accentColor: "#0ea5e9",
      backgroundColor: "#f0f9ff",
      borderColor: "#bae6fd",
      targetColor: "#a78bfa",
    },
    low: {
      accentColor: "#10b981",
      backgroundColor: "#ecfdf5",
      borderColor: "#bbf7d0",
      targetColor: "#fbbf24",
    },
  } satisfies Record<
    TaskPriority,
    {
      accentColor: string;
      backgroundColor: string;
      borderColor: string;
      targetColor: string;
    }
  >;
  const priorityVisualizationItems = priorityTimeChartItems.map((item) => {
    const localMaxSeconds = Math.max(item.targetSeconds, item.actualSeconds, 60);

    return {
      ...item,
      ...priorityChartStyleById[item.id],
      actualHeight: item.actualSeconds > 0 ? Math.max(8, (item.actualSeconds / localMaxSeconds) * 100) : 0,
      targetHeight: item.targetSeconds > 0 ? Math.max(8, (item.targetSeconds / localMaxSeconds) * 100) : 0,
    };
  });
  const complexProjectTimeItems = complexProjects
    .map((project) => {
      const phases = sortComplexProjectPhases(project.phases).map((phase) => {
        const totalSeconds = getComplexProjectPhaseTotalSeconds(phase, timerTick);
        const todaySeconds = getComplexProjectPhaseSecondsForDate(phase, selectedDate, timerTick);
        const todaySessionCount = phase.timeEntries.filter((entry) => entry.date === selectedDate).length;
        const runningEntry = getRunningComplexProjectPhaseEntry(phase);

        return {
          id: phase.id,
          isRunning: Boolean(runningEntry),
          title: phase.title,
          todaySeconds,
          todaySessionCount,
          totalSeconds,
        };
      });
      const totalSeconds = phases.reduce((total, phase) => total + phase.totalSeconds, 0);
      const todaySeconds = phases.reduce((total, phase) => total + phase.todaySeconds, 0);
      const todaySessionCount = phases.reduce((total, phase) => total + phase.todaySessionCount, 0);
      const maxPhaseSeconds = Math.max(...phases.map((phase) => phase.totalSeconds), 60);

      return {
        id: project.id,
        phases: phases.map((phase) => ({
          ...phase,
          widthPercent:
            phase.totalSeconds > 0
              ? Math.max(6, Math.min(100, (phase.totalSeconds / maxPhaseSeconds) * 100))
              : 0,
        })),
        title: project.title,
        todaySeconds,
        todaySessionCount,
        totalSeconds,
      };
    })
    .filter((item) => item.totalSeconds > 0 || item.todaySessionCount > 0);
  const isSignedIn = Boolean(currentUser && authMode !== "update-password");
  const isPreviewMode = new URLSearchParams(window.location.search).has("preview");
  const toggleTodayWorkspaceSection = (sectionId: TodayWorkspaceSectionId) => {
    setTodayWorkspaceCollapsed((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
  };
  const openTaskForm = () => {
    setActiveWorkspaceTab("tasks");
    resetForm();
    cancelTaskInlineEdit();
    cancelActualMinutesEdit();
    setIsTaskFormOpen(true);
  };
  const closeTaskForm = () => {
    resetForm();
    setIsTaskFormOpen(false);
  };
  const selectAvatar = (avatarId: AvatarId) => {
    setUserProfile((current) =>
      current.avatarId === avatarId
        ? current
        : {
            avatarId,
            updatedAt: Date.now(),
          },
    );
    setIsAvatarPickerOpen(false);
  };
  const renderAvatarPicker = (compact = false) => {
    const avatarMenuId = compact ? "account-avatar-picker-menu" : "standalone-avatar-picker-menu";
    const toggleAvatarPicker = () => setIsAvatarPickerOpen((current) => !current);

    return (
      <div
        className={`relative rounded-[1.35rem] border border-pink-100 bg-pink-50/55 ${
          compact ? "p-2.5" : "p-3"
        }`}
      >
        <button
          aria-controls={avatarMenuId}
          aria-expanded={isAvatarPickerOpen}
          aria-label={isAvatarPickerOpen ? "收起头像选择" : "展开头像选择"}
          className="flex w-full items-center gap-3 text-left transition hover:opacity-90 focus:outline-none focus:ring-4 focus:ring-pink-100"
          type="button"
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              toggleAvatarPicker();
            }
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            toggleAvatarPicker();
          }}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <img
              alt="当前头像"
              className="h-11 w-11 shrink-0 rounded-full border-2 border-white bg-white object-cover shadow-sm shadow-pink-100"
              src={selectedAvatar.src}
            />
            <div className="min-w-0">
              <p className="text-sm font-black text-pink-600">领取头像</p>
            </div>
          </div>
        </button>

        {isAvatarPickerOpen ? (
          <div
            className={`absolute left-0 right-0 top-full z-30 mt-2 rounded-[1.35rem] border border-pink-100 bg-white/95 p-3 shadow-2xl shadow-pink-100/70 backdrop-blur ${
              compact ? "max-h-64" : "max-h-72"
            } overflow-y-auto`}
            id={avatarMenuId}
          >
            <div className="space-y-3">
              {AVATAR_GROUPS.map(({ group, avatars }) => (
                <section key={group}>
                  <p className="mb-2 px-1 text-[11px] font-black text-[#8a7a94]">{group}</p>
                  <div className="grid grid-cols-5 gap-2 sm:grid-cols-7">
                    {avatars.map((avatar) => {
                      const isSelected = avatar.id === userProfile.avatarId;
                      const avatarIndex =
                        AVATAR_OPTIONS.findIndex((option) => option.id === avatar.id) + 1;

                      return (
                        <button
                          aria-label={`选择第 ${avatarIndex} 个头像`}
                          className={`relative aspect-square rounded-2xl border bg-white p-1 transition hover:-translate-y-0.5 hover:border-pink-200 hover:shadow-sm hover:shadow-pink-100 focus:outline-none focus:ring-4 focus:ring-pink-100 ${
                            isSelected
                              ? "border-pink-300 ring-4 ring-pink-100"
                              : "border-white/80 shadow-sm shadow-pink-50"
                          }`}
                          key={avatar.id}
                          type="button"
                          onClick={() => selectAvatar(avatar.id)}
                        >
                          <img
                            alt=""
                            className="h-full w-full rounded-full object-cover"
                            src={avatar.src}
                          />
                          {isSelected ? (
                            <span className="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-pink-500 text-[11px] font-black text-white shadow-sm shadow-pink-200">
                              ✓
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  };
  const authPanel = (
    <section>
      <button
        className="whitespace-nowrap rounded-full border border-violet-100 bg-violet-50/95 px-2.5 py-1 text-xs font-black leading-none text-violet-700 shadow-sm shadow-violet-100/60 transition hover:bg-violet-100 disabled:opacity-50"
        disabled={isAuthBusy}
        type="button"
        onClick={handleSignOut}
      >
        {isAuthBusy ? "退出中" : "退出"}
      </button>
    </section>
  );
  const standaloneAuthTitle =
    authMode === "sign-up"
      ? "创建账号"
      : authMode === "forgot"
        ? "找回密码"
        : authMode === "update-password"
          ? "设置新密码"
          : "登录";
  const standaloneAuthSubmitLabel = isAuthBusy
    ? "处理中..."
    : authMode === "sign-up"
      ? "注册"
      : authMode === "forgot"
        ? "发送重置邮件"
        : authMode === "update-password"
          ? "设置新密码"
          : "登录";
  const standaloneAuthPage = (
    <main className="flex min-h-screen items-center justify-center bg-[#fff8ef] bg-[linear-gradient(180deg,#fff8ef_0%,#f6f1ff_48%,#edf8ff_100%)] px-4 py-8 text-[#46394f]">
      <section className="w-full max-w-md rounded-[2rem] border border-white/80 bg-white/90 p-5 shadow-2xl shadow-violet-100/70 backdrop-blur sm:p-6">
        <div className="mb-5">
          <p className="mb-1 text-sm font-semibold text-pink-500">Daily Planner Journal</p>
          <h1 className="text-3xl font-black tracking-normal text-[#382b44]">今日计划手帐</h1>
        </div>

        <form className="space-y-3" onSubmit={handleAuthSubmit}>
          {authMode === "sign-in" || authMode === "sign-up" ? (
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-violet-50/80 p-1">
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
	          ) : (
            <p className="rounded-2xl bg-violet-50/80 px-3 py-2 text-sm font-black text-violet-700">
	              {standaloneAuthTitle}
	            </p>
	          )}

	          {authMode === "sign-in" || authMode === "sign-up" ? renderAvatarPicker() : null}
	
	          {authMode === "update-password" ? (
            <>
              <label className="block text-xs font-black text-[#6f5d78]" htmlFor="standalone-new-password">
                新密码
              </label>
              <input
                autoComplete="new-password"
                className="w-full rounded-2xl border border-violet-100 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-[#b8aabd] focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                id="standalone-new-password"
                minLength={6}
                placeholder="至少 6 位"
                type="password"
                value={authForm.password}
                onChange={(event) =>
                  setAuthForm((current) => ({ ...current, password: event.target.value }))
                }
              />
              <label
                className="block text-xs font-black text-[#6f5d78]"
                htmlFor="standalone-confirm-password"
              >
                确认新密码
              </label>
              <input
                autoComplete="new-password"
                className="w-full rounded-2xl border border-violet-100 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-[#b8aabd] focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                id="standalone-confirm-password"
                minLength={6}
                placeholder="再次输入新密码"
                type="password"
                value={authForm.confirmPassword}
                onChange={(event) =>
                  setAuthForm((current) => ({ ...current, confirmPassword: event.target.value }))
                }
              />
            </>
          ) : (
            <>
              <label className="block text-xs font-black text-[#6f5d78]" htmlFor="standalone-auth-email">
                邮箱
              </label>
              <input
                autoComplete="email"
                className="w-full rounded-2xl border border-violet-100 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-[#b8aabd] focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                id="standalone-auth-email"
                placeholder="QQ、163、Gmail 等邮箱"
                type="email"
                value={authForm.email}
                onChange={(event) =>
                  setAuthForm((current) => ({ ...current, email: event.target.value }))
                }
              />

              {authMode === "forgot" ? null : (
                <>
                  <label
                    className="block text-xs font-black text-[#6f5d78]"
                    htmlFor="standalone-auth-password"
                  >
                    密码
                  </label>
                  <input
                    autoComplete={authMode === "sign-up" ? "new-password" : "current-password"}
                    className="w-full rounded-2xl border border-violet-100 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-[#b8aabd] focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                    id="standalone-auth-password"
                    minLength={6}
                    placeholder="本站登录密码"
                    type="password"
                    value={authForm.password}
                    onChange={(event) =>
                      setAuthForm((current) => ({ ...current, password: event.target.value }))
                    }
                  />
                </>
              )}
            </>
          )}

          <button
            className="w-full rounded-2xl bg-[#9f8cff] px-4 py-3 text-sm font-black text-white shadow-sm shadow-violet-200 transition hover:bg-[#8f7af2] disabled:opacity-50"
            disabled={isAuthBusy || !isSupabaseConfigured}
            type="submit"
          >
            {standaloneAuthSubmitLabel}
          </button>

          {authStatus || authMode === "sign-in" || authMode === "forgot" ? (
            <div
              className={`flex flex-wrap items-center gap-2 text-xs font-bold text-[#76687f] ${
                authStatus ? "justify-between" : "justify-end"
              }`}
            >
              {authStatus ? <span>{authStatus}</span> : null}
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
          ) : null}
        </form>
      </section>
    </main>
  );
  const moodPanel = (
    <section className="max-h-[calc(100vh-2.5rem)] overflow-y-auto rounded-[1.5rem] border border-white/80 bg-white p-4 shadow-2xl shadow-pink-200/40 sm:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-black text-pink-600">当日心情</p>
          <h2 className="mt-1 text-xl font-black text-[#3f3349]">
            {formatDisplayDateWithYear(selectedDate)}
          </h2>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            id="mood-export-timeline"
            className="rounded-full bg-pink-50 px-3 py-1.5 text-xs font-black text-pink-700 transition hover:bg-pink-100 disabled:opacity-50"
            disabled={isMoodExporting}
            type="button"
            onClick={exportMoodTimelinePng}
          >
            {isMoodExporting ? "导出中..." : "导出轨迹图"}
          </button>
          <button
            className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-[#6d5d75] transition hover:bg-slate-200 focus:outline-none focus:ring-4 focus:ring-slate-100"
            type="button"
            onClick={() => setIsMoodPanelOpen(false)}
          >
            关闭
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.3fr)]">
        <section className="rounded-[1.35rem] border border-pink-100 bg-pink-50/70 p-3">
          <p className="mb-2 text-sm font-black text-pink-700">记录此刻</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {MOOD_OPTIONS.map((option) => {
              const isSelected = moodDraftId === option.id;

              return (
                <button
                  className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2 text-center text-xs font-black transition ${
                    isSelected
                      ? `${option.toneClass} ring-2 ring-pink-200`
                      : "border-white bg-white/80 text-[#6f5d78] hover:bg-white"
                  }`}
                  key={option.id}
                  type="button"
                  onClick={() => setMoodDraftId(option.id)}
                >
                  <span className="text-xl leading-none">{option.icon}</span>
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
          <label className="mt-3 block text-xs font-black text-[#6f5d78]" htmlFor="mood-note">
            备注
            <textarea
              className="mt-1.5 min-h-20 w-full resize-none rounded-2xl border border-pink-100 bg-white px-3 py-2 text-sm font-bold leading-5 text-[#46394f] outline-none transition placeholder:text-[#b8aabd] focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
              id="mood-note"
              maxLength={180}
              placeholder="可选"
              value={moodNoteDraft}
              onChange={(event) => setMoodNoteDraft(event.target.value)}
            />
          </label>
          <button
            id="mood-save-entry"
            className="mt-3 w-full rounded-2xl bg-[#ff8fbc] px-4 py-2.5 text-sm font-black text-white shadow-sm shadow-pink-100 transition hover:bg-[#ff79ad]"
            type="button"
            onClick={addMoodEntry}
          >
            记录此刻
          </button>
          {moodStatus ? (
            <p className="mt-2 rounded-2xl bg-white/80 px-3 py-2 text-xs font-black text-pink-700">
              {moodStatus}
            </p>
          ) : null}
        </section>

        <div className="min-w-0" ref={moodTimelineRef}>
          <MoodTimelineCard entries={selectedMoodEntries} selectedDate={selectedDate} />
        </div>
      </div>

      <section className="mt-4 rounded-[1.35rem] border border-slate-100 bg-[#fbf7fc] p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-black text-[#6f5d78]">记录明细</p>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#7b6c84]">
            {selectedMoodEntries.length} 条
          </span>
        </div>
        {selectedMoodEntries.length > 0 ? (
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {[...selectedMoodEntries].reverse().map((entry) => {
              const option = getMoodOption(entry.moodId);

              return (
                <div
                  className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/85 px-3 py-2 text-xs font-black text-[#6f5d78]"
                  key={entry.id}
                >
                  <span className={`rounded-full border px-2.5 py-1 ${option.toneClass}`}>
                    {option.icon} {option.label}
                  </span>
                  <span>{formatClockTime(entry.timestamp)}</span>
                  {entry.note ? <span className="min-w-0 flex-1 break-words">{entry.note}</span> : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl bg-white/75 px-4 py-4 text-center text-sm font-black text-[#8b7b91]">
            今天还没有心情记录
          </div>
        )}
      </section>
    </section>
  );
  const taskFormPanel = (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="min-w-0 text-xs font-black text-[#6f5d78]" htmlFor="task-modal-title">
          标题
          <input
            className="mt-1.5 w-full rounded-2xl border border-pink-100 bg-white px-3 py-2.5 outline-none transition placeholder:text-[#b8aabd] focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
            id="task-modal-title"
            maxLength={48}
            placeholder="写下今天要做的事"
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
          />
        </label>

        <label className="min-w-0 text-xs font-black text-[#6f5d78]" htmlFor="task-modal-category">
          分类
          <select
            className="mt-1.5 w-full rounded-2xl border border-pink-100 bg-white px-3 py-2.5 outline-none transition focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
            id="task-modal-category"
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
        </label>
      </div>

      <div className="rounded-[1.1rem] border border-dashed border-pink-100 bg-pink-50/50 p-2">
        {isCustomCategoryOpen ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="task-modal-custom-category">
              自定义分类
            </label>
            <input
              className="min-w-0 flex-1 rounded-2xl border border-pink-100 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-[#b8aabd] focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
              id="task-modal-custom-category"
              maxLength={20}
              placeholder="例如：阅读、旅行"
              value={customCategoryInput}
              onChange={(event) => {
                setCustomCategoryInput(event.target.value);
                setCustomCategoryStatus("");
              }}
            />
            <button
              className="rounded-2xl bg-white px-3 py-2 text-sm font-black text-pink-600 shadow-sm transition hover:bg-pink-100 disabled:opacity-50"
              disabled={!customCategoryInput.trim()}
              type="button"
              onClick={handleAddCustomCategory}
            >
              添加
            </button>
            <button
              className="rounded-2xl bg-white/70 px-3 py-2 text-sm font-bold text-[#7a6b84] transition hover:bg-white"
              type="button"
              onClick={() => {
                setIsCustomCategoryOpen(false);
                setCustomCategoryInput("");
                setCustomCategoryStatus("");
              }}
            >
              取消
            </button>
          </div>
        ) : (
          <button
            className="w-full rounded-2xl bg-white/70 px-3 py-2 text-left text-xs font-black text-pink-600 transition hover:bg-white"
            type="button"
            onClick={() => {
              setIsCustomCategoryOpen(true);
              setCustomCategoryStatus("");
            }}
          >
            + 添加自定义分类
          </button>
        )}
        {customCategoryStatus ? (
          <p className="mt-2 text-xs font-bold text-[#8b7b91]">{customCategoryStatus}</p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="min-w-0 text-xs font-black text-[#6f5d78]" htmlFor="task-modal-priority">
          优先级
          <select
            className="mt-1.5 w-full rounded-2xl border border-pink-100 bg-white px-3 py-2.5 outline-none transition focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
            id="task-modal-priority"
            value={form.priority}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                priority: normalizePriority(event.target.value),
              }))
            }
          >
            {PRIORITY_OPTIONS.map((priorityOption) => (
              <option key={priorityOption.id} value={priorityOption.id}>
                {priorityOption.icon} {priorityOption.name}
              </option>
            ))}
          </select>
        </label>

        <label
          className="min-w-0 text-xs font-black text-[#6f5d78]"
          htmlFor="task-modal-target-minutes"
        >
          目标时长（分钟）
          <input
            className="mt-1.5 w-full rounded-2xl border border-pink-100 bg-white px-3 py-2.5 outline-none transition placeholder:text-[#b8aabd] focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
            id="task-modal-target-minutes"
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
        </label>
      </div>

      <label className="block text-xs font-black text-[#6f5d78]" htmlFor="task-modal-note">
        备注
        <textarea
          className="mt-1.5 min-h-24 w-full resize-none rounded-2xl border border-pink-100 bg-white px-3 py-2.5 outline-none transition placeholder:text-[#b8aabd] focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
          id="task-modal-note"
          maxLength={160}
          placeholder="可选"
          value={form.note}
          onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
        />
      </label>

      <div className="flex flex-wrap justify-end gap-3">
        <button
          className="rounded-2xl border border-[#ded2e8] bg-white px-5 py-2.5 text-sm font-bold text-[#6f5d78] transition hover:bg-[#f8f2ff]"
          type="button"
          onClick={closeTaskForm}
        >
          取消
        </button>
        <button
          className="rounded-2xl bg-[#ff8fbc] px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-pink-200 transition hover:-translate-y-0.5 hover:bg-[#ff79ad] disabled:opacity-50"
          disabled={!form.title.trim()}
          type="submit"
        >
          {editingId ? "保存修改" : "添加计划"}
        </button>
      </div>
    </form>
  );
  const complexProjectWorkspace = (
    <section className="p-4 sm:p-6">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-black text-amber-700">复杂项目工作区</p>
          <h2 className="mt-1 text-2xl font-black text-[#3f3349]">阶段计划与甘特图</h2>
          <p className="mt-1 text-sm font-bold text-[#8b7b91]">
            {complexProjects.length > 0
              ? `当前 ${complexProjects.length} 个项目，相关甘特图在宽屏区域预览`
              : "创建复杂项目后，可以在这里管理阶段和导出甘特图"}
          </p>
        </div>
        <button
          className="rounded-2xl bg-amber-500 px-4 py-2.5 text-sm font-black text-white shadow-sm shadow-amber-100 transition hover:bg-amber-600 focus:outline-none focus:ring-4 focus:ring-amber-100"
          type="button"
          onClick={openNewComplexProjectForm}
        >
          + 新建复杂项目
        </button>
      </div>

      {isComplexProjectFormOpen ? (
        <form
          className="mb-5 space-y-2.5 rounded-[1.5rem] border border-amber-100 bg-amber-50/70 p-4"
          onSubmit={handleComplexProjectSubmit}
        >
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]">
            <label
              className="min-w-0 text-xs font-black text-[#6f5d78]"
              htmlFor="workspace-complex-project-title"
            >
              项目标题
              <input
                className="mt-1.5 w-full rounded-2xl border border-amber-100 bg-white px-3 py-2.5 text-sm font-bold text-[#46394f] outline-none transition placeholder:text-[#b8aabd] focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
                id="workspace-complex-project-title"
                maxLength={64}
                placeholder="例如：论文开题准备"
                value={complexProjectForm.title}
                onChange={(event) => {
                  setComplexProjectForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }));
                  setComplexProjectFormError("");
                }}
              />
            </label>

            <label
              className="min-w-0 text-xs font-black text-[#6f5d78]"
              htmlFor="workspace-complex-project-category"
            >
              分类
              <select
                className="mt-1.5 w-full rounded-2xl border border-amber-100 bg-white px-3 py-2.5 text-sm font-bold text-[#46394f] outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
                id="workspace-complex-project-category"
                value={complexProjectForm.category}
                onChange={(event) =>
                  setComplexProjectForm((current) => ({
                    ...current,
                    category: event.target.value,
                  }))
                }
              >
                {complexProjectCategoryOptions.map((category) => (
                  <option key={category.id} value={category.name}>
                    {category.icon} {category.name}
                  </option>
                ))}
              </select>
            </label>

            <label
              className="min-w-0 text-xs font-black text-[#6f5d78]"
              htmlFor="workspace-complex-project-priority"
            >
              优先级
              <select
                className="mt-1.5 w-full rounded-2xl border border-amber-100 bg-white px-3 py-2.5 text-sm font-bold text-[#46394f] outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
                id="workspace-complex-project-priority"
                value={complexProjectForm.priority}
                onChange={(event) =>
                  setComplexProjectForm((current) => ({
                    ...current,
                    priority: normalizePriority(event.target.value),
                  }))
                }
              >
                {PRIORITY_OPTIONS.map((priorityOption) => (
                  <option key={priorityOption.id} value={priorityOption.id}>
                    {priorityOption.icon} {priorityOption.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label
              className="min-w-0 text-xs font-black text-[#6f5d78]"
              htmlFor="workspace-complex-project-start-date"
            >
              开始日期
              <input
                className="mt-1.5 w-full rounded-2xl border border-amber-100 bg-white px-3 py-2.5 text-sm font-bold text-[#46394f] outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
                id="workspace-complex-project-start-date"
                required
                type="date"
                value={complexProjectForm.startDate}
                onChange={(event) => {
                  setComplexProjectForm((current) => ({
                    ...current,
                    startDate: event.target.value,
                  }));
                  setComplexProjectFormError("");
                }}
              />
            </label>

            <label
              className="min-w-0 text-xs font-black text-[#6f5d78]"
              htmlFor="workspace-complex-project-end-date"
            >
              结束日期
              <input
                className="mt-1.5 w-full rounded-2xl border border-amber-100 bg-white px-3 py-2.5 text-sm font-bold text-[#46394f] outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
                id="workspace-complex-project-end-date"
                required
                type="date"
                value={complexProjectForm.endDate}
                onChange={(event) => {
                  setComplexProjectForm((current) => ({
                    ...current,
                    endDate: event.target.value,
                  }));
                  setComplexProjectFormError("");
                }}
              />
            </label>
          </div>

          <label
            className="block text-xs font-black text-[#6f5d78]"
            htmlFor="workspace-complex-project-note"
          >
            备注
            <textarea
              className="mt-1.5 h-11 w-full resize-none rounded-2xl border border-amber-100 bg-white px-3 py-2 text-sm font-bold leading-5 text-[#46394f] outline-none transition placeholder:text-[#b8aabd] focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
              id="workspace-complex-project-note"
              maxLength={240}
              placeholder="可选"
              value={complexProjectForm.note}
              onChange={(event) =>
                setComplexProjectForm((current) => ({
                  ...current,
                  note: event.target.value,
                }))
              }
            />
          </label>

          {complexProjectFormError ? (
            <p className="rounded-2xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-600">
              {complexProjectFormError}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <button
              className="rounded-2xl bg-white px-4 py-2 text-sm font-bold text-[#6f5d78] transition hover:bg-amber-50"
              type="button"
              onClick={() => resetComplexProjectForm()}
            >
              取消
            </button>
            <button
              className="rounded-2xl bg-amber-500 px-4 py-2 text-sm font-black text-white shadow-sm shadow-amber-100 transition hover:bg-amber-600 disabled:opacity-50"
              disabled={!complexProjectForm.title.trim()}
              type="submit"
            >
              {editingComplexProjectId ? "保存项目" : "创建项目"}
            </button>
          </div>
        </form>
      ) : null}

      {complexProjectPhaseMessage ? (
        <p className="mb-4 rounded-2xl bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700">
          {complexProjectPhaseMessage}
        </p>
      ) : null}

      {complexProjects.length > 0 ? (
        <div className="space-y-4">
          {complexProjects.map((project) => {
            const style = getCategoryStyle(project.category, customCategories);
            const priorityOption = getPriorityOption(project.priority);
            const projectProgress = getComplexProjectProgress(project);
            const sortedPhases = sortComplexProjectPhases(project.phases);
            const projectTotalSeconds = getComplexProjectTotalSeconds(project, timerTick);
            const projectTodaySeconds = getComplexProjectSecondsForDate(project, selectedDate, timerTick);
            const projectTodaySessionCount = getComplexProjectSessionCountForDate(project, selectedDate);
            const isPhaseFormVisible = complexProjectPhaseEdit?.projectId === project.id;
            const projectFeedback =
              complexProjectFeedback?.projectId === project.id ? complexProjectFeedback : null;
            const isGanttPreviewVisible = ganttPreviewProjectId === project.id;

            return (
              <article
                className={`rounded-[1.5rem] border bg-white/86 p-4 shadow-sm transition ${
                  projectFeedback?.projectCompleted
                    ? "border-emerald-200 ring-2 ring-emerald-100"
                    : "border-amber-100"
                }`}
                key={project.id}
              >
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap gap-1.5 text-xs font-black">
                      <span className={`rounded-full px-2.5 py-1 ${style.bg} ${style.accent}`}>
                        {style.emoji} {project.category}
                      </span>
                      <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700">
                        {priorityOption.icon} {priorityOption.name}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 ${
                          project.status === "active"
                            ? "bg-emerald-50 text-emerald-700"
                            : project.status === "completed"
                              ? "bg-sky-50 text-sky-700"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {getComplexProjectStatusLabel(project.status)}
                      </span>
                    </div>
                    <h3 className="break-words text-xl font-black text-[#3f3349]">
                      {project.title}
                    </h3>
                    <p className="mt-1 text-sm font-bold text-[#8b7b91]">
                      {formatDisplayDate(project.startDate)} - {formatDisplayDate(project.endDate)}
                    </p>
                  </div>

                  <div className="rounded-[1.15rem] bg-amber-50/70 p-3">
                    <div className="flex items-center justify-between gap-2 text-xs font-black text-[#7b6c84]">
                      <span>
                        阶段进度 {projectProgress.completed} / {projectProgress.total}
                      </span>
                      <span>{projectProgress.percent}%</span>
                    </div>
	                    <div className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-white">
	                      <motion.div
                        animate={{ width: `${projectProgress.percent}%` }}
                        className="h-full rounded-full bg-[linear-gradient(90deg,#f59e0b,#34d399)]"
                        initial={false}
                        transition={{ duration: 0.42, ease: "easeOut" }}
                      />
                      <AnimatePresence>
                        {projectFeedback ? (
                          <motion.div
                            aria-hidden="true"
                            animate={{ opacity: 0, x: "100%" }}
                            className="absolute inset-0 rounded-full bg-white/75"
                            exit={{ opacity: 0 }}
                            initial={{ opacity: 0.8, x: "-100%" }}
                            key={projectFeedback.id}
                            transition={{ duration: 0.72, ease: "easeOut" }}
                          />
	                        ) : null}
	                      </AnimatePresence>
	                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-[0.9rem] bg-white/75 px-3 py-2">
                        <p className="text-[10px] font-black text-[#8b7b91]">项目总用时</p>
                        <p className="mt-0.5 text-sm font-black text-[#46394f]">
                          {formatDashboardDuration(projectTotalSeconds)}
                        </p>
                      </div>
                      <div className="rounded-[0.9rem] bg-white/75 px-3 py-2">
                        <p className="text-[10px] font-black text-[#8b7b91]">今日项目用时</p>
                        <p className="mt-0.5 text-sm font-black text-[#46394f]">
                          {formatDashboardDuration(projectTodaySeconds)}
                          <span className="ml-1.5 text-xs text-[#8b7b91]">
                            {projectTodaySessionCount} 段
                          </span>
                        </p>
                      </div>
                    </div>
	                    <AnimatePresence>
                      {projectFeedback ? (
                        <motion.p
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-2 rounded-full bg-white/80 px-2 py-1 text-xs font-black text-emerald-700"
                          exit={{ opacity: 0, y: -4 }}
                          initial={{ opacity: 0, y: 4 }}
                          key={projectFeedback.id}
                          transition={{ duration: 0.22, ease: "easeOut" }}
                        >
                          {projectFeedback.projectCompleted
                            ? "项目阶段全部完成"
                            : `阶段完成：${projectFeedback.phaseTitle}`}
                        </motion.p>
                      ) : null}
                    </AnimatePresence>
                    {projectProgress.total === 0 ? (
                      <p className="mt-2 text-xs font-bold text-[#8b7b91]">先添加阶段</p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-700 transition hover:bg-amber-100 focus:outline-none focus:ring-4 focus:ring-amber-100"
                    type="button"
                    onClick={() => openNewComplexProjectPhaseForm(project)}
                  >
                    + 阶段
                  </button>
                  <button
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-[#6f5d78] transition hover:bg-amber-50 focus:outline-none focus:ring-4 focus:ring-amber-100"
                    type="button"
                    onClick={() => startComplexProjectEdit(project)}
                  >
                    编辑项目
                  </button>
                  {project.status !== "archived" ? (
                    <>
                      <button
                        className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700 transition hover:bg-emerald-100"
                        type="button"
                        onClick={() => toggleComplexProjectCompleted(project.id)}
                      >
                        {project.status === "completed" ? "恢复进行中" : "标记完成"}
                      </button>
                      <button
                        className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-200"
                        type="button"
                        onClick={() => archiveComplexProject(project.id)}
                      >
                        归档
                      </button>
                    </>
                  ) : null}
                  <button
                    className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-black text-amber-800 transition hover:bg-amber-200"
                    type="button"
                    onClick={() =>
                      setGanttPreviewProjectId((current) =>
                        current === project.id ? null : project.id,
                      )
                    }
                  >
                    {isGanttPreviewVisible ? "收起甘特图" : "宽屏甘特图"}
                  </button>
                  <button
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-sky-700 transition hover:bg-sky-50 disabled:opacity-50"
                    disabled={isGanttExporting}
                    type="button"
                    onClick={() => handleExportComplexProjectGanttPng(project.id)}
                  >
                    导出 PNG
                  </button>
                  <button
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-violet-700 transition hover:bg-violet-50 disabled:opacity-50"
                    disabled={isGanttExporting}
                    type="button"
                    onClick={() => handleExportComplexProjectGanttPdf(project.id)}
                  >
                    导出 PDF
                  </button>
                  <button
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-orange-700 transition hover:bg-orange-50 disabled:opacity-50"
                    disabled={isGanttExporting}
                    type="button"
                    onClick={() => handleExportComplexProjectGanttPptx(project.id)}
                  >
                    导出 PPT/PPTX
                  </button>
                  <button
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-emerald-700 transition hover:bg-emerald-50"
                    type="button"
                    onClick={() => handleExportComplexProjectXmind(project.id)}
                  >
                    导出 Xmind
                  </button>
                </div>

                <AnimatePresence>
                  {isGanttPreviewVisible ? (
                    <motion.div
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-4 rounded-[1.35rem] border border-amber-100 bg-[#fffaf4] p-3"
                      data-gantt-preview-project-id={project.id}
                      exit={{ opacity: 0, y: -6 }}
                      initial={{ opacity: 0, y: 6 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                    >
                      <ComplexProjectGanttChart project={project} />
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                {isPhaseFormVisible ? (
                  <form
                    className="mt-4 space-y-3 rounded-[1.25rem] border border-amber-100 bg-amber-50/70 p-3"
                    onSubmit={handleComplexProjectPhaseSubmit}
                  >
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]">
                      <label
                        className="min-w-0 text-xs font-black text-[#6f5d78]"
                        htmlFor={`workspace-complex-project-phase-title-${project.id}`}
                      >
                        阶段标题
                        <input
                          className="mt-1.5 w-full rounded-2xl border border-amber-100 bg-white px-3 py-2 text-sm font-bold text-[#46394f] outline-none transition placeholder:text-[#b8aabd] focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
                          id={`workspace-complex-project-phase-title-${project.id}`}
                          maxLength={64}
                          placeholder="例如：资料收集"
                          value={complexProjectPhaseForm.title}
                          onChange={(event) => {
                            setComplexProjectPhaseForm((current) => ({
                              ...current,
                              title: event.target.value,
                            }));
                            setComplexProjectPhaseFormError("");
                          }}
                        />
                      </label>

                      <label
                        className="min-w-0 text-xs font-black text-[#6f5d78]"
                        htmlFor={`workspace-complex-project-phase-start-${project.id}`}
                      >
                        开始日期
                        <input
                          className="mt-1.5 w-full rounded-2xl border border-amber-100 bg-white px-3 py-2 text-sm font-bold text-[#46394f] outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
                          id={`workspace-complex-project-phase-start-${project.id}`}
                          required
                          type="date"
                          value={complexProjectPhaseForm.startDate}
                          onChange={(event) => {
                            setComplexProjectPhaseForm((current) => ({
                              ...current,
                              startDate: event.target.value,
                            }));
                            setComplexProjectPhaseFormError("");
                          }}
                        />
                      </label>

                      <label
                        className="min-w-0 text-xs font-black text-[#6f5d78]"
                        htmlFor={`workspace-complex-project-phase-end-${project.id}`}
                      >
                        结束日期
                        <input
                          className="mt-1.5 w-full rounded-2xl border border-amber-100 bg-white px-3 py-2 text-sm font-bold text-[#46394f] outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
                          id={`workspace-complex-project-phase-end-${project.id}`}
                          required
                          type="date"
                          value={complexProjectPhaseForm.endDate}
                          onChange={(event) => {
                            setComplexProjectPhaseForm((current) => ({
                              ...current,
                              endDate: event.target.value,
                            }));
                            setComplexProjectPhaseFormError("");
                          }}
                        />
                      </label>
                    </div>

                    <p className="text-xs font-bold text-[#8b7b91]">
                      阶段日期超出项目周期时，保存后会自动扩展项目日期。
                    </p>

                    <label
                      className="block text-xs font-black text-[#6f5d78]"
                      htmlFor={`workspace-complex-project-phase-note-${project.id}`}
                    >
                      阶段备注
                      <textarea
                        className="mt-1.5 min-h-16 w-full resize-none rounded-2xl border border-amber-100 bg-white px-3 py-2 text-sm font-bold text-[#46394f] outline-none transition placeholder:text-[#b8aabd] focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
                        id={`workspace-complex-project-phase-note-${project.id}`}
                        maxLength={240}
                        placeholder="可选"
                        value={complexProjectPhaseForm.note}
                        onChange={(event) =>
                          setComplexProjectPhaseForm((current) => ({
                            ...current,
                            note: event.target.value,
                          }))
                        }
                      />
                    </label>

                    <label
                      className="inline-flex items-center gap-2 rounded-2xl bg-white/75 px-3 py-2 text-xs font-black text-[#6f5d78]"
                      htmlFor={`workspace-complex-project-phase-completed-${project.id}`}
                    >
                      <input
                        checked={complexProjectPhaseForm.completed}
                        className="h-4 w-4 accent-amber-500"
                        id={`workspace-complex-project-phase-completed-${project.id}`}
                        type="checkbox"
                        onChange={(event) =>
                          setComplexProjectPhaseForm((current) => ({
                            ...current,
                            completed: event.target.checked,
                          }))
                        }
                      />
                      已完成
                    </label>

                    {complexProjectPhaseFormError ? (
                      <p className="rounded-2xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-600">
                        {complexProjectPhaseFormError}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        className="rounded-2xl bg-white px-4 py-2 text-xs font-bold text-[#6f5d78] transition hover:bg-amber-50"
                        type="button"
                        onClick={() => resetComplexProjectPhaseForm(project)}
                      >
                        取消
                      </button>
                      <button
                        className="rounded-2xl bg-amber-500 px-4 py-2 text-xs font-black text-white transition hover:bg-amber-600 disabled:opacity-50"
                        disabled={!complexProjectPhaseForm.title.trim()}
                        type="submit"
                      >
                        {complexProjectPhaseEdit?.phaseId ? "保存阶段" : "添加阶段"}
                      </button>
                    </div>
                  </form>
                ) : null}

                <div className="mt-4 grid gap-3 xl:grid-cols-2">
	                  {sortedPhases.length > 0 ? (
	                    sortedPhases.map((phase) => {
	                      const isPhaseFeedbackActive = projectFeedback?.phaseId === phase.id;
                      const phaseActiveEntry = getRunningComplexProjectPhaseEntry(phase);
                      const phaseTotalSeconds = getComplexProjectPhaseTotalSeconds(phase, timerTick);
                      const phaseTodaySeconds = getComplexProjectPhaseSecondsForDate(
                        phase,
                        selectedDate,
                        timerTick,
                      );
                      const phaseTodaySessionCount = phase.timeEntries.filter(
                        (entry) => entry.date === selectedDate,
                      ).length;

	                      return (
                        <motion.div
                          animate={
                            isPhaseFeedbackActive ? { scale: [1, 1.012, 1] } : { scale: 1 }
                          }
                          className={`rounded-[1.15rem] border px-3 py-2.5 transition ${
                            phase.completed
                              ? "border-emerald-100 bg-emerald-50/70"
                              : "border-amber-100 bg-white/85"
                          } ${
                            isPhaseFeedbackActive
                              ? "shadow-sm shadow-emerald-100 ring-2 ring-emerald-200"
                              : ""
                          }`}
                          initial={false}
                          key={phase.id}
                          transition={{ duration: 0.45, ease: "easeOut" }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p
                                className={`break-words text-sm font-black ${
                                  phase.completed
                                    ? "text-emerald-800 line-through decoration-2"
                                    : "text-[#46394f]"
                                }`}
                              >
                                {phase.title}
                              </p>
                              <p className="mt-1 text-xs font-bold text-[#8b7b91]">
                                {formatDisplayDate(phase.startDate)} -{" "}
                                {formatDisplayDate(phase.endDate)}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${
                                phase.completed
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {phase.completed ? "已完成" : "未完成"}
                            </span>
                          </div>
                          <AnimatePresence>
                            {isPhaseFeedbackActive ? (
                              <motion.p
                                animate={{ opacity: 1, y: 0 }}
                                className="mt-1 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700"
                                exit={{ opacity: 0, y: -4 }}
                                initial={{ opacity: 0, y: 4 }}
                                key={projectFeedback?.id ?? phase.id}
                                transition={{ duration: 0.2, ease: "easeOut" }}
                              >
                                已推进到 {projectFeedback?.progressPercent ?? projectProgress.percent}%
                              </motion.p>
                            ) : null}
                          </AnimatePresence>
	                          {phase.note ? (
	                            <p className="mt-1 whitespace-pre-wrap break-words text-xs font-bold leading-5 text-[#74667d]">
	                              {phase.note}
	                            </p>
	                          ) : null}
                          <div className="mt-2 grid gap-2 rounded-[0.9rem] bg-white/70 p-2 sm:grid-cols-2">
                            <div>
                              <p className="text-[10px] font-black text-[#8b7b91]">阶段总用时</p>
                              <p className="mt-0.5 text-sm font-black text-[#46394f]">
                                {formatDashboardDuration(phaseTotalSeconds)}
                              </p>
                            </div>
	                            <div>
	                              <p className="text-[10px] font-black text-[#8b7b91]">今日用时</p>
                              <button
                                className="mt-0.5 rounded-full px-0 text-left text-sm font-black text-[#46394f] transition hover:text-amber-700 disabled:cursor-default disabled:hover:text-[#46394f]"
                                disabled={phaseTodaySessionCount === 0}
                                type="button"
                                onClick={() =>
                                  openComplexProjectPhaseTimeDetails(project.id, phase.id, selectedDate)
                                }
                              >
	                                {formatDashboardDuration(phaseTodaySeconds)}
	                                <span className="ml-1.5 text-xs text-[#8b7b91]">
	                                  {phaseTodaySessionCount} 段
	                                </span>
                              </button>
	                              {phaseActiveEntry ? (
                                <p className="mt-0.5 text-[10px] font-bold text-emerald-700">
                                  {formatClockTime(phaseActiveEntry.startedAt)} 开始计时
                                </p>
                              ) : null}
                            </div>
                          </div>
	                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <button
                              className={`rounded-full px-2.5 py-1 text-xs font-black text-white transition ${
                                phaseActiveEntry
                                  ? "bg-rose-500 hover:bg-rose-600"
                                  : "bg-emerald-500 hover:bg-emerald-600"
                              }`}
                              type="button"
                              onClick={() => toggleComplexProjectPhaseTimer(project.id, phase.id)}
                            >
                              {phaseActiveEntry ? "结束计时" : "开始计时"}
                            </button>
	                            <button
                              className={`rounded-full px-2.5 py-1 text-xs font-black transition ${
                                phase.completed
                                  ? "bg-white text-emerald-700 hover:bg-emerald-100"
                                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              }`}
                              type="button"
                              onClick={() => toggleComplexProjectPhaseCompleted(project.id, phase.id)}
                            >
                              {phase.completed ? "取消完成" : "完成"}
                            </button>
                            <button
                              className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[#6f5d78] transition hover:bg-amber-50"
                              type="button"
                              onClick={() => startComplexProjectPhaseEdit(project, phase)}
                            >
                              编辑
                            </button>
                            <button
                              className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-rose-600 transition hover:bg-rose-50"
                              type="button"
                              onClick={() => deleteComplexProjectPhase(project.id, phase.id)}
                            >
                              删除
                            </button>
                          </div>
                        </motion.div>
                      );
                    })
                  ) : (
                    <div className="rounded-[1.15rem] border border-dashed border-amber-200 bg-amber-50/45 px-4 py-4 text-center text-sm font-black text-[#8b7b91]">
                      暂无阶段，点击“+ 阶段”开始拆解项目
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[1.35rem] border border-dashed border-amber-200 bg-amber-50/45 px-4 py-8 text-center">
          <p className="text-base font-black text-[#6f5d78]">暂无复杂项目</p>
          <p className="mt-1 text-sm font-bold text-[#8b7b91]">复杂项目会在这里获得完整工作区。</p>
        </div>
      )}
    </section>
  );
  const timeStatsWorkspace = (
    <section className="p-4 sm:p-6">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-black text-violet-700">用时统计</p>
          <h2 className="mt-1 text-2xl font-black text-[#3f3349]">每日用时看板</h2>
          <p className="mt-1 text-sm font-bold text-[#8b7b91]">
            {plans.length > 0 ? `当前 ${plans.length} 项任务` : "暂无用时数据"}
          </p>
        </div>
        <span className="w-fit rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-700">
          {dailyTimeStats.activeTimerCount > 0
            ? `${dailyTimeStats.activeTimerCount} 项计时中`
            : "实时更新"}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {dailyTimeStatCards.map((card) => (
          <div className={`rounded-[1.15rem] border px-4 py-3 ${card.className}`} key={card.label}>
            <p className="text-xs font-black opacity-75">{card.label}</p>
            <p className="mt-1 break-words text-2xl font-black leading-tight">{card.value}</p>
            <p className="mt-1 text-xs font-bold opacity-75">{card.detail}</p>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 rounded-[1.15rem] border border-violet-100 bg-violet-50 px-4 py-3 text-violet-700">
          <div>
            <p className="text-xs font-black opacity-75">实际 / 计划</p>
            <p className="mt-2 text-sm font-bold leading-tight opacity-75">按目标完成比例</p>
          </div>
          <div
            className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full"
            style={{
              background: `conic-gradient(#8b5cf6 ${dailyTimeStats.actualProgress * 3.6}deg, #eaf2ff 0deg)`,
            }}
          >
            <div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-white text-center shadow-sm">
              <span className="text-xl font-black text-[#4b3a59]">
                {dailyTimeStats.targetTotalMinutes > 0 ? `${dailyTimeStats.actualPercent}%` : "暂无"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="rounded-[1.35rem] border border-white/80 bg-white/70 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-base font-black text-[#5a4b63]">按分类统计</p>
            <span className="text-xs font-black text-[#8b7b91]">
              {categoryVisualizationItems.length > 0
                ? `${categoryVisualizationItems.length} 组`
                : "暂无用时数据"}
            </span>
          </div>
          {categoryVisualizationItems.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {categoryVisualizationItems.map((item) => (
                <div
                  className="rounded-[1rem] border p-3"
                  key={item.label}
                  style={{
                    background: `linear-gradient(180deg, ${item.color}16 0%, #ffffff 100%)`,
                    borderColor: `${item.color}55`,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex min-w-0 items-center gap-1.5 text-sm font-black text-[#5a4b63]">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="truncate">{item.label}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-xs font-black text-[#8b7b91]">
                      {item.count} 项
                    </span>
                  </div>
                  <div className="mt-3 flex h-28 items-end justify-center gap-5 rounded-[0.9rem] bg-white/70 px-2 py-2">
                    {[
                      { label: "计划", value: item.targetSeconds, height: item.targetHeight, color: "#38bdf8" },
                      { label: "实际", value: item.actualSeconds, height: item.actualHeight, color: item.color },
                    ].map((bar) => (
                      <div className="flex min-w-0 flex-col items-center gap-1" key={bar.label}>
                        <span className="whitespace-nowrap text-center text-xs font-black leading-tight text-[#786981]">
                          {formatDashboardDuration(bar.value)}
                        </span>
                        <div className="flex h-20 w-8 items-end rounded-full bg-white p-0.5 shadow-inner">
                          <div className="w-full rounded-full" style={{ backgroundColor: bar.color, height: `${bar.height}%` }} />
                        </div>
                        <span className="text-xs font-black text-[#8b7b91]">{bar.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[1rem] border border-dashed border-slate-100 bg-slate-50/70 px-3 py-4 text-center text-xs font-black text-[#8b7b91]">
              暂无用时数据
            </div>
          )}
        </div>

        <div className="rounded-[1.35rem] border border-white/80 bg-white/70 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-base font-black text-[#5a4b63]">任务计划 / 实际</p>
            <span className="text-xs font-black text-[#8b7b91]">
              {taskTimeChartItems.length > 0
                ? `${taskTimeChartItems.length} 项有用时数据`
                : "暂无用时数据"}
            </span>
          </div>
          {taskTimeChartItems.length > 0 ? (
            <div className="overflow-x-auto">
              <div className="flex min-w-max items-stretch gap-3 rounded-[1rem] bg-[#faf7fb] px-3 pb-3 pt-3">
                {taskTimeChartItems.map((item) => (
                  <div
                    className="flex w-32 shrink-0 flex-col items-center rounded-[1rem] border border-violet-100 bg-white/80 px-2 py-2 shadow-sm shadow-violet-100/60"
                    key={item.id}
                  >
                    <div className="flex h-36 items-end justify-center gap-2">
                      {[
                        { colorClass: "bg-sky-300", label: "计划", value: item.targetSeconds },
                        { colorClass: "bg-violet-400", label: "实际", value: item.actualSeconds },
                      ].map((bar) => (
                        <div className="flex h-full w-12 flex-col items-center justify-end gap-1" key={bar.label}>
                          <span className="whitespace-nowrap text-center text-xs font-black leading-tight text-[#786981]">
                            {formatDashboardDuration(bar.value)}
                          </span>
                          <div className="flex h-24 w-8 items-end rounded-full bg-white p-0.5 shadow-inner">
                            <div
                              className={`w-full rounded-full ${bar.colorClass}`}
                              style={{
                                height:
                                  bar.value > 0
                                    ? `${Math.max(6, Math.min(100, (bar.value / taskTimeChartMaxSeconds) * 100))}%`
                                    : "0%",
                              }}
                            />
                          </div>
                          <span className="text-xs font-black text-[#8b7b91]">{bar.label}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 w-full truncate text-center text-sm font-black text-[#5a4b63]">
                      {item.title}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-[1rem] border border-dashed border-slate-100 bg-slate-50/70 px-3 py-4 text-center text-xs font-black text-[#8b7b91]">
              暂无用时数据
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-[1.35rem] border border-amber-100 bg-amber-50/60 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-base font-black text-[#5a4b63]">复杂项目用时分布</p>
          <span className="text-xs font-black text-[#8b7b91]">
            {complexProjectTimeItems.length > 0
              ? `${complexProjectTimeItems.length} 个项目`
              : "暂无项目计时"}
          </span>
        </div>
        {complexProjectTimeItems.length > 0 ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {complexProjectTimeItems.map((projectItem) => (
              <div
                className="rounded-[1.1rem] border border-white/80 bg-white/85 p-3 shadow-sm shadow-amber-100/50"
                key={projectItem.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[#46394f]">
                      {projectItem.title}
                    </p>
                    <p className="mt-1 text-xs font-bold text-[#8b7b91]">
                      今天 {formatDashboardDuration(projectItem.todaySeconds)} ·{" "}
                      {projectItem.todaySessionCount} 段
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-800">
                    总计 {formatDashboardDuration(projectItem.totalSeconds)}
                  </span>
                </div>
                <div className="mt-3 space-y-2.5">
                  {projectItem.phases.length > 0 ? (
                    projectItem.phases.map((phase) => {
                      const hasTodayTime = phase.todaySessionCount > 0;

                      return (
                        <div
                          className={`rounded-[0.9rem] border px-3 py-2 transition ${
                            phase.isRunning || hasTodayTime
                              ? "border-sky-200 bg-sky-50/70 shadow-sm shadow-sky-100/60"
                              : "border-amber-100 bg-white/80"
                          }`}
                          key={phase.id}
                        >
                          <div className="flex items-center justify-between gap-2 text-xs font-black text-[#6f5d78]">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span
                                aria-hidden="true"
                                className={`h-2 w-2 shrink-0 rounded-full ${
                                  phase.isRunning || hasTodayTime ? "bg-sky-400" : "bg-amber-200"
                                }`}
                              />
                              <span className="truncate">{phase.title}</span>
                            </span>
                            <span className="shrink-0 tabular-nums">
                              {formatDashboardDuration(phase.totalSeconds)}
                            </span>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white shadow-inner">
                            <div
                              className="h-full rounded-full bg-[linear-gradient(90deg,#f59e0b,#38bdf8)]"
                              style={{ width: `${phase.widthPercent}%` }}
                            />
                          </div>
                          {hasTodayTime ? (
                            <p className="mt-1.5 inline-flex rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-black text-sky-700 shadow-sm">
                              今日 {formatDashboardDuration(phase.todaySeconds)} ·{" "}
                              {phase.todaySessionCount} 段
                            </p>
                          ) : null}
                        </div>
                      );
                    })
                  ) : (
                    <p className="rounded-[0.9rem] bg-amber-50 px-3 py-2 text-xs font-black text-[#8b7b91]">
                      暂无阶段用时
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[1rem] border border-dashed border-amber-200 bg-white/70 px-3 py-4 text-center text-xs font-black text-[#8b7b91]">
            在长期项目阶段中开始计时后，这里会显示项目和阶段用时分布
          </div>
        )}
      </div>
    </section>
  );
  const exportWorkspace = (
    <section className="p-4 sm:p-6">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-black text-sky-700">导出/复盘</p>
          <h2 className="mt-1 text-2xl font-black text-[#3f3349]">今日手帐导出</h2>
          <p className="mt-1 text-sm font-bold text-[#8b7b91]">
            当前日期 {formatDisplayDateWithYear(selectedDate)}，已完成 {completedCount} / {plans.length} 项
          </p>
        </div>
        <span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-black text-[#7a6b84]">
          {selectedExportTemplate.audience} · {selectedExportTemplate.name}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(260px,360px)_1fr]">
        <div className="rounded-[1.35rem] border border-sky-100 bg-sky-50/70 p-4">
          <label
            className="flex min-w-0 flex-col gap-1 text-xs font-black text-[#6f5d78]"
            htmlFor="workspace-export-template"
          >
            导出模板
            <select
              className="max-w-full rounded-2xl border border-pink-100 bg-white px-3 py-2 text-sm font-bold text-[#46394f] outline-none transition focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
              id="workspace-export-template"
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

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="rounded-2xl border border-sky-200 bg-white px-4 py-2 text-sm font-bold text-sky-700 transition hover:bg-sky-100 disabled:opacity-50"
              disabled={isExporting}
              type="button"
              onClick={handleExportPng}
            >
              {isExporting ? "导出中" : "导出 PNG"}
            </button>
            <button
              className="rounded-2xl border border-violet-200 bg-white px-4 py-2 text-sm font-bold text-violet-700 transition hover:bg-violet-100 disabled:opacity-50"
              disabled={isExporting}
              type="button"
              onClick={handleExportPdf}
            >
              {isExporting ? "导出中" : "导出 PDF"}
            </button>
          </div>
        </div>

        <div className="rounded-[1.35rem] border border-white/80 bg-[#fffaf4] p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-black text-[#5a4b63]">导出概览</p>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#8b7b91]">
              {progress}%
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[1rem] bg-white/80 px-3 py-2">
              <p className="text-xs font-black text-[#8b7b91]">任务数</p>
              <p className="mt-1 text-xl font-black text-[#46394f]">{plans.length}</p>
            </div>
            <div className="rounded-[1rem] bg-white/80 px-3 py-2">
              <p className="text-xs font-black text-[#8b7b91]">完成</p>
              <p className="mt-1 text-xl font-black text-emerald-700">{completedCount}</p>
            </div>
            <div className="rounded-[1rem] bg-white/80 px-3 py-2">
              <p className="text-xs font-black text-[#8b7b91]">计划用时</p>
              <p className="mt-1 text-xl font-black text-sky-700">
                {formatDashboardMinutes(dailyTimeStats.targetTotalMinutes)}
              </p>
            </div>
          </div>
          <p className="mt-3 space-y-2 text-sm font-bold leading-7 text-[#7b6c84]">
            <span className="block">PNG/PDF 会按当前选择的模板生成一张完整的今日计划手帐。</span>
            <span className="block">
              复杂项目甘特图的 PNG/PDF/PPT/Xmind 导出位于“复杂项目”工作区。
            </span>
          </p>
        </div>
      </div>
    </section>
  );

  if (isAuthChecking && !isPreviewMode) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fff8ef] bg-[linear-gradient(180deg,#fff8ef_0%,#f6f1ff_48%,#edf8ff_100%)] px-4 py-8 text-[#46394f]">
        <section className="w-full max-w-sm rounded-[2rem] border border-white/80 bg-white/90 p-6 text-center shadow-2xl shadow-violet-100/70">
          <p className="text-sm font-semibold text-pink-500">Daily Planner Journal</p>
          <h1 className="mt-1 text-3xl font-black tracking-normal text-[#382b44]">
            今日计划手帐
          </h1>
          <p className="mt-4 text-sm font-black text-[#7b6c84]">正在检查登录状态...</p>
        </section>
      </main>
    );
  }

  if (!isSignedIn && !isPreviewMode) {
    return standaloneAuthPage;
  }

  return (
    <main className="min-h-screen bg-[#fff8ef] bg-[linear-gradient(180deg,#fff8ef_0%,#f6f1ff_48%,#edf8ff_100%)] px-4 py-4 text-[#46394f] sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-0">
        <div className="rounded-[2rem] border border-white/80 bg-white/80 shadow-sticker backdrop-blur">
        <header className="relative z-[1000] flex flex-col gap-3 overflow-visible rounded-t-[2rem] bg-transparent p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="mb-1 text-sm font-semibold text-pink-500">Daily Planner Journal</p>
            <h1 className="text-3xl font-black tracking-normal text-[#382b44] sm:text-4xl">
              今日计划手帐
            </h1>
          </div>

          <div className="relative z-[1001] w-full md:max-w-md md:flex-1">
            <label className="mb-2 block text-sm font-bold text-[#6f5d78]" htmlFor="plan-search">
              历史检索
            </label>
            <input
              className="w-full rounded-2xl border border-sky-100 bg-white/90 px-4 py-2.5 text-sm font-bold text-[#46394f] shadow-sm outline-none transition placeholder:text-[#b8aabd] focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
              id="plan-search"
              placeholder="搜索任务标题、备注、分类"
              type="search"
              value={planSearchQuery}
              onChange={(event) => {
                const nextQuery = event.target.value;
                setPlanSearchQuery(nextQuery);
                setIsPlanSearchOpen(Boolean(nextQuery.trim()));
              }}
              onFocus={() => {
                if (planSearchQuery.trim()) {
                  setIsPlanSearchOpen(true);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setIsPlanSearchOpen(false);
                }
              }}
            />
            {planSearchQuery.trim() && isPlanSearchOpen ? (
              <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[9999] max-h-[360px] overflow-y-auto rounded-[1.35rem] border border-sky-100 bg-white/95 p-2 shadow-2xl shadow-sky-200/70 backdrop-blur">
                {planSearchResults.length > 0 ? (
                  <div className="space-y-2">
                    {planSearchResults.map((result) => {
                      const noteSummary = getPlanSearchSummary(result.item.note);

                      return (
                        <button
                          className="w-full rounded-2xl bg-[#f7fbff] px-3 py-2.5 text-left transition hover:bg-sky-50 focus:outline-none focus:ring-4 focus:ring-sky-100"
                          key={result.key}
                          type="button"
                          onClick={() => jumpToPlanSearchResult(result)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="min-w-0 break-words text-sm font-black text-[#3f3349]">
                              {result.item.title || "未命名计划"}
                            </span>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${
                                result.item.completed
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-pink-50 text-pink-600"
                              }`}
                            >
                              {result.item.completed ? "已完成" : "未完成"}
                            </span>
                          </div>
                          <p className="mt-1 text-xs font-bold text-[#7b6c84]">
                            {result.date} · {formatPlanSearchDate(result.date)} ·{" "}
                            {result.item.category || "未分类"}
                          </p>
                          {noteSummary ? (
                            <p className="mt-1 break-words text-xs text-[#8b7b91]">
                              {noteSummary}
                            </p>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl bg-sky-50/70 px-4 py-3 text-sm font-black text-[#6f5d78]">
                    没有找到相关计划
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 sm:min-w-72 md:min-w-[30rem] lg:min-w-[32rem]">
            <ChinaHolidayDatePicker
              calendarMonthDate={calendarMonthDate}
              holidayMap={chinaHolidayMap}
              selectedDate={selectedDate}
              summaryAside={
                <div className="grid min-w-0 gap-2 sm:w-[18.5rem] sm:grid-cols-2">
                  <WeatherWidget
                    weatherState={weatherState}
                    onRefresh={() => refreshWeather({ force: true })}
                  />
                  <MoodWidget
                    entryCount={selectedMoodEntries.length}
                    latestEntry={latestMoodEntry}
                    onOpen={() => setIsMoodPanelOpen(true)}
                  />
                </div>
              }
              today={today}
              onCalendarMonthDateChange={setCalendarMonthDate}
              onSelectDate={selectPlannerDate}
            />
          </div>

	          <div className="relative z-[1002] flex w-full justify-end md:w-auto md:self-start">
	            <button
	              aria-label="个人中心"
	              className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-violet-100 bg-white/90 p-1.5 shadow-sm transition hover:bg-violet-50 focus:outline-none focus:ring-4 focus:ring-violet-100"
	              type="button"
	              title="个人中心"
	              onKeyDown={(event) => {
	                if (event.key === "Enter" || event.key === " ") {
	                  event.preventDefault();
	                  setIsAuthPanelOpen((current) => !current);
	                }
	              }}
	              onPointerDown={(event) => {
	                event.preventDefault();
	                setIsAuthPanelOpen((current) => !current);
	              }}
	            >
	              <img
	                alt=""
	                className="h-full w-full rounded-full object-cover"
	                src={selectedAvatar.src}
	              />
	            </button>
            <AnimatePresence>
              {isAuthPanelOpen ? (
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute right-0 top-[calc(100%+2px)] z-[10000]"
                  exit={{ opacity: 0, y: -4 }}
                  initial={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                >
                  {authPanel}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </header>

        {createPortal(
          <AnimatePresence>
            {isTaskFormOpen ? (
              <motion.div
                animate={{ opacity: 1 }}
                className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-[#2d2433]/45 px-4 py-5 backdrop-blur-sm"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                onClick={closeTaskForm}
              >
                <motion.div
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  className="w-full max-w-2xl"
                  exit={{ opacity: 0, scale: 0.98, y: 8 }}
                  initial={{ opacity: 0, scale: 0.98, y: 8 }}
                  transition={{ duration: 0.18 }}
                  onClick={(event) => event.stopPropagation()}
                >
                  <section className="max-h-[calc(100vh-2.5rem)] overflow-y-auto rounded-[1.5rem] border border-white/80 bg-white p-4 shadow-2xl shadow-pink-200/40 sm:p-5">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-pink-600">添加任务</p>
                        <h2 className="mt-1 text-xl font-black text-[#3f3349]">
                          {formatDisplayDateWithYear(selectedDate)}
                        </h2>
                      </div>
                      <button
                        className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-[#6d5d75] transition hover:bg-slate-200 focus:outline-none focus:ring-4 focus:ring-slate-100"
                        type="button"
                        onClick={closeTaskForm}
                      >
                        关闭
                      </button>
                    </div>
                    {taskFormPanel}
                  </section>
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>,
          document.body,
        )}

        {createPortal(
          <AnimatePresence>
            {isMoodPanelOpen ? (
              <motion.div
                animate={{ opacity: 1 }}
                className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-[#2d2433]/45 px-4 py-5 backdrop-blur-sm"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                onClick={() => setIsMoodPanelOpen(false)}
              >
                <motion.div
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  className="w-full max-w-5xl"
                  exit={{ opacity: 0, scale: 0.98, y: 8 }}
                  initial={{ opacity: 0, scale: 0.98, y: 8 }}
                  transition={{ duration: 0.18 }}
                  onClick={(event) => event.stopPropagation()}
                >
                  {moodPanel}
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>,
          document.body,
        )}

        {createPortal(
          <AnimatePresence>
            {taskTimeDetailTarget && taskTimeDetailItem ? (
              <motion.div
                animate={{ opacity: 1 }}
                className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-[#2d2433]/45 px-4 py-5 backdrop-blur-sm"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                onClick={() => setTaskTimeDetailTarget(null)}
              >
                <motion.div
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  className="w-full max-w-4xl"
                  exit={{ opacity: 0, scale: 0.98, y: 8 }}
                  initial={{ opacity: 0, scale: 0.98, y: 8 }}
                  transition={{ duration: 0.18 }}
                  onClick={(event) => event.stopPropagation()}
                >
                  <section className="max-h-[calc(100vh-2.5rem)] overflow-y-auto rounded-[1.5rem] border border-white/80 bg-white p-4 shadow-2xl shadow-sky-200/40 sm:p-5">
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-sky-700">任务计时明细</p>
                        <h2 className="mt-1 break-words text-xl font-black text-[#3f3349]">
                          {taskTimeDetailItem.title}
                        </h2>
                        <p className="mt-1 text-sm font-bold text-[#8b7b91]">
                          {taskTimeDetailTarget.date} · {taskTimeDetailEntries.length} 段 · 总计{" "}
                          {formatDashboardDuration(taskTimeDetailTotalSeconds)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={taskTimeDetailEntries.length === 0}
                          type="button"
                          onClick={exportTaskTimeDetailsExcel}
                        >
                          导出 Excel
                        </button>
                        <button
                          className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-[#6d5d75] transition hover:bg-slate-200"
                          type="button"
                          onClick={() => setTaskTimeDetailTarget(null)}
                        >
                          关闭
                        </button>
                      </div>
                    </div>

                    {taskTimeDetailEntries.length > 0 ? (
                      <div className="overflow-x-auto rounded-[1.15rem] border border-sky-100">
                        <table className="min-w-full border-collapse text-left text-sm">
                          <thead className="bg-sky-50 text-xs font-black text-sky-800">
                            <tr>
                              <th className="whitespace-nowrap px-3 py-2">序号</th>
                              <th className="whitespace-nowrap px-3 py-2">开始时间</th>
                              <th className="whitespace-nowrap px-3 py-2">结束时间</th>
                              <th className="whitespace-nowrap px-3 py-2">持续时间</th>
                              <th className="whitespace-nowrap px-3 py-2">状态</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-sky-50 bg-white">
                            {taskTimeDetailEntries.map((entry, index) => {
                              const isRunning = !entry.endedAt;
                              const durationSeconds = getTaskTimeEntrySeconds(entry, timerTick);

                              return (
                                <tr key={entry.id}>
                                  <td className="whitespace-nowrap px-3 py-2 font-black text-[#6f5d78]">
                                    {index + 1}
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-2 font-bold text-[#46394f]">
                                    {formatDateTime(entry.startedAt)}
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-2 font-bold text-[#46394f]">
                                    {entry.endedAt ? formatDateTime(entry.endedAt) : "进行中"}
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-2 font-black text-sky-800">
                                    {formatDashboardDuration(durationSeconds)}
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-2">
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-xs font-black ${
                                        isRunning
                                          ? "bg-emerald-50 text-emerald-700"
                                          : "bg-slate-100 text-slate-600"
                                      }`}
                                    >
                                      {isRunning ? "计时中" : "已结束"}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="rounded-[1.15rem] border border-dashed border-sky-200 bg-sky-50/60 px-4 py-8 text-center text-sm font-black text-[#8b7b91]">
                        当天还没有分段计时记录
                      </div>
                    )}
                  </section>
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>,
          document.body,
        )}

        {createPortal(
          <AnimatePresence>
            {phaseTimeDetailTarget && phaseTimeDetailProject && phaseTimeDetailPhase ? (
              <motion.div
                animate={{ opacity: 1 }}
                className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-[#2d2433]/45 px-4 py-5 backdrop-blur-sm"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                onClick={() => setPhaseTimeDetailTarget(null)}
              >
                <motion.div
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  className="w-full max-w-4xl"
                  exit={{ opacity: 0, scale: 0.98, y: 8 }}
                  initial={{ opacity: 0, scale: 0.98, y: 8 }}
                  transition={{ duration: 0.18 }}
                  onClick={(event) => event.stopPropagation()}
                >
                  <section className="max-h-[calc(100vh-2.5rem)] overflow-y-auto rounded-[1.5rem] border border-white/80 bg-white p-4 shadow-2xl shadow-amber-200/40 sm:p-5">
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-amber-700">阶段计时明细</p>
                        <h2 className="mt-1 break-words text-xl font-black text-[#3f3349]">
                          {phaseTimeDetailProject.title} · {phaseTimeDetailPhase.title}
                        </h2>
                        <p className="mt-1 text-sm font-bold text-[#8b7b91]">
                          {phaseTimeDetailTarget.date} · {phaseTimeDetailEntries.length} 段 · 总计{" "}
                          {formatDashboardDuration(phaseTimeDetailTotalSeconds)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={phaseTimeDetailEntries.length === 0}
                          type="button"
                          onClick={exportPhaseTimeDetailsExcel}
                        >
                          导出 Excel
                        </button>
                        <button
                          className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-[#6d5d75] transition hover:bg-slate-200"
                          type="button"
                          onClick={() => setPhaseTimeDetailTarget(null)}
                        >
                          关闭
                        </button>
                      </div>
                    </div>

                    {phaseTimeDetailEntries.length > 0 ? (
                      <div className="overflow-x-auto rounded-[1.15rem] border border-amber-100">
                        <table className="min-w-full border-collapse text-left text-sm">
                          <thead className="bg-amber-50 text-xs font-black text-amber-800">
                            <tr>
                              <th className="whitespace-nowrap px-3 py-2">序号</th>
                              <th className="whitespace-nowrap px-3 py-2">开始时间</th>
                              <th className="whitespace-nowrap px-3 py-2">结束时间</th>
                              <th className="whitespace-nowrap px-3 py-2">持续时间</th>
                              <th className="whitespace-nowrap px-3 py-2">状态</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-amber-50 bg-white">
                            {phaseTimeDetailEntries.map((entry, index) => {
                              const isRunning = !entry.endedAt;
                              const durationSeconds = getComplexProjectPhaseEntrySeconds(
                                entry,
                                timerTick,
                              );

                              return (
                                <tr key={entry.id}>
                                  <td className="whitespace-nowrap px-3 py-2 font-black text-[#6f5d78]">
                                    {index + 1}
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-2 font-bold text-[#46394f]">
                                    {formatDateTime(entry.startedAt)}
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-2 font-bold text-[#46394f]">
                                    {entry.endedAt ? formatDateTime(entry.endedAt) : "进行中"}
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-2 font-black text-amber-800">
                                    {formatDashboardDuration(durationSeconds)}
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-2">
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-xs font-black ${
                                        isRunning
                                          ? "bg-emerald-50 text-emerald-700"
                                          : "bg-slate-100 text-slate-600"
                                      }`}
                                    >
                                      {isRunning ? "计时中" : "已结束"}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="rounded-[1.15rem] border border-dashed border-amber-200 bg-amber-50/60 px-4 py-8 text-center text-sm font-black text-[#8b7b91]">
                        当天还没有分段计时记录
                      </div>
                    )}
                  </section>
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>,
          document.body,
        )}

        <section className="space-y-0">
          <nav className="px-4 py-2">
            <div className="overflow-x-auto">
              <div className="grid min-w-max grid-flow-col gap-2 lg:min-w-0 lg:grid-flow-row lg:grid-cols-4">
                {WORKSPACE_TABS.map((tab) => {
                  const isActiveTab = activeWorkspaceTab === tab.id;

                  return (
                    <button
                      className={`min-w-28 rounded-2xl border px-4 py-2 text-center text-sm font-black transition focus:outline-none focus:ring-4 focus:ring-white/70 lg:min-w-0 ${
                        isActiveTab
                          ? tab.toneClass
                          : "border-transparent bg-transparent text-[#6f5d78] hover:text-[#3f3349]"
                      }`}
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveWorkspaceTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </nav>

          <aside aria-hidden="true" className="hidden">
            <form className="space-y-2.5" onSubmit={handleSubmit}>
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
                <label className="text-xs font-black text-[#6f5d78] sm:w-16 sm:shrink-0" htmlFor="title">
                  标题
                </label>
                <input
                  className="min-w-0 flex-1 rounded-2xl border border-pink-100 bg-white px-3 py-2.5 outline-none transition placeholder:text-[#b8aabd] focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
                  id="title"
                  maxLength={48}
                  placeholder="写下今天要做的事"
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                />
              </div>

              <div>
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
                  <label
                    className="text-xs font-black text-[#6f5d78] sm:w-16 sm:shrink-0"
                    htmlFor="category"
                  >
                    分类
                  </label>
                  <select
                    className="min-w-0 flex-1 rounded-2xl border border-pink-100 bg-white px-3 py-2.5 outline-none transition focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
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
                </div>
                <div className="mt-2 rounded-[1.1rem] border border-dashed border-pink-100 bg-pink-50/50 p-2">
                  {isCustomCategoryOpen ? (
                    <div className="flex flex-col gap-2">
                      <label className="sr-only" htmlFor="custom-category">
                        自定义分类
                      </label>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          className="min-w-0 flex-1 rounded-2xl border border-pink-100 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-[#b8aabd] focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
                          id="custom-category"
                          maxLength={20}
                          placeholder="例如：阅读、旅行"
                          value={customCategoryInput}
                          onChange={(event) => {
                            setCustomCategoryInput(event.target.value);
                            setCustomCategoryStatus("");
                          }}
                        />
                        <div className="flex shrink-0 gap-2">
                          <button
                            className="rounded-2xl bg-white px-3 py-2 text-sm font-black text-pink-600 shadow-sm transition hover:bg-pink-100 disabled:opacity-50"
                            disabled={!customCategoryInput.trim()}
                            type="button"
                            onClick={handleAddCustomCategory}
                          >
                            添加
                          </button>
                          <button
                            className="rounded-2xl bg-white/70 px-3 py-2 text-sm font-bold text-[#7a6b84] transition hover:bg-white"
                            type="button"
                            onClick={() => {
                              setIsCustomCategoryOpen(false);
                              setCustomCategoryInput("");
                              setCustomCategoryStatus("");
                            }}
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="w-full rounded-2xl bg-white/70 px-3 py-2 text-left text-xs font-black text-pink-600 transition hover:bg-white"
                      type="button"
                      onClick={() => {
                        setIsCustomCategoryOpen(true);
                        setCustomCategoryStatus("");
                      }}
                    >
                      + 添加自定义分类
                    </button>
                  )}
                  {customCategoryStatus ? (
                    <p className="mt-2 text-xs font-bold text-[#8b7b91]">{customCategoryStatus}</p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
                <label
                  className="text-xs font-black text-[#6f5d78] sm:w-16 sm:shrink-0"
                  htmlFor="priority"
                >
                  优先级
                </label>
                <select
                  className="min-w-0 flex-1 rounded-2xl border border-pink-100 bg-white px-3 py-2.5 outline-none transition focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
                  id="priority"
                  value={form.priority}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      priority: normalizePriority(event.target.value),
                    }))
                  }
                >
                  {PRIORITY_OPTIONS.map((priorityOption) => (
                    <option key={priorityOption.id} value={priorityOption.id}>
                      {priorityOption.icon} {priorityOption.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
                <label
                  className="text-xs font-black text-[#6f5d78] sm:w-24 sm:shrink-0"
                  htmlFor="target-minutes"
                >
                  目标时长（分钟）
                </label>
                <input
                  className="min-w-0 flex-1 rounded-2xl border border-pink-100 bg-white px-3 py-2.5 outline-none transition placeholder:text-[#b8aabd] focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
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
                <label className="mb-1.5 block text-xs font-black text-[#6f5d78]" htmlFor="note">
                  备注
                </label>
                <textarea
                  className="min-h-20 w-full resize-none rounded-2xl border border-pink-100 bg-white px-3 py-2.5 outline-none transition placeholder:text-[#b8aabd] focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
                  id="note"
                  maxLength={160}
                  placeholder="可选"
                  value={form.note}
                  onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  className="rounded-2xl bg-[#ff8fbc] px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-pink-200 transition hover:-translate-y-0.5 hover:bg-[#ff79ad] disabled:opacity-50"
                  type="submit"
                  disabled={!form.title.trim()}
                >
                  {editingId ? "保存修改" : "添加计划"}
                </button>
                {editingId ? (
                  <button
                    className="rounded-2xl border border-[#ded2e8] bg-white px-5 py-2.5 text-sm font-bold text-[#6f5d78] transition hover:bg-[#f8f2ff]"
                    type="button"
                    onClick={resetForm}
                  >
                    取消
                  </button>
                ) : null}
              </div>
            </form>

            <section className="mt-4 rounded-[1.5rem] border border-amber-100 bg-amber-50/65 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-black text-[#5f5268]">复杂项目</p>
                  <p className="mt-0.5 text-xs font-bold text-[#8a7a94]">
                    {complexProjects.length > 0
                      ? `${complexProjects.length} 个项目`
                      : "暂无项目"}
                  </p>
                </div>
                <button
                  className="rounded-2xl bg-white px-3 py-2 text-xs font-black text-amber-700 shadow-sm transition hover:bg-amber-100 focus:outline-none focus:ring-4 focus:ring-amber-100"
                  type="button"
                  onClick={openNewComplexProjectForm}
                >
                  + 新建复杂项目
                </button>
              </div>

              {isComplexProjectFormOpen ? (
                <form className="mt-3 space-y-2.5 rounded-[1.2rem] bg-white/75 p-3" onSubmit={handleComplexProjectSubmit}>
                  <div className="flex flex-col gap-1.5">
                    <label
                      className="text-xs font-black text-[#6f5d78]"
                      htmlFor="complex-project-title"
                    >
                      项目标题
                    </label>
                    <input
                      className="min-w-0 rounded-2xl border border-amber-100 bg-white px-3 py-2 text-sm font-bold text-[#46394f] outline-none transition placeholder:text-[#b8aabd] focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
                      id="complex-project-title"
                      maxLength={64}
                      placeholder="例如：论文开题准备"
                      value={complexProjectForm.title}
                      onChange={(event) => {
                        setComplexProjectForm((current) => ({
                          ...current,
                          title: event.target.value,
                        }));
                        setComplexProjectFormError("");
                      }}
                    />
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <label
                      className="flex min-w-0 flex-col gap-1.5 text-xs font-black text-[#6f5d78]"
                      htmlFor="complex-project-category"
                    >
                      分类
                      <select
                        className="min-w-0 rounded-2xl border border-amber-100 bg-white px-3 py-2 text-sm font-bold text-[#46394f] outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
                        id="complex-project-category"
                        value={complexProjectForm.category}
                        onChange={(event) =>
                          setComplexProjectForm((current) => ({
                            ...current,
                            category: event.target.value,
                          }))
                        }
                      >
                        {complexProjectCategoryOptions.map((category) => (
                          <option key={category.id} value={category.name}>
                            {category.icon} {category.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label
                      className="flex min-w-0 flex-col gap-1.5 text-xs font-black text-[#6f5d78]"
                      htmlFor="complex-project-priority"
                    >
                      优先级
                      <select
                        className="min-w-0 rounded-2xl border border-amber-100 bg-white px-3 py-2 text-sm font-bold text-[#46394f] outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
                        id="complex-project-priority"
                        value={complexProjectForm.priority}
                        onChange={(event) =>
                          setComplexProjectForm((current) => ({
                            ...current,
                            priority: normalizePriority(event.target.value),
                          }))
                        }
                      >
                        {PRIORITY_OPTIONS.map((priorityOption) => (
                          <option key={priorityOption.id} value={priorityOption.id}>
                            {priorityOption.icon} {priorityOption.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <label
                      className="flex min-w-0 flex-col gap-1.5 text-xs font-black text-[#6f5d78]"
                      htmlFor="complex-project-start-date"
                    >
                      开始日期
                      <input
                        className="min-w-0 rounded-2xl border border-amber-100 bg-white px-3 py-2 text-sm font-bold text-[#46394f] outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
                        id="complex-project-start-date"
                        required
                        type="date"
                        value={complexProjectForm.startDate}
                        onChange={(event) => {
                          setComplexProjectForm((current) => ({
                            ...current,
                            startDate: event.target.value,
                          }));
                          setComplexProjectFormError("");
                        }}
                      />
                    </label>

                    <label
                      className="flex min-w-0 flex-col gap-1.5 text-xs font-black text-[#6f5d78]"
                      htmlFor="complex-project-end-date"
                    >
                      结束日期
                      <input
                        className="min-w-0 rounded-2xl border border-amber-100 bg-white px-3 py-2 text-sm font-bold text-[#46394f] outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
                        id="complex-project-end-date"
                        required
                        type="date"
                        value={complexProjectForm.endDate}
                        onChange={(event) => {
                          setComplexProjectForm((current) => ({
                            ...current,
                            endDate: event.target.value,
                          }));
                          setComplexProjectFormError("");
                        }}
                      />
                    </label>
                  </div>

                  <div>
                    <label
                      className="mb-1.5 block text-xs font-black text-[#6f5d78]"
                      htmlFor="complex-project-note"
                    >
                      备注
                    </label>
                    <textarea
                      className="min-h-20 w-full resize-none rounded-2xl border border-amber-100 bg-white px-3 py-2 text-sm font-bold text-[#46394f] outline-none transition placeholder:text-[#b8aabd] focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
                      id="complex-project-note"
                      maxLength={240}
                      placeholder="可选"
                      value={complexProjectForm.note}
                      onChange={(event) =>
                        setComplexProjectForm((current) => ({
                          ...current,
                          note: event.target.value,
                        }))
                      }
                    />
                  </div>

                  {complexProjectFormError ? (
                    <p className="rounded-2xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-600">
                      {complexProjectFormError}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <button
                      className="rounded-2xl bg-amber-500 px-4 py-2 text-sm font-black text-white shadow-sm shadow-amber-100 transition hover:bg-amber-600 disabled:opacity-50"
                      disabled={!complexProjectForm.title.trim()}
                      type="submit"
                    >
                      {editingComplexProjectId ? "保存项目" : "创建项目"}
                    </button>
                    <button
                      className="rounded-2xl bg-white px-4 py-2 text-sm font-bold text-[#6f5d78] transition hover:bg-amber-50"
                      type="button"
                      onClick={() => resetComplexProjectForm()}
                    >
                      取消
                    </button>
                  </div>
                </form>
              ) : null}

              {complexProjectPhaseMessage ? (
                <p className="mt-3 rounded-2xl bg-white/75 px-3 py-2 text-xs font-black text-emerald-700">
                  {complexProjectPhaseMessage}
                </p>
              ) : null}

              <div className="mt-3 space-y-2">
                {complexProjects.length > 0 ? (
                  complexProjects.map((project) => {
                    const style = getCategoryStyle(project.category, customCategories);
                    const priorityOption = getPriorityOption(project.priority);
                    const projectProgress = getComplexProjectProgress(project);
                    const sortedPhases = sortComplexProjectPhases(project.phases);
                    const isPhaseFormVisible = complexProjectPhaseEdit?.projectId === project.id;
                    const projectFeedback =
                      complexProjectFeedback?.projectId === project.id
                        ? complexProjectFeedback
                        : null;
                    const isGanttPreviewVisible = ganttPreviewProjectId === project.id;

                    return (
                      <div
                        className={`rounded-[1.15rem] border bg-white/75 px-3 py-2.5 transition ${
                          projectFeedback?.projectCompleted
                            ? "border-emerald-200 ring-2 ring-emerald-100"
                            : "border-white/80"
                        }`}
                        key={project.id}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="break-words text-sm font-black text-[#46394f]">
                              {project.title}
                            </p>
                            <p className="mt-1 text-xs font-bold text-[#8b7b91]">
                              {formatDisplayDate(project.startDate)} -{" "}
                              {formatDisplayDate(project.endDate)}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col gap-1.5">
                            <button
                              className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700 transition hover:bg-amber-100 focus:outline-none focus:ring-4 focus:ring-amber-100"
                              type="button"
                              onClick={() => openNewComplexProjectPhaseForm(project)}
                            >
                              + 阶段
                            </button>
                            <button
                              className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#6f5d78] transition hover:bg-amber-50 focus:outline-none focus:ring-4 focus:ring-amber-100"
                              type="button"
                              onClick={() => startComplexProjectEdit(project)}
                            >
                              编辑
                            </button>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-black">
                          <span className={`rounded-full px-2 py-0.5 ${style.bg} ${style.accent}`}>
                            {style.emoji} {project.category}
                          </span>
                          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-700">
                            {priorityOption.icon} {priorityOption.name}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 ${
                              project.status === "active"
                                ? "bg-emerald-50 text-emerald-700"
                                : project.status === "completed"
                                  ? "bg-sky-50 text-sky-700"
                                  : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {getComplexProjectStatusLabel(project.status)}
                          </span>
                        </div>
                        {project.status !== "archived" ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <button
                              className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700 transition hover:bg-emerald-100"
                              type="button"
                              onClick={() => toggleComplexProjectCompleted(project.id)}
                            >
                              {project.status === "completed" ? "恢复进行中" : "标记完成"}
                            </button>
                            <button
                              className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 transition hover:bg-slate-200"
                              type="button"
                              onClick={() => archiveComplexProject(project.id)}
                            >
                              归档
                            </button>
                          </div>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <button
                            className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800 transition hover:bg-amber-200"
                            type="button"
                            onClick={() =>
                              setGanttPreviewProjectId((current) =>
                                current === project.id ? null : project.id,
                              )
                            }
                          >
                            {isGanttPreviewVisible ? "收起甘特图" : "甘特图预览"}
                          </button>
                          <button
                            className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-sky-700 transition hover:bg-sky-50 disabled:opacity-50"
                            disabled={isGanttExporting}
                            type="button"
                            onClick={() => handleExportComplexProjectGanttPng(project.id)}
                          >
                            导出 PNG
                          </button>
                          <button
                            className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-violet-700 transition hover:bg-violet-50 disabled:opacity-50"
                            disabled={isGanttExporting}
                            type="button"
                            onClick={() => handleExportComplexProjectGanttPdf(project.id)}
                          >
                            导出 PDF
                          </button>
                          <button
                            className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-orange-700 transition hover:bg-orange-50 disabled:opacity-50"
                            disabled={isGanttExporting}
                            type="button"
                            onClick={() => handleExportComplexProjectGanttPptx(project.id)}
                          >
                            导出 PPT/PPTX
                          </button>
                          <button
                            className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-emerald-700 transition hover:bg-emerald-50"
                            type="button"
                            onClick={() => handleExportComplexProjectXmind(project.id)}
                          >
                            导出 Xmind
                          </button>
                        </div>
                        <div className="mt-3 rounded-[1rem] bg-amber-50/70 px-3 py-2">
                          <div className="flex items-center justify-between gap-2 text-xs font-black text-[#7b6c84]">
                            <span>
                              阶段进度 {projectProgress.completed} / {projectProgress.total}
                            </span>
                            <span>{projectProgress.percent}%</span>
                          </div>
                          <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-white">
                            <motion.div
                              animate={{ width: `${projectProgress.percent}%` }}
                              className="h-full rounded-full bg-[linear-gradient(90deg,#f59e0b,#34d399)]"
                              initial={false}
                              transition={{ duration: 0.42, ease: "easeOut" }}
                            />
                            <AnimatePresence>
                              {projectFeedback ? (
                                <motion.div
                                  aria-hidden="true"
                                  animate={{ opacity: 0, x: "100%" }}
                                  className="absolute inset-0 rounded-full bg-white/75"
                                  exit={{ opacity: 0 }}
                                  initial={{ opacity: 0.8, x: "-100%" }}
                                  key={projectFeedback.id}
                                  transition={{ duration: 0.72, ease: "easeOut" }}
                                />
                              ) : null}
                            </AnimatePresence>
                          </div>
                          <AnimatePresence>
                            {projectFeedback ? (
                              <motion.p
                                animate={{ opacity: 1, y: 0 }}
                                className="mt-1.5 rounded-full bg-white/80 px-2 py-1 text-xs font-black text-emerald-700"
                                exit={{ opacity: 0, y: -4 }}
                                initial={{ opacity: 0, y: 4 }}
                                key={projectFeedback.id}
                                transition={{ duration: 0.22, ease: "easeOut" }}
                              >
                                {projectFeedback.projectCompleted
                                  ? "项目阶段全部完成"
                                  : `阶段完成：${projectFeedback.phaseTitle}`}
                              </motion.p>
                            ) : null}
                          </AnimatePresence>
                          {projectProgress.total === 0 ? (
                            <p className="mt-1.5 text-xs font-bold text-[#8b7b91]">先添加阶段</p>
                          ) : null}
                        </div>

                        <AnimatePresence>
                          {isGanttPreviewVisible ? (
                            <motion.div
                              animate={{ opacity: 1, y: 0 }}
                              className="mt-3"
                              data-gantt-preview-project-id={project.id}
                              exit={{ opacity: 0, y: -6 }}
                              initial={{ opacity: 0, y: 6 }}
                              transition={{ duration: 0.2, ease: "easeOut" }}
                            >
                              <ComplexProjectGanttChart project={project} />
                            </motion.div>
                          ) : null}
                        </AnimatePresence>

                        {isPhaseFormVisible ? (
                          <form
                            className="mt-3 space-y-2 rounded-[1rem] border border-amber-100 bg-amber-50/70 p-2.5"
                            onSubmit={handleComplexProjectPhaseSubmit}
                          >
                            <div className="flex flex-col gap-1.5">
                              <label
                                className="text-xs font-black text-[#6f5d78]"
                                htmlFor={`complex-project-phase-title-${project.id}`}
                              >
                                阶段标题
                              </label>
                              <input
                                className="rounded-2xl border border-amber-100 bg-white px-3 py-2 text-sm font-bold text-[#46394f] outline-none transition placeholder:text-[#b8aabd] focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
                                id={`complex-project-phase-title-${project.id}`}
                                maxLength={64}
                                placeholder="例如：资料收集"
                                value={complexProjectPhaseForm.title}
                                onChange={(event) => {
                                  setComplexProjectPhaseForm((current) => ({
                                    ...current,
                                    title: event.target.value,
                                  }));
                                  setComplexProjectPhaseFormError("");
                                }}
                              />
                            </div>

                            <div className="grid gap-2 sm:grid-cols-2">
                              <label
                                className="flex min-w-0 flex-col gap-1.5 text-xs font-black text-[#6f5d78]"
                                htmlFor={`complex-project-phase-start-${project.id}`}
                              >
                                开始日期
                                <input
                                  className="min-w-0 rounded-2xl border border-amber-100 bg-white px-3 py-2 text-sm font-bold text-[#46394f] outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
                                  id={`complex-project-phase-start-${project.id}`}
                                  required
                                  type="date"
                                  value={complexProjectPhaseForm.startDate}
                                  onChange={(event) => {
                                    setComplexProjectPhaseForm((current) => ({
                                      ...current,
                                      startDate: event.target.value,
                                    }));
                                    setComplexProjectPhaseFormError("");
                                  }}
                                />
                              </label>

                              <label
                                className="flex min-w-0 flex-col gap-1.5 text-xs font-black text-[#6f5d78]"
                                htmlFor={`complex-project-phase-end-${project.id}`}
                              >
                                结束日期
                                <input
                                  className="min-w-0 rounded-2xl border border-amber-100 bg-white px-3 py-2 text-sm font-bold text-[#46394f] outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
                                  id={`complex-project-phase-end-${project.id}`}
                                  required
                                  type="date"
                                  value={complexProjectPhaseForm.endDate}
                                  onChange={(event) => {
                                    setComplexProjectPhaseForm((current) => ({
                                      ...current,
                                      endDate: event.target.value,
                                    }));
                                    setComplexProjectPhaseFormError("");
                                  }}
                                />
                              </label>
                            </div>

                            <p className="text-xs font-bold text-[#8b7b91]">
                              阶段日期超出项目周期时，保存后会自动扩展项目日期。
                            </p>

                            <div>
                              <label
                                className="mb-1.5 block text-xs font-black text-[#6f5d78]"
                                htmlFor={`complex-project-phase-note-${project.id}`}
                              >
                                阶段备注
                              </label>
                              <textarea
                                className="min-h-16 w-full resize-none rounded-2xl border border-amber-100 bg-white px-3 py-2 text-sm font-bold text-[#46394f] outline-none transition placeholder:text-[#b8aabd] focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
                                id={`complex-project-phase-note-${project.id}`}
                                maxLength={240}
                                placeholder="可选"
                                value={complexProjectPhaseForm.note}
                                onChange={(event) =>
                                  setComplexProjectPhaseForm((current) => ({
                                    ...current,
                                    note: event.target.value,
                                  }))
                                }
                              />
                            </div>

                            <label
                              className="flex items-center gap-2 rounded-2xl bg-white/75 px-3 py-2 text-xs font-black text-[#6f5d78]"
                              htmlFor={`complex-project-phase-completed-${project.id}`}
                            >
                              <input
                                checked={complexProjectPhaseForm.completed}
                                className="h-4 w-4 accent-amber-500"
                                id={`complex-project-phase-completed-${project.id}`}
                                type="checkbox"
                                onChange={(event) =>
                                  setComplexProjectPhaseForm((current) => ({
                                    ...current,
                                    completed: event.target.checked,
                                  }))
                                }
                              />
                              已完成
                            </label>

                            {complexProjectPhaseFormError ? (
                              <p className="rounded-2xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-600">
                                {complexProjectPhaseFormError}
                              </p>
                            ) : null}

                            <div className="flex flex-wrap gap-2">
                              <button
                                className="rounded-2xl bg-amber-500 px-4 py-2 text-xs font-black text-white transition hover:bg-amber-600 disabled:opacity-50"
                                disabled={!complexProjectPhaseForm.title.trim()}
                                type="submit"
                              >
                                {complexProjectPhaseEdit?.phaseId ? "保存阶段" : "添加阶段"}
                              </button>
                              <button
                                className="rounded-2xl bg-white px-4 py-2 text-xs font-bold text-[#6f5d78] transition hover:bg-amber-50"
                                type="button"
                                onClick={() => resetComplexProjectPhaseForm(project)}
                              >
                                取消
                              </button>
                            </div>
                          </form>
                        ) : null}

                        <div className="mt-3 space-y-2">
                          {sortedPhases.length > 0 ? (
                            sortedPhases.map((phase) => {
                              const isPhaseFeedbackActive =
                                projectFeedback?.phaseId === phase.id;

                              return (
                                <motion.div
                                  animate={
                                    isPhaseFeedbackActive
                                      ? { scale: [1, 1.012, 1] }
                                      : { scale: 1 }
                                  }
                                  className={`rounded-[1rem] border px-3 py-2 transition ${
                                    phase.completed
                                      ? "border-emerald-100 bg-emerald-50/70"
                                      : "border-amber-100 bg-white/85"
                                  } ${
                                    isPhaseFeedbackActive
                                      ? "shadow-sm shadow-emerald-100 ring-2 ring-emerald-200"
                                      : ""
                                  }`}
                                  initial={false}
                                  key={phase.id}
                                  transition={{ duration: 0.45, ease: "easeOut" }}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p
                                        className={`break-words text-xs font-black ${
                                          phase.completed
                                            ? "text-emerald-800 line-through decoration-2"
                                            : "text-[#46394f]"
                                        }`}
                                      >
                                        {phase.title}
                                      </p>
                                      <p className="mt-1 text-xs font-bold text-[#8b7b91]">
                                        {formatDisplayDate(phase.startDate)} -{" "}
                                        {formatDisplayDate(phase.endDate)}
                                      </p>
                                    </div>
                                    <span
                                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${
                                        phase.completed
                                          ? "bg-emerald-100 text-emerald-700"
                                          : "bg-amber-100 text-amber-800"
                                      }`}
                                    >
                                      {phase.completed ? "已完成" : "未完成"}
                                    </span>
                                  </div>
                                  <AnimatePresence>
                                    {isPhaseFeedbackActive ? (
                                      <motion.p
                                        animate={{ opacity: 1, y: 0 }}
                                        className="mt-1 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700"
                                        exit={{ opacity: 0, y: -4 }}
                                        initial={{ opacity: 0, y: 4 }}
                                        key={projectFeedback?.id ?? phase.id}
                                        transition={{ duration: 0.2, ease: "easeOut" }}
                                      >
                                        已推进到 {projectFeedback?.progressPercent ?? projectProgress.percent}%
                                      </motion.p>
                                    ) : null}
                                  </AnimatePresence>
                                  {phase.note ? (
                                    <p className="mt-1 whitespace-pre-wrap break-words text-xs font-bold leading-5 text-[#74667d]">
                                      {phase.note}
                                    </p>
                                  ) : null}
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    <button
                                      className={`rounded-full px-2.5 py-1 text-xs font-black transition ${
                                        phase.completed
                                          ? "bg-white text-emerald-700 hover:bg-emerald-100"
                                          : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                      }`}
                                      type="button"
                                      onClick={() =>
                                        toggleComplexProjectPhaseCompleted(project.id, phase.id)
                                      }
                                    >
                                      {phase.completed ? "取消完成" : "完成"}
                                    </button>
                                    <button
                                      className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[#6f5d78] transition hover:bg-amber-50"
                                      type="button"
                                      onClick={() => startComplexProjectPhaseEdit(project, phase)}
                                    >
                                      编辑
                                    </button>
                                    <button
                                      className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-rose-600 transition hover:bg-rose-50"
                                      type="button"
                                      onClick={() => deleteComplexProjectPhase(project.id, phase.id)}
                                    >
                                      删除
                                    </button>
                                  </div>
                                </motion.div>
                              );
                            })
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-[1.15rem] border border-dashed border-amber-200 bg-white/60 px-3 py-3 text-center text-xs font-black text-[#8b7b91]">
                    暂无复杂项目
                  </div>
                )}
              </div>
            </section>
          </aside>

          <section
            className={`p-2 sm:p-3 ${
              activeWorkspaceTab === "tasks" ? "" : "hidden"
            }`}
          >
            <div
              className="rounded-[1.5rem] border-2 border-dashed border-[#e8d9ed] bg-[#fffaf4] p-3 shadow-inner sm:p-4"
              ref={journalRef}
              style={{
                backgroundImage:
                  "repeating-linear-gradient(0deg, rgba(222, 210, 232, 0.18) 0, rgba(222, 210, 232, 0.18) 1px, transparent 1px, transparent 34px)",
              }}
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-[1.1rem] border border-pink-100 bg-white/85 px-3 py-2 shadow-sm shadow-pink-100/40">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 lg:flex-nowrap">
                  <p className="shrink-0 text-base font-black text-pink-600">今日任务工作区</p>
                  <h2 className="shrink-0 text-sm font-black text-sky-700">任务清单与完成进度</h2>
                </div>
                <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto">
                  <button
                    className="rounded-full bg-[#ff8fbc] px-3 py-1.5 text-xs font-black text-white shadow-sm shadow-pink-100 transition hover:bg-[#ff79ad] focus:outline-none focus:ring-4 focus:ring-pink-100"
                    data-export-ignore="true"
                    type="button"
                    onClick={openTaskForm}
                  >
                    + 添加今日计划
                  </button>
                  <div className="min-w-44 rounded-full border border-pink-100 bg-pink-50/50 px-3 py-1.5">
                    <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-black text-[#786981]">
                      <span className="whitespace-nowrap">
                        已完成 {completedCount} / {plans.length} 项
                      </span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,#f7a8c7,#a9d6ff,#b9e5c8)]"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {dailyComplexProjects.length > 0 ? (
                <section className="mb-3 rounded-[1.2rem] border border-amber-200 bg-[linear-gradient(135deg,#fff7ed_0%,#ecfdf5_100%)] p-2.5 shadow-sm shadow-amber-100/70">
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <p className="text-xs font-black text-amber-700">长期项目</p>
                      <p className="text-xs font-bold text-[#7b6c84]">
                        当前日期相关项目 {dailyComplexProjects.length} 个
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-black text-emerald-700">
                        跨日期显示
                      </span>
                      <button
                        aria-expanded={!isDailyComplexProjectsCollapsed}
                        className="rounded-full bg-white px-3 py-1 text-xs font-black text-amber-700 shadow-sm transition hover:bg-amber-50 focus:outline-none focus:ring-4 focus:ring-amber-100"
                        data-export-ignore="true"
                        type="button"
                        onClick={() => toggleTodayWorkspaceSection("longProjects")}
                      >
                        {isDailyComplexProjectsCollapsed ? "展开" : "收起"}
                      </button>
                    </div>
                  </div>
                  {isDailyComplexProjectsCollapsed ? (
                    <div className="rounded-[1rem] border border-white/80 bg-white/75 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {dailyComplexProjects.slice(0, 3).map((project) => {
                          const currentPhase = getCurrentComplexProjectPhase(project, selectedDate);
                          const projectProgress = getComplexProjectProgress(project);

                          return (
                            <span
                              className="max-w-full truncate rounded-full bg-amber-50 px-2.5 py-1 text-xs font-black text-[#6f5d78]"
                              key={project.id}
                              title={project.title}
                            >
                              {project.title}
                              {currentPhase ? ` · ${currentPhase.title}` : ""}
                              {projectProgress.total > 0 ? ` · ${projectProgress.percent}%` : ""}
                            </span>
                          );
                        })}
                        {dailyComplexProjects.length > 3 ? (
                          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-amber-700">
                            +{dailyComplexProjects.length - 3} 个
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                  <div className="grid gap-3 xl:grid-cols-2">
                    {dailyComplexProjects.map((project) => {
                      const style = getCategoryStyle(project.category, customCategories);
                      const priorityOption = getPriorityOption(project.priority);
                      const projectProgress = getComplexProjectProgress(project);
                      const currentPhase = getCurrentComplexProjectPhase(project, selectedDate);
                      const currentPhaseActiveEntry = currentPhase
                        ? getRunningComplexProjectPhaseEntry(currentPhase)
                        : null;
                      const currentPhaseTodaySeconds = currentPhase
                        ? getComplexProjectPhaseSecondsForDate(currentPhase, selectedDate, timerTick)
                        : 0;
                      const currentPhaseTodaySessionCount = currentPhase
                        ? currentPhase.timeEntries.filter((entry) => entry.date === selectedDate).length
                        : 0;
                      const projectTodaySeconds = getComplexProjectSecondsForDate(
                        project,
                        selectedDate,
                        timerTick,
                      );
                      const projectTodaySessionCount = getComplexProjectSessionCountForDate(
                        project,
                        selectedDate,
                      );
                      const projectFeedback =
                        complexProjectFeedback?.projectId === project.id
                          ? complexProjectFeedback
                          : null;
                      const isCurrentPhaseFeedbackActive =
                        Boolean(currentPhase) && projectFeedback?.phaseId === currentPhase?.id;

                      return (
                        <article
                          className={`rounded-[1.2rem] border bg-white/90 p-3 shadow-sm shadow-amber-100 transition ${
                            projectFeedback?.projectCompleted
                              ? "border-emerald-200 ring-2 ring-emerald-100"
                              : "border-amber-100"
                          }`}
                          key={project.id}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="mb-2 flex flex-wrap gap-1.5 text-xs font-black">
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                                  长期项目
                                </span>
                                <span className={`rounded-full px-2 py-0.5 ${style.bg} ${style.accent}`}>
                                  {style.emoji} {project.category}
                                </span>
                                <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-700">
                                  {priorityOption.icon} {priorityOption.name}
                                </span>
                              </div>
                              <h4 className="break-words text-base font-black text-[#3f3349]">
                                {project.title}
                              </h4>
                              <p className="mt-1 text-xs font-bold text-[#8b7b91]">
                                {formatDisplayDate(project.startDate)} -{" "}
                                {formatDisplayDate(project.endDate)}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${
                                project.status === "completed"
                                  ? "bg-sky-50 text-sky-700"
                                  : "bg-emerald-50 text-emerald-700"
                              }`}
                            >
                              {getComplexProjectStatusLabel(project.status)}
                            </span>
                          </div>

                          <div className="mt-3 rounded-[1rem] border border-white/80 bg-amber-50/70 px-3 py-2">
                            <p className="text-xs font-black text-[#6f5d78]">当前阶段</p>
                            {currentPhase ? (
                              <motion.div
                                animate={
                                  isCurrentPhaseFeedbackActive
                                    ? { backgroundColor: "rgba(209, 250, 229, 0.92)" }
                                    : { backgroundColor: "rgba(255, 255, 255, 0)" }
                                }
                                className={`mt-1 rounded-[0.85rem] px-2 py-1 ${
                                  isCurrentPhaseFeedbackActive
                                    ? "ring-2 ring-emerald-200"
                                    : ""
                                }`}
                                initial={false}
                                transition={{ duration: 0.35, ease: "easeOut" }}
                              >
                                <p className="break-words text-sm font-black text-[#46394f]">
                                  {currentPhase.title}
                                </p>
	                                <p className="mt-0.5 text-xs font-bold text-[#8b7b91]">
	                                  {formatDisplayDate(currentPhase.startDate)} -{" "}
	                                  {formatDisplayDate(currentPhase.endDate)}
	                                  {currentPhase.completed ? " · 已完成" : ""}
	                                </p>
                                  <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                                    <div className="rounded-[0.8rem] bg-white/75 px-2.5 py-2">
	                                      <p className="text-[10px] font-black text-[#8b7b91]">
	                                        今日阶段用时
	                                      </p>
                                      <button
                                        className="mt-0.5 rounded-full px-0 text-left text-sm font-black text-[#46394f] transition hover:text-amber-700 disabled:cursor-default disabled:hover:text-[#46394f]"
                                        disabled={currentPhaseTodaySessionCount === 0}
                                        type="button"
                                        onClick={() =>
                                          openComplexProjectPhaseTimeDetails(
                                            project.id,
                                            currentPhase.id,
                                            selectedDate,
                                          )
                                        }
                                      >
	                                        {formatDashboardDuration(currentPhaseTodaySeconds)}
	                                        <span className="ml-2 text-xs text-[#8b7b91]">
	                                          {currentPhaseTodaySessionCount} 段
	                                        </span>
                                      </button>
                                      {currentPhaseActiveEntry ? (
                                        <p className="mt-0.5 text-[10px] font-bold text-emerald-700">
                                          {formatClockTime(currentPhaseActiveEntry.startedAt)} 开始
                                        </p>
                                      ) : null}
                                    </div>
                                    <button
                                      className={`rounded-full px-3 py-2 text-xs font-black text-white shadow-sm transition focus:outline-none focus:ring-4 ${
                                        currentPhaseActiveEntry
                                          ? "bg-rose-500 hover:bg-rose-600 focus:ring-rose-100"
                                          : "bg-emerald-500 hover:bg-emerald-600 focus:ring-emerald-100"
                                      }`}
                                      type="button"
                                      onClick={() =>
                                        toggleComplexProjectPhaseTimer(project.id, currentPhase.id)
                                      }
                                    >
                                      {currentPhaseActiveEntry ? "结束计时" : "开始计时"}
                                    </button>
                                  </div>
	                              </motion.div>
	                            ) : (
	                              <p className="mt-1 text-xs font-bold text-[#8b7b91]">
                                暂无覆盖当天的阶段
                              </p>
                            )}
                          </div>

                          <div className="mt-3">
                            <div className="flex items-center justify-between gap-2 text-xs font-black text-[#786981]">
                              <span>
                                阶段 {projectProgress.completed} / {projectProgress.total}
                              </span>
	                              <span>{projectProgress.percent}%</span>
	                            </div>
                              <p className="mt-1 text-xs font-bold text-[#8b7b91]">
                                今日项目用时 {formatDashboardDuration(projectTodaySeconds)} ·{" "}
                                {projectTodaySessionCount} 段
                              </p>
	                            <div className="relative mt-1.5 h-2.5 overflow-hidden rounded-full bg-white">
                              <motion.div
                                animate={{ width: `${projectProgress.percent}%` }}
                                className="h-full rounded-full bg-[linear-gradient(90deg,#f59e0b,#10b981)]"
                                initial={false}
                                transition={{ duration: 0.42, ease: "easeOut" }}
                              />
                              <AnimatePresence>
                                {projectFeedback ? (
                                  <motion.div
                                    aria-hidden="true"
                                    animate={{ opacity: 0, x: "100%" }}
                                    className="absolute inset-0 rounded-full bg-white/75"
                                    exit={{ opacity: 0 }}
                                    initial={{ opacity: 0.8, x: "-100%" }}
                                    key={projectFeedback.id}
                                    transition={{ duration: 0.72, ease: "easeOut" }}
                                  />
                                ) : null}
                              </AnimatePresence>
                            </div>
                            <AnimatePresence>
                              {projectFeedback ? (
                                <motion.p
                                  animate={{ opacity: 1, y: 0 }}
                                  className="mt-1.5 inline-flex rounded-full bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700"
                                  exit={{ opacity: 0, y: -4 }}
                                  initial={{ opacity: 0, y: 4 }}
                                  key={projectFeedback.id}
                                  transition={{ duration: 0.22, ease: "easeOut" }}
                                >
                                  {projectFeedback.projectCompleted
                                    ? "项目阶段全部完成"
                                    : `阶段完成：${projectFeedback.phaseTitle}`}
                                </motion.p>
                              ) : null}
                            </AnimatePresence>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2" data-export-ignore="true">
                            <button
                              className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-amber-700 shadow-sm transition hover:bg-amber-50 focus:outline-none focus:ring-4 focus:ring-amber-100"
                              type="button"
                              onClick={() => startComplexProjectEdit(project)}
                            >
                              详情/编辑
                            </button>
                            <button
                              className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700 transition hover:bg-emerald-100 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                              type="button"
                              onClick={() => toggleComplexProjectCompleted(project.id)}
                            >
                              {project.status === "completed" ? "恢复进行中" : "标记完成"}
                            </button>
                            <button
                              className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600 transition hover:bg-slate-200 focus:outline-none focus:ring-4 focus:ring-slate-100"
                              type="button"
                              onClick={() => archiveComplexProject(project.id)}
                            >
                              归档
                            </button>
                          </div>
                        </article>
	                      );
	                    })}
	                  </div>
                  )}
	                </section>
              ) : null}

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
                <div className="flex flex-col gap-4">
                  {plansByPriority.map((prioritySection) => {
                    const isDragOver = dragOverPriority === prioritySection.id;
	                    const isDropAtSectionEnd =
	                      taskDropTarget?.priority === prioritySection.id &&
	                      taskDropTarget.itemId === null;
	                    const isPrioritySectionCollapsed =
	                      todayWorkspaceCollapsed[prioritySection.id];
	                    const priorityCompletedCount = prioritySection.plans.filter(
	                      (item) => item.completed,
	                    ).length;

	                    return (
                      <section
                        className={`rounded-[1.5rem] border-2 border-dashed p-3 transition ${
                          isDragOver ? prioritySection.activeClass : prioritySection.sectionClass
                        }`}
                        key={prioritySection.id}
                        onDragLeave={(event) => {
                          const relatedTarget = event.relatedTarget;
                          const relatedNode =
                            relatedTarget &&
                            typeof (relatedTarget as { nodeType?: unknown }).nodeType === "number"
                              ? (relatedTarget as globalThis.Node)
                              : null;

                          if (relatedNode && event.currentTarget.contains(relatedNode)) {
                            return;
                          }

                          if (dragOverPriority === prioritySection.id) {
                            setDragOverPriority(null);
                          }
                          if (taskDropTarget?.priority === prioritySection.id) {
                            setTaskDropTarget(null);
                          }
                        }}
                        onDragOver={(event) => handlePriorityDragOver(event, prioritySection.id)}
                        onDrop={(event) => handlePriorityDrop(event, prioritySection.id)}
                      >
                        <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
	                            <span className={`rounded-full px-3 py-1 text-xs font-black ${prioritySection.badgeClass}`}>
	                              {priorityCompletedCount} / {prioritySection.plans.length} 项
	                            </span>
	                            <button
	                              aria-expanded={!isPrioritySectionCollapsed}
	                              className="rounded-full bg-white/85 px-3 py-1 text-xs font-black text-[#6f5d78] shadow-sm transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-white/70"
	                              data-export-ignore="true"
	                              type="button"
	                              onClick={() => toggleTodayWorkspaceSection(prioritySection.id)}
	                            >
	                              {isPrioritySectionCollapsed ? "展开" : "收起"}
	                            </button>
	                        </div>

	                        {isPrioritySectionCollapsed ? (
	                          <button
	                            aria-label={`展开${prioritySection.plans.length}项计划`}
	                            className={`w-full rounded-[1.15rem] border px-3 py-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-white/90 focus:outline-none focus:ring-4 focus:ring-white/70 ${
	                              prioritySection.id === "high"
	                                ? "border-rose-200 bg-rose-50/80 shadow-rose-100/60"
	                                : prioritySection.id === "medium"
	                                  ? "border-sky-200 bg-sky-50/80 shadow-sky-100/60"
	                                  : "border-emerald-200 bg-emerald-50/80 shadow-emerald-100/60"
	                            }`}
	                            data-export-ignore="true"
	                            type="button"
	                            onClick={() => toggleTodayWorkspaceSection(prioritySection.id)}
	                          >
	                            {prioritySection.plans.length === 0 ? (
	                              <span className="inline-flex rounded-full border border-white/80 bg-white/75 px-2.5 py-1 text-xs font-black text-[#8b7b91] shadow-sm">
	                                暂无任务
	                              </span>
	                            ) : (
	                              <span className="flex flex-wrap items-center gap-2">
	                                {prioritySection.plans.slice(0, 4).map((item) => (
	                                  <span
	                                    className={`inline-flex max-w-full items-center truncate rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-xs font-black text-[#6f5d78] shadow-sm ${
	                                      item.completed ? "opacity-60 line-through" : ""
	                                    }`}
	                                    key={item.id}
	                                    title={item.title}
	                                  >
	                                    {item.completed ? "✓ " : ""}
	                                    {item.title}
	                                  </span>
	                                ))}
	                                {prioritySection.plans.length > 4 ? (
	                                  <span className={`inline-flex rounded-full border border-white/80 px-2.5 py-1 text-xs font-black shadow-sm ${prioritySection.badgeClass}`}>
	                                    +{prioritySection.plans.length - 4} 项
	                                  </span>
	                                ) : null}
	                              </span>
	                            )}
	                            {isDropAtSectionEnd ? (
	                              <span className="mt-2 block h-1.5 rounded-full bg-[#ff8fbc] shadow-sm shadow-pink-200" />
	                            ) : null}
	                          </button>
	                        ) : prioritySection.plans.length === 0 ? (
	                          <div className="rounded-[1.15rem] border border-dashed border-white/90 bg-white/45 px-4 py-4 text-center text-sm font-black text-[#8b7b91]">
	                            把任务拖到这里
	                          </div>
                        ) : (
                          <div
                            className="grid justify-start gap-3"
                            style={{
                              gridTemplateColumns:
                                "repeat(auto-fill, minmax(min(100%, 15.5rem), 18rem))",
                            }}
                          >
                            {prioritySection.plans.map((item) => {
                    const style = getCategoryStyle(item.category, customCategories);
                    const priorityOption = getPriorityOption(item.priority);
                    const activeCardDropPlacement =
                      taskDropTarget?.priority === prioritySection.id &&
                      taskDropTarget.itemId === item.id &&
                      taskDropTarget.placement !== "end"
                        ? taskDropTarget.placement
                        : null;
                    const timerForItem = taskTimersByTaskId[item.id] ?? null;
                    const taskTimeEntries = getTaskTimeEntriesForDate(item, selectedDate);
                    const timerElapsedSeconds = getTaskTimeSecondsForDate(
                      item,
                      selectedDate,
                      timerTick,
                    );
                    const hasForwardTiming = taskTimeEntries.length > 0 || timerElapsedSeconds > 0;
                    const isTimerRunning = Boolean(getRunningTaskTimeEntry(item));
                    const isTimerPaused = Boolean(hasForwardTiming && !isTimerRunning);
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
                    const activeInlineField =
                      taskInlineEdit?.itemId === item.id ? taskInlineEdit.field : null;
                    const isCategoryEditing = activeInlineField === "category";
                    const isTargetMinutesEditing = activeInlineField === "targetMinutes";
                    const isTitleEditing = activeInlineField === "title";
                    const isNoteEditing = activeInlineField === "note";
                    const isActualEditing = actualEditId === item.id;
                    const isCardInputEditing = Boolean(activeInlineField) || isActualEditing;

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
                        className={`relative overflow-hidden rounded-[1.35rem] border-2 border-dashed p-2.5 shadow-sm transition ${priorityOption.cardBg} ${priorityOption.cardBorder} ${
                          item.completed ? "" : "hover:-translate-y-1"
                        } ${
                          highlightedTaskId === item.id
                            ? "ring-4 ring-amber-200 ring-offset-2 ring-offset-white"
                            : draggedTaskId === item.id
                              ? "opacity-70 ring-4 ring-white/80"
                            : ""
                        } ${
                          activeCardDropPlacement
                            ? "ring-4 ring-pink-200 ring-offset-2 ring-offset-white"
                            : ""
                        } ${isCardInputEditing ? "" : "cursor-grab active:cursor-grabbing"}`}
                        data-task-card="true"
                        draggable={!isCardInputEditing}
                        id={item.id ? `task-${item.id}` : undefined}
                        initial={{ opacity: 0, y: 12 }}
                        key={item.id}
                        onDragEndCapture={handleTaskDragEnd}
                        onDragOver={(event) =>
                          handleTaskDragOver(event, prioritySection.id, item.id)
                        }
                        onDragStartCapture={(event) => {
                          if (isCardInputEditing) {
                            event.preventDefault();
                            event.stopPropagation();
                            return;
                          }

                          handleTaskDragStart(event, item);
                        }}
                        onDrop={(event) => handleTaskDrop(event, prioritySection.id, item.id)}
                        transition={{ duration: 0.42, ease: "easeOut" }}
                      >
                        {activeCardDropPlacement ? (
                          <div
                            className={`pointer-events-none absolute left-4 right-4 z-30 h-1.5 rounded-full bg-[#ff8fbc] shadow-sm shadow-pink-200 ${
                              activeCardDropPlacement === "before" ? "top-1" : "bottom-1"
                            }`}
                          />
                        ) : null}
                        <div className="absolute -right-5 -top-5 h-14 w-14 rounded-full border-8 border-white/60 bg-white/30" />
                        <AnimatePresence>
                          {completionFeedback?.itemId === item.id ? (
                            <CardCompletionBurst feedback={completionFeedback} />
                          ) : null}
                        </AnimatePresence>
                        <button
                          className={`absolute right-2.5 top-2.5 z-20 flex min-h-7 min-w-[4.4rem] items-center justify-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-xs font-black transition ${
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
                                className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-[#a7dfbe] text-[9px] text-white"
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
                        <div className="relative flex gap-2">
                          <div className="flex w-14 shrink-0 flex-col items-center gap-1.5">
                            <button
                              aria-label="编辑分类"
                              aria-controls={`task-category-picker-${item.id}`}
                              aria-expanded={isCategoryEditing}
                              aria-haspopup="listbox"
                              className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border border-white/80 bg-white text-[1.1rem] leading-none shadow-sm transition hover:bg-white/90 focus:outline-none focus:ring-4 focus:ring-pink-100"
                              data-export-ignore="true"
                              type="button"
                              onClick={() =>
                                isCategoryEditing
                                  ? cancelTaskInlineEdit(true)
                                  : startTaskInlineEdit(item, "category")
                              }
                            >
                              <span
                                aria-label={style.caption}
                                className="inline-flex whitespace-nowrap leading-none"
                                role="img"
                              >
                                {style.emoji}
                              </span>
                            </button>
                            <span
                              className={`max-w-full truncate whitespace-nowrap rounded-full bg-white/80 px-2 py-1 text-xs font-black ${style.accent}`}
                              title={item.category}
                            >
                              {item.category}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="mb-1.5 flex items-center gap-2 pr-[4.75rem]">
                              <label
                                className={`min-w-0 max-w-full flex-1 rounded-full px-2.5 py-1 text-xs font-black ${priorityOption.badgeClass}`}
                                data-export-ignore="true"
                              >
                                <span className="sr-only">优先级</span>
                                <select
                                  className="w-full bg-transparent text-xs font-black outline-none"
                                  draggable={false}
                                  value={normalizePriority(item.priority)}
                                  onChange={(event) =>
                                    updateTaskPriority(item.id, normalizePriority(event.target.value))
                                  }
                                  onDragStartCapture={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                  }}
                                >
                                  {PRIORITY_OPTIONS.map((option) => (
                                    <option key={option.id} value={option.id}>
                                      {option.icon} {option.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                            <div className="flex items-baseline">
                              {isTitleEditing ? (
                                <input
                                  autoFocus
                                  className="min-w-0 flex-1 rounded-xl border border-pink-200 bg-white/95 px-2.5 py-1 text-lg font-black text-[#41354b] outline-none transition focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
                                  data-export-ignore="true"
                                  draggable={false}
                                  maxLength={48}
                                  value={inlineTitleDraft}
                                  onBlur={() => {
                                    if (shouldSaveTaskInlineBlur()) {
                                      saveInlineTitle(item.id);
                                    }
                                  }}
                                  onChange={(event) => setInlineTitleDraft(event.target.value)}
                                  onDragStartCapture={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      saveInlineTitle(item.id);
                                    }
                                    if (event.key === "Escape") {
                                      cancelTaskInlineEdit(true);
                                    }
                                  }}
                                />
                              ) : (
                                <h3
                                  className={`min-w-0 flex-1 break-words text-lg font-black text-[#41354b] ${
                                    item.completed ? "line-through decoration-2 opacity-60" : ""
                                  }`}
                                  onDoubleClick={() => startTaskInlineEdit(item, "title")}
                                >
                                  {item.title}
                                </h3>
                              )}
                            </div>
                            {isNoteEditing ? (
                              <div className="mt-1 space-y-2" data-export-ignore="true">
                                <textarea
                                  autoFocus
                                  className="min-h-16 w-full resize-none rounded-xl border border-pink-100 bg-white/95 px-2.5 py-1.5 text-sm font-bold leading-5 text-[#74667d] outline-none transition focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
                                  draggable={false}
                                  maxLength={160}
                                  placeholder="输入备注后点击保存"
                                  value={inlineNoteDraft}
                                  onBlur={() => {
                                    if (shouldSaveTaskInlineBlur()) {
                                      saveInlineNote(item.id);
                                    }
                                  }}
                                  onChange={(event) => setInlineNoteDraft(event.target.value)}
                                  onDragStartCapture={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === "Escape") {
                                      cancelTaskInlineEdit(true);
                                    }
                                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                                      event.preventDefault();
                                      saveInlineNote(item.id);
                                    }
                                  }}
                                />
                                <div className="flex flex-wrap justify-end gap-2">
                                  <button
                                    className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-black text-[#6c5e75] shadow-sm transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-pink-100"
                                    type="button"
                                    onMouseDown={(event) => {
                                      event.preventDefault();
                                      skipInlineBlurSave.current = true;
                                    }}
                                    onClick={() => cancelTaskInlineEdit(true)}
                                  >
                                    取消
                                  </button>
                                  <button
                                    className="rounded-full bg-[#ff8fbc] px-3 py-1.5 text-xs font-black text-white shadow-sm shadow-pink-100 transition hover:bg-[#ff79ad] focus:outline-none focus:ring-4 focus:ring-pink-100"
                                    type="button"
                                    onMouseDown={(event) => {
                                      event.preventDefault();
                                      skipInlineBlurSave.current = true;
                                    }}
                                    onClick={() => saveInlineNote(item.id)}
                                  >
                                    保存备注
                                  </button>
                                </div>
                              </div>
                            ) : item.note ? (
                              <p
                                className={`mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-[#74667d] ${
                                  item.completed ? "opacity-60" : ""
                                }`}
                                onDoubleClick={() => startTaskInlineEdit(item, "note")}
                              >
                                {item.note}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        {isCategoryEditing ? (
                          <div
                            className="relative z-30 mt-2 rounded-[1rem] border border-white/80 bg-white/95 p-2 shadow-lg shadow-pink-100"
                            data-export-ignore="true"
                            draggable={false}
                            id={`task-category-picker-${item.id}`}
                            role="listbox"
                            onDragStartCapture={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                          >
                            <div className="grid grid-cols-2 gap-1.5">
                              {categoryOptions.map((category) => {
                                const isSelectedCategory = category.name === item.category;

                                return (
                                  <button
                                    aria-selected={isSelectedCategory}
                                    className={`flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-left text-xs font-black transition focus:outline-none focus:ring-4 focus:ring-pink-100 ${
                                      isSelectedCategory
                                        ? "bg-pink-50 text-pink-700 ring-1 ring-pink-200"
                                        : "bg-[#f8f4fb] text-[#6f5d78] hover:bg-white"
                                    }`}
                                    key={category.id}
                                    role="option"
                                    type="button"
                                    onClick={() => updateTaskCategory(item.id, category.name)}
                                  >
                                    <span aria-hidden="true" className="shrink-0">
                                      {category.icon}
                                    </span>
                                    <span className="min-w-0 truncate">{category.name}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}

                        <div className="relative mt-2 flex w-full flex-row flex-wrap items-center justify-start gap-2 text-xs font-black text-[#74667d] sm:gap-3">
                          {isTargetMinutesEditing ? (
                            <form
                              className="inline-flex min-h-7 shrink-0 items-center rounded-full bg-white/80 px-2.5 py-0.5"
                              data-export-ignore="true"
                              onDragStartCapture={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                              onSubmit={(event) => {
                                event.preventDefault();
                                saveTargetMinutesEdit(item.id);
                              }}
                            >
                              <span className="mr-1 whitespace-nowrap">目标：</span>
                              <input
                                autoFocus
                                className="w-16 bg-transparent text-xs font-black text-[#46394f] outline-none"
                                draggable={false}
                                inputMode="numeric"
                                min={1}
                                pattern="[1-9][0-9]*"
                                placeholder="分钟"
                                step={1}
                                type="text"
                                value={targetMinutesEditDraft}
                                onBlur={() => {
                                  if (shouldSaveTaskInlineBlur()) {
                                    saveTargetMinutesEdit(item.id);
                                  }
                                }}
                                onChange={(event) => {
                                  const nextValue = event.target.value;

                                  if (nextValue === "" || /^[1-9]\d*$/.test(nextValue)) {
                                    setTargetMinutesEditDraft(nextValue);
                                  }
                                  setTargetMinutesEditError("");
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === "Escape") {
                                    cancelTaskInlineEdit(true);
                                  }
                                }}
                              />
                            </form>
                          ) : (
                            <button
                              aria-label="编辑目标用时"
                              className="inline-flex min-h-7 shrink-0 items-center rounded-full bg-white/70 px-2.5 py-0.5 text-left transition hover:bg-white hover:text-pink-700 focus:outline-none focus:ring-4 focus:ring-pink-100"
                              data-export-ignore="true"
                              type="button"
                              onClick={() => startTaskInlineEdit(item, "targetMinutes")}
                            >
                              目标：{formatMinutes(item.targetMinutes)}
                            </button>
                          )}
                          {isActualEditing ? (
                            <form
                              className="inline-flex min-h-7 shrink-0 items-center rounded-full bg-white/80 px-2.5 py-0.5"
                              data-export-ignore="true"
                              onDragStartCapture={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                              onSubmit={(event) => {
                                event.preventDefault();
                                saveActualMinutes(item.id);
                              }}
                            >
                              <span className="mr-1 whitespace-nowrap">实际：</span>
                              <input
                                autoFocus
                                className="w-16 bg-transparent text-xs font-black text-[#46394f] outline-none"
                                draggable={false}
                                id={`actual-minutes-${item.id}`}
                                inputMode="numeric"
                                min={1}
                                pattern="[1-9][0-9]*"
                                placeholder="分钟"
                                step={1}
                                type="text"
                                value={actualMinutesDraft}
                                onBlur={() => {
                                  if (shouldSaveTaskInlineBlur()) {
                                    saveActualMinutes(item.id);
                                  }
                                }}
                                onChange={(event) => {
                                  const nextValue = event.target.value;

                                  if (nextValue === "" || /^[1-9]\d*$/.test(nextValue)) {
                                    setActualMinutesDraft(nextValue);
                                  }
                                  setActualMinutesError("");
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === "Escape") {
                                    cancelActualMinutesEdit(true);
                                  }
                                }}
                              />
                            </form>
                          ) : (
                            <button
                              aria-label="编辑实际用时"
                              className="inline-flex min-h-7 shrink-0 items-center rounded-full bg-white/70 px-2.5 py-0.5 text-left transition hover:bg-white hover:text-sky-700 focus:outline-none focus:ring-4 focus:ring-sky-100"
                              type="button"
                              onClick={() => startActualMinutesEdit(item)}
                            >
                              实际：{formatMinutes(item.actualMinutes)}
                            </button>
                          )}
                          {targetMinutesEditError ? (
                            <p className="w-full text-xs font-bold text-rose-600">
                              {targetMinutesEditError}
                            </p>
                          ) : null}
                          {actualMinutesError ? (
                            <p className="w-full text-xs font-bold text-rose-600">
                              {actualMinutesError}
                            </p>
                          ) : null}
                        </div>

                        <div className="relative mt-2" data-export-ignore="true">
                          <div className="flex flex-col gap-2 text-xs font-black text-[#74667d]">
                            <div className="flex min-w-0 flex-nowrap items-center gap-1">
                              <div
                                className={`inline-flex min-h-7 shrink-0 flex-nowrap items-center gap-0.5 rounded-full border px-1 py-0.5 ${
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
                                  className={`rounded-full px-1 py-0.5 text-[11px] font-black leading-5 transition disabled:cursor-not-allowed disabled:opacity-55 ${
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
                              {taskTimeEntries.length > 0 ? (
                                <button
                                  aria-label={`查看${item.title}的计时明细`}
                                  className="inline-flex min-h-7 shrink-0 items-center rounded-full border border-sky-100 bg-white/85 px-1 py-0.5 text-[11px] font-black leading-5 text-sky-700 transition hover:bg-sky-50 focus:outline-none focus:ring-4 focus:ring-sky-100"
                                  type="button"
                                  onClick={() => openTaskTimeDetails(item.id, selectedDate)}
                                >
                                  {taskTimeEntries.length} 段
                                </button>
                              ) : null}
                              <div className="inline-flex shrink-0 items-center gap-1">
                                <button
                                  className="inline-flex min-h-7 items-center rounded-full bg-white/80 px-1 py-0.5 text-[11px] font-bold leading-5 text-[#6c5e75] transition hover:bg-white"
                                  type="button"
                                  onClick={() => handleEdit(item)}
                                >
                                  编辑备注
                                </button>
                                <button
                                  className="inline-flex min-h-7 items-center rounded-full bg-white/80 px-1 py-0.5 text-[11px] font-bold leading-5 text-rose-600 transition hover:bg-white"
                                  type="button"
                                  onClick={() => handleDelete(item.id)}
                                >
                                  删除计划
                                </button>
                              </div>
                            </div>
                            <div className={`flex max-w-full flex-nowrap items-center gap-0.5 overflow-visible pl-3 ${item.completed ? "opacity-60" : ""}`}>
                              {COUNTDOWN_OPTIONS.map((option) => {
                                const optionSeconds = option.minutes * 60;
                                const isActiveCountdown = activeCountdownSeconds === optionSeconds;

                                return (
                                  <span className="group relative inline-flex" key={option.minutes}>
                                    <button
                                      aria-label={option.title}
                                      className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-black transition disabled:cursor-not-allowed disabled:opacity-55 ${
                                        isActiveCountdown ? option.activeClass : option.baseClass
                                      } ${isActiveCountdown && isCountdownRunning ? "ring-2 ring-white/80" : ""}`}
                                      disabled={item.completed}
                                      type="button"
                                      onClick={() => handleCountdownClick(item, option.minutes)}
                                    >
                                      <span aria-hidden="true">⏳</span>
                                    </button>
                                    <span aria-hidden="true" className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-[#6c5e75] opacity-0 shadow-sm ring-1 ring-violet-100 transition-opacity duration-100 group-hover:opacity-100">
                                      {option.title}
                                    </span>
                                  </span>
                                );
                              })}
                              {hasCountdownTiming ? (
                                <span className="inline-flex min-h-6 shrink-0 items-center gap-0.5 rounded-full border border-amber-100 bg-white/85 px-1 py-0.5 text-[11px] font-black tabular-nums text-amber-800 shadow-sm">
                                  <span className="whitespace-nowrap">
                                    ⏳ {formatTimerSeconds(countdownRemainingSeconds)}
                                  </span>
                                  <button
                                    aria-label={isCountdownRunning ? "暂停倒计时" : "继续倒计时"}
                                    className={`rounded-full px-1 py-0 text-[10px] font-black leading-5 transition disabled:cursor-not-allowed disabled:opacity-55 ${
                                      isCountdownRunning
                                        ? "bg-amber-500 text-white hover:bg-amber-600"
                                        : "bg-emerald-500 text-white hover:bg-emerald-600"
                                    }`}
                                    disabled={item.completed}
                                    type="button"
                                    onClick={() => toggleCountdownTimer(item)}
                                  >
                                    {isCountdownRunning ? "暂停" : "继续"}
                                  </button>
                                  <button
                                    aria-label="结束倒计时"
                                    className="rounded-full bg-rose-50 px-1 py-0 text-[10px] font-black leading-5 text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-55"
                                    disabled={item.completed}
                                    type="button"
                                    onClick={() => endCountdownTimer(item)}
                                  >
                                    结束
                                  </button>
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </motion.article>
                    );
                            })}
                            {isDropAtSectionEnd ? (
                              <div className="col-span-full h-1.5 rounded-full bg-[#ff8fbc] shadow-sm shadow-pink-200" />
                            ) : null}
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
          {activeWorkspaceTab === "projects" ? complexProjectWorkspace : null}
          {activeWorkspaceTab === "time" ? timeStatsWorkspace : null}
          {activeWorkspaceTab === "export" ? exportWorkspace : null}
        </section>
        </div>

        <div
          aria-hidden="true"
          style={{
            left: 0,
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
        {ganttExportProject ? (
          <div
            aria-hidden="true"
            style={{
              left: "-10000px",
              pointerEvents: "none",
              position: "fixed",
              top: 0,
              width: `${ganttExportWidth}px`,
              zIndex: 0,
            }}
          >
            <div
              ref={ganttExportRef}
              className="rounded-[1.35rem] border border-amber-100 bg-[#fffaf4] p-3"
              style={{ width: `${ganttExportWidth}px` }}
            >
              <ComplexProjectGanttChart project={ganttExportProject} />
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

export default App;
