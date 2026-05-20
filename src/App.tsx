import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

const STORAGE_KEY = "daily-planner-journal-v1";

const CATEGORY_OPTIONS = [
  "学习",
  "工作",
  "生活",
  "运动",
  "购物",
  "创作",
  "休息",
  "其他",
] as const;

type Category = (typeof CATEGORY_OPTIONS)[number];

type PlanItem = {
  id: string;
  date: string;
  title: string;
  category: Category;
  note: string;
  completed: boolean;
  createdAt: number;
};

type PlanBook = Record<string, PlanItem[]>;

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
};

const CATEGORY_STYLES: Record<Category, CategoryStyle> = {
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
  其他: {
    emoji: "💗🏷️",
    accent: "text-pink-700",
    bg: "bg-pink-50",
    border: "border-pink-200",
    caption: "爱心贴纸",
  },
};

const emptyForm: PlanForm = {
  title: "",
  category: "学习",
  note: "",
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

function SparkleFeedback({ feedbackId }: { feedbackId: number }) {
  const sparkles = ["✨", "⭐", "✦", "🎀", "✧", "💫"];

  return (
    <motion.div
      key={feedbackId}
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-6 z-50 mx-auto flex w-fit items-center gap-2 rounded-full border border-white/80 bg-white/90 px-5 py-3 text-sm font-black text-pink-600 shadow-sticker"
      initial={{ opacity: 0, y: -18, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.96 }}
      transition={{ duration: 0.28 }}
    >
      <span>完成啦</span>
      <span className="flex gap-1">
        {sparkles.map((sparkle, index) => (
          <motion.span
            aria-hidden="true"
            className="inline-block"
            key={`${sparkle}-${index}`}
            animate={{ y: [0, -8, 0], rotate: [0, 10, -8, 0] }}
            transition={{ duration: 0.65, delay: index * 0.05 }}
          >
            {sparkle}
          </motion.span>
        ))}
      </span>
    </motion.div>
  );
}

function App() {
  const today = useMemo(() => formatDateInput(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [plansByDate, setPlansByDate] = useState<PlanBook>(() => loadPlanBook());
  const [form, setForm] = useState<PlanForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [completedFlashId, setCompletedFlashId] = useState<string | null>(null);
  const [feedbackId, setFeedbackId] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const journalRef = useRef<HTMLDivElement | null>(null);
  const feedbackTimer = useRef<number | null>(null);

  const plans = plansByDate[selectedDate] ?? [];
  const completedCount = plans.filter((item) => item.completed).length;
  const progress = plans.length > 0 ? Math.round((completedCount / plans.length) * 100) : 0;

  useEffect(() => {
    savePlanBook(plansByDate);
  }, [plansByDate]);

  useEffect(() => {
    return () => {
      if (feedbackTimer.current) {
        window.clearTimeout(feedbackTimer.current);
      }
    };
  }, []);

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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = form.title.trim();

    if (!title) {
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
      createdAt: Date.now(),
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
    });
  };

  const handleDelete = (id: string) => {
    updatePlansForSelectedDate((currentPlans) => currentPlans.filter((item) => item.id !== id));
    if (editingId === id) {
      resetForm();
    }
  };

  const handleToggle = (id: string) => {
    const targetPlan = plans.find((item) => item.id === id);

    if (targetPlan && !targetPlan.completed) {
      setCompletedFlashId(id);
      setFeedbackId(Date.now());

      if (feedbackTimer.current) {
        window.clearTimeout(feedbackTimer.current);
      }

      feedbackTimer.current = window.setTimeout(() => {
        setCompletedFlashId(null);
        setFeedbackId(null);
      }, 950);
    }

    updatePlansForSelectedDate((currentPlans) =>
      currentPlans.map((item) =>
        item.id === id
          ? {
              ...item,
              completed: !item.completed,
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
      <AnimatePresence>{feedbackId ? <SparkleFeedback feedbackId={feedbackId} /> : null}</AnimatePresence>
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
                    setForm((current) => ({ ...current, category: event.target.value as Category }))
                  }
                >
                  {CATEGORY_OPTIONS.map((category) => (
                    <option key={category} value={category}>
                      {CATEGORY_STYLES[category].emoji} {category}
                    </option>
                  ))}
                </select>
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
                    const style = CATEGORY_STYLES[item.category];

                    return (
                      <motion.article
                        layout
                        animate={{
                          opacity: item.completed ? 0.72 : 1,
                          y: 0,
                          scale: completedFlashId === item.id ? [1, 1.04, 1] : 1,
                        }}
                        className={`relative overflow-hidden rounded-[1.5rem] border-2 border-dashed p-4 shadow-sm transition ${style.bg} ${style.border} ${
                          item.completed ? "" : "hover:-translate-y-1"
                        }`}
                        initial={{ opacity: 0, y: 12 }}
                        key={item.id}
                        transition={{ duration: 0.42, ease: "easeOut" }}
                      >
                        <div className="absolute -right-5 -top-5 h-16 w-16 rounded-full border-8 border-white/60 bg-white/30" />
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
