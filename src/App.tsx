import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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

const STORAGE_KEY = "daily-planner-journal-v1";
const LEGACY_SYNC_STATE_KEY = "daily-planner-journal-sync-v1";
const DELETED_ITEM_IDS_KEY = "daily-planner-journal-deleted-v1";
const CUSTOM_CATEGORIES_KEY = "daily-planner-journal-custom-categories-v1";
const SYNC_DEBOUNCE_MS = 800;

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
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>(() =>
    loadCustomCategories(),
  );
  const [customCategoryInput, setCustomCategoryInput] = useState<string>("");
  const [customCategoryStatus, setCustomCategoryStatus] = useState<string>("");
  const [isExporting, setIsExporting] = useState<boolean>(false);
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
  const feedbackTimer = useRef<number | null>(null);
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
    };
  }, []);

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

  const handleToggle = (id: string) => {
    const targetPlan = plans.find((item) => item.id === id);

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

    if (targetPlan?.completed && actualEditId === id) {
      cancelActualMinutesEdit();
    }

    updatePlansForSelectedDate((currentPlans) =>
      currentPlans.map((item) =>
        item.id === id
          ? {
              ...item,
              completed: !item.completed,
              updatedAt: Date.now(),
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
    resetForm();
  };

  const captureJournal = async () => {
    if (!journalRef.current) {
      return null;
    }

    setIsExporting(true);
    await new Promise((resolve) => window.requestAnimationFrame(resolve));

    try {
      return await html2canvas(journalRef.current, {
        backgroundColor: "#fffaf4",
        scale: Math.min(window.devicePixelRatio || 2, 2),
        ignoreElements: (element) => element.hasAttribute("data-export-ignore"),
      });
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
              <div className="flex flex-wrap gap-2">
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
                            <div className="mt-3 flex flex-wrap gap-2 text-xs font-black text-[#74667d]">
                              <span className="rounded-full bg-white/70 px-3 py-1">
                                目标：{formatMinutes(item.targetMinutes)}
                              </span>
                              <span className="rounded-full bg-white/70 px-3 py-1">
                                实际：{formatMinutes(item.actualMinutes)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div
                          className="relative mt-4 flex flex-wrap gap-2 border-t border-white/80 pt-3"
                          data-export-ignore="true"
                        >
                          <button
                            className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-bold text-[#6c5e75] transition hover:bg-white"
                            type="button"
                            onClick={() => handleEdit(item)}
                          >
                            编辑
                          </button>
                          {item.completed ? (
                            actualEditId === item.id ? (
                              <form
                                className="flex w-full flex-col gap-2 rounded-[1rem] bg-white/70 p-3 sm:flex-row sm:items-end"
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
                            ) : (
                              <button
                                className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-bold text-sky-700 transition hover:bg-white"
                                type="button"
                                onClick={() => startActualMinutesEdit(item)}
                              >
                                {item.actualMinutes ? "修改实际用时" : "填写实际用时"}
                              </button>
                            )
                          ) : null}
                          <button
                            className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-bold text-rose-600 transition hover:bg-white"
                            type="button"
                            onClick={() => handleDelete(item.id)}
                          >
                            删除
                          </button>
                        </div>
                      </motion.article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

export default App;
