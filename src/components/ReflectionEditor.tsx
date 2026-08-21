import { useEffect, useMemo, useRef, useState } from "react";
import { Extension, Mark, mergeAttributes } from "@tiptap/core";
import CharacterCount from "@tiptap/extension-character-count";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import {
  BackgroundColor,
  Color,
  FontFamily,
  FontSize,
  TextStyle,
} from "@tiptap/extension-text-style";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  AArrowDown,
  AArrowUp,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  Check,
  ChevronDown,
  Highlighter,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  Palette,
  Redo2,
  RefreshCw,
  RemoveFormatting,
  Search,
  Strikethrough,
  Subscript,
  Superscript,
  Underline,
  Undo2,
} from "lucide-react";

export type ReflectionInsertRequest = {
  id: number;
  text: string;
};

type ReflectionEditorProps = {
  clearVersion: number;
  initialHtml: string;
  insertRequest: ReflectionInsertRequest | null;
  onChange: (content: string, contentHtml: string) => void;
};

type LocalFontRecord = {
  family: string;
};

type LocalFontWindow = Window & {
  queryLocalFonts?: () => Promise<LocalFontRecord[]>;
};

type EditorSelectionRange = {
  from: number;
  to: number;
};

const COMMON_FONT_FAMILIES = [
  "微软雅黑",
  "苹方",
  "宋体",
  "楷体",
  "黑体",
  "仿宋",
  "方正仿宋_GBK",
  "方正仿宋GBK",
  "方正仿宋 GBK",
  "PingFang SC",
  "Microsoft YaHei",
  "Songti SC",
  "STSong",
  "SimSun",
  "Kaiti SC",
  "STKaiti",
  "KaiTi",
  "Heiti SC",
  "STHeiti",
  "SimHei",
  "FangSong",
  "Hiragino Sans GB",
  "Hiragino Mincho ProN",
  "Arial",
  "Georgia",
  "Times New Roman",
];

const FONT_FAMILY_ALIASES: Record<string, string> = {
  微软雅黑: '"Microsoft YaHei", "PingFang SC", sans-serif',
  苹方: '"PingFang SC", "Microsoft YaHei", sans-serif',
  宋体: '"Songti SC", STSong, SimSun, serif',
  楷体: '"Kaiti SC", STKaiti, KaiTi, serif',
  黑体: '"Heiti SC", STHeiti, SimHei, sans-serif',
  仿宋: 'FangSong, "FangSong SC", serif',
  方正仿宋_GBK: '"FZFangSong-Z02", "方正仿宋_GBK", FangSong, serif',
  方正仿宋GBK: '"FZFangSong-Z02", "方正仿宋_GBK", FangSong, serif',
  "方正仿宋 GBK": '"FZFangSong-Z02", "方正仿宋_GBK", FangSong, serif',
};

const FONT_DISPLAY_NAMES: Record<string, string> = {
  "Microsoft YaHei": "微软雅黑",
  "PingFang SC": "苹方",
  "Songti SC": "宋体",
  STSong: "宋体",
  SimSun: "宋体",
  "Kaiti SC": "楷体",
  STKaiti: "楷体",
  KaiTi: "楷体",
  "Heiti SC": "黑体",
  STHeiti: "黑体",
  SimHei: "黑体",
  FangSong: "仿宋",
  "FZFangSong-Z02": "方正仿宋_GBK",
  方正仿宋_GBK: "方正仿宋_GBK",
};

const THEME_COLOR_ROWS = [
  ["#ffffff", "#111827", "#f3f0df", "#0f4c81", "#3b82c4", "#d14d59", "#8abf4b", "#7a5ca6", "#0aa6b5", "#ff8737"],
  ["#f8fafc", "#9ca3af", "#e8e3c9", "#d7eafb", "#dcecf8", "#f9dfe2", "#edf6df", "#eee8f5", "#d9f2f4", "#fff0e3"],
  ["#e5e7eb", "#6b7280", "#d0c7a0", "#9dc9ef", "#bdd8ed", "#f3bfc5", "#d8eabe", "#d8cbe8", "#afe1e6", "#ffd8ba"],
  ["#d1d5db", "#4b5563", "#a89b57", "#4d9bd8", "#8ab8dc", "#e58b96", "#b7d88e", "#af98cc", "#71c9d2", "#ffb982"],
  ["#9ca3af", "#374151", "#5f5837", "#12395f", "#2b6699", "#a83242", "#5e8d2b", "#5c4779", "#057e8c", "#e95205"],
  ["#6b7280", "#1f2937", "#29281d", "#0b2948", "#204c73", "#76232d", "#3e621d", "#423456", "#075764", "#9a3904"],
];

const STANDARD_TEXT_COLORS = [
  "#d81b0c",
  "#ff2419",
  "#ffb800",
  "#ffe500",
  "#6bd62b",
  "#00b856",
  "#0bb4e9",
  "#0874c9",
  "#082663",
  "#7525a8",
];

const FONT_SIZE_OPTIONS = [
  { label: "初号", value: 56 },
  { label: "小初", value: 48 },
  { label: "一号", value: 34.7 },
  { label: "小一", value: 32 },
  { label: "二号", value: 29.3 },
  { label: "小二", value: 24 },
  { label: "三号", value: 21.3 },
  { label: "小三", value: 20 },
  { label: "四号", value: 18.7 },
  { label: "小四", value: 16 },
  { label: "五号", value: 14 },
  { label: "小五", value: 12 },
  { label: "六号", value: 10 },
  { label: "小六", value: 8.7 },
  { label: "七号", value: 7.3 },
  { label: "八号", value: 6.7 },
  ...[5, 5.5, 6.5, 8, 9, 10.5, 11, 13, 15, 18, 22, 26, 28, 36, 42, 60, 72].map(
    (value) => ({ label: String(value), value }),
  ),
];

const LINE_HEIGHT_OPTIONS = [
  { label: "单倍", value: 1 },
  { label: "1.15 倍", value: 1.15 },
  { label: "1.2 倍", value: 1.2 },
  { label: "1.5 倍", value: 1.5 },
  { label: "1.75 倍", value: 1.75 },
  { label: "2 倍", value: 2 },
  { label: "2.5 倍", value: 2.5 },
  { label: "3 倍", value: 3 },
];

type ParsedCssColor = {
  hex: string;
  opacity: number;
};

function toHexChannel(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
}

function parseCssColor(value: unknown): ParsedCssColor | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  const hexMatch = normalizedValue.match(/^#([0-9a-f]{6})$/i);
  if (hexMatch) {
    return { hex: `#${hexMatch[1].toLowerCase()}`, opacity: 100 };
  }

  const rgbaMatch = normalizedValue.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d*(?:\.\d+)?))?\s*\)$/i,
  );
  if (!rgbaMatch) {
    return null;
  }

  const opacity = rgbaMatch[4] === undefined ? 100 : Math.round(Number(rgbaMatch[4]) * 100);
  return {
    hex: `#${toHexChannel(Number(rgbaMatch[1]))}${toHexChannel(Number(rgbaMatch[2]))}${toHexChannel(Number(rgbaMatch[3]))}`,
    opacity: Math.max(0, Math.min(100, opacity)),
  };
}

function composeHighlightColor(hex: string, opacity: number): string {
  const parsedColor = parseCssColor(hex) ?? { hex: "#fff59d", opacity: 100 };
  const normalizedOpacity = Math.max(0, Math.min(100, opacity));
  if (normalizedOpacity >= 100) {
    return parsedColor.hex;
  }

  const red = Number.parseInt(parsedColor.hex.slice(1, 3), 16);
  const green = Number.parseInt(parsedColor.hex.slice(3, 5), 16);
  const blue = Number.parseInt(parsedColor.hex.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${normalizedOpacity / 100})`;
}

let cachedLocalFontFamilies: string[] = [];

function getPrimaryFontFamily(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const primaryFamily = value
    .split(",")[0]
    ?.trim()
    .replace(/^['"]|['"]$/g, "") ?? "";

  return FONT_DISPLAY_NAMES[primaryFamily] ?? primaryFamily;
}

const ParagraphSpacing = Extension.create({
  name: "paragraphSpacing",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          paragraphSpacing: {
            default: null,
            parseHTML: (element) => element.style.marginBottom || null,
            renderHTML: (attributes) =>
              attributes.paragraphSpacing
                ? { style: `margin-bottom: ${attributes.paragraphSpacing}` }
                : {},
          },
        },
      },
    ];
  },
});

const BlockLineHeight = Extension.create({
  name: "blockLineHeight",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element) => element.style.lineHeight || null,
            renderHTML: (attributes) =>
              attributes.lineHeight ? { style: `line-height: ${attributes.lineHeight}` } : {},
          },
        },
      },
    ];
  },
});

const BlockIndent = Extension.create({
  name: "blockIndent",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          indentLevel: {
            default: 0,
            parseHTML: (element) => Number(element.dataset.indentLevel || 0),
            renderHTML: (attributes) => {
              const indentLevel = Math.max(0, Number(attributes.indentLevel) || 0);
              return indentLevel
                ? {
                    "data-indent-level": String(indentLevel),
                    style: `margin-left: ${indentLevel * 1.5}rem`,
                  }
                : {};
            },
          },
        },
      },
    ];
  },
});

const LetterSpacing = Extension.create({
  name: "letterSpacing",
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          letterSpacing: {
            default: null,
            parseHTML: (element) => element.style.letterSpacing || null,
            renderHTML: (attributes) =>
              attributes.letterSpacing
                ? { style: `letter-spacing: ${attributes.letterSpacing}` }
                : {},
          },
        },
      },
    ];
  },
});

const SuperscriptFormat = Mark.create({
  name: "superscript",
  excludes: "subscript",
  parseHTML() {
    return [{ tag: "sup" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["sup", mergeAttributes(HTMLAttributes), 0];
  },
});

const SubscriptFormat = Mark.create({
  name: "subscript",
  excludes: "superscript",
  parseHTML() {
    return [{ tag: "sub" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["sub", mergeAttributes(HTMLAttributes), 0];
  },
});

const iconButtonClass =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-[#6f5d78] transition hover:bg-violet-50 focus:outline-none focus:ring-4 focus:ring-violet-100";

function getButtonClass(isActive: boolean) {
  return `${iconButtonClass} ${
    isActive ? "border-violet-300 bg-violet-100 text-violet-700" : "border-slate-100 bg-white"
  }`;
}

export default function ReflectionEditor({
  clearVersion,
  initialHtml,
  insertRequest,
  onChange,
}: ReflectionEditorProps) {
  const handledInsertRequestId = useRef<number | null>(null);
  const handledClearVersion = useRef(clearVersion);
  const rememberedFontSelection = useRef<EditorSelectionRange | null>(null);
  const rememberedLineHeightSelection = useRef<EditorSelectionRange | null>(null);
  const rememberedColorSelection = useRef<EditorSelectionRange | null>(null);
  const colorPaletteRef = useRef<HTMLDivElement | null>(null);
  const fontMenuRef = useRef<HTMLDivElement | null>(null);
  const fontSizeMenuRef = useRef<HTMLDivElement | null>(null);
  const highlightPaletteRef = useRef<HTMLDivElement | null>(null);
  const lineHeightMenuRef = useRef<HTMLDivElement | null>(null);
  const [fontInput, setFontInput] = useState("");
  const [fontSearchQuery, setFontSearchQuery] = useState("");
  const [fontSizeInput, setFontSizeInput] = useState("");
  const [lineHeightInput, setLineHeightInput] = useState("");
  const [isColorPaletteOpen, setIsColorPaletteOpen] = useState(false);
  const [isFontMenuOpen, setIsFontMenuOpen] = useState(false);
  const [isFontSizeMenuOpen, setIsFontSizeMenuOpen] = useState(false);
  const [isHighlightPaletteOpen, setIsHighlightPaletteOpen] = useState(false);
  const [isLineHeightMenuOpen, setIsLineHeightMenuOpen] = useState(false);
  const [highlightColor, setHighlightColor] = useState("#fff59d");
  const [highlightOpacity, setHighlightOpacity] = useState(100);
  const [localFontFamilies, setLocalFontFamilies] = useState<string[]>(
    cachedLocalFontFamilies,
  );
  const [isLoadingFonts, setIsLoadingFonts] = useState(false);
  const [recentFontFamilies, setRecentFontFamilies] = useState<string[]>([]);
  const availableFontFamilies = useMemo(
    () =>
      Array.from(new Set([...COMMON_FONT_FAMILIES, ...localFontFamilies])).sort((a, b) =>
        a.localeCompare(b, "zh-Hans-CN", { numeric: true, sensitivity: "base" }),
      ),
    [localFontFamilies],
  );
  const fontMenuGroups = useMemo(() => {
    const normalizedQuery = fontSearchQuery.trim().toLocaleLowerCase("zh-Hans-CN");
    const matchesQuery = (family: string) =>
      !normalizedQuery || family.toLocaleLowerCase("zh-Hans-CN").includes(normalizedQuery);
    const uniqueFamilies = (families: string[]) => {
      const seen = new Set<string>();
      return families.filter((family) => {
        const key = family.toLocaleLowerCase("zh-Hans-CN");
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
    };
    const recent = uniqueFamilies(recentFontFamilies).filter(matchesQuery);
    const occupied = new Set(recent.map((family) => family.toLocaleLowerCase("zh-Hans-CN")));
    const common = uniqueFamilies(COMMON_FONT_FAMILIES).filter((family) => {
      const key = family.toLocaleLowerCase("zh-Hans-CN");
      if (occupied.has(key) || !matchesQuery(family)) {
        return false;
      }
      occupied.add(key);
      return true;
    });
    const local = uniqueFamilies(localFontFamilies).filter((family) => {
      const key = family.toLocaleLowerCase("zh-Hans-CN");
      if (occupied.has(key) || !matchesQuery(family)) {
        return false;
      }
      occupied.add(key);
      return true;
    });

    return [
      { families: recent, label: "最近使用" },
      { families: common, label: "常用字体" },
      { families: local, label: "本机字体" },
    ].filter((group) => group.families.length > 0);
  }, [fontSearchQuery, localFontFamilies, recentFontFamilies]);
  const editor = useEditor({
    content: initialHtml || "<p></p>",
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      BackgroundColor,
      FontFamily,
      FontSize,
      LetterSpacing,
      BlockLineHeight,
      BlockIndent,
      SuperscriptFormat,
      SubscriptFormat,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      ParagraphSpacing,
      Placeholder.configure({ placeholder: "写下今天的感受、收获或想调整的地方..." }),
      CharacterCount.configure({ limit: 20000 }),
    ],
    editorProps: {
      attributes: {
        "aria-label": "吾日三省吾身正文",
        class: "reflection-rich-editor-content",
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange(
        currentEditor.getText({ blockSeparator: "\n" }).slice(0, 20000),
        currentEditor.getHTML(),
      );
    },
    onCreate: ({ editor: currentEditor }) => {
      rememberedFontSelection.current = {
        from: currentEditor.state.selection.from,
        to: currentEditor.state.selection.to,
      };
      rememberedLineHeightSelection.current = {
        from: currentEditor.state.selection.from,
        to: currentEditor.state.selection.to,
      };
      rememberedColorSelection.current = {
        from: currentEditor.state.selection.from,
        to: currentEditor.state.selection.to,
      };
      setFontInput(getPrimaryFontFamily(currentEditor.getAttributes("textStyle").fontFamily));
      setFontSizeInput(
        String(Number.parseFloat(currentEditor.getAttributes("textStyle").fontSize ?? "") || ""),
      );
      setLineHeightInput(
        currentEditor.isActive("heading")
          ? currentEditor.getAttributes("heading").lineHeight ?? ""
          : currentEditor.getAttributes("paragraph").lineHeight ?? "",
      );
      const activeHighlight = parseCssColor(
        currentEditor.getAttributes("textStyle").backgroundColor,
      );
      if (activeHighlight) {
        setHighlightColor(activeHighlight.hex);
        setHighlightOpacity(activeHighlight.opacity);
      }
    },
    onSelectionUpdate: ({ editor: currentEditor }) => {
      rememberedFontSelection.current = {
        from: currentEditor.state.selection.from,
        to: currentEditor.state.selection.to,
      };
      rememberedLineHeightSelection.current = {
        from: currentEditor.state.selection.from,
        to: currentEditor.state.selection.to,
      };
      rememberedColorSelection.current = {
        from: currentEditor.state.selection.from,
        to: currentEditor.state.selection.to,
      };
      setFontInput(getPrimaryFontFamily(currentEditor.getAttributes("textStyle").fontFamily));
      setFontSizeInput(
        String(Number.parseFloat(currentEditor.getAttributes("textStyle").fontSize ?? "") || ""),
      );
      setLineHeightInput(
        currentEditor.isActive("heading")
          ? currentEditor.getAttributes("heading").lineHeight ?? ""
          : currentEditor.getAttributes("paragraph").lineHeight ?? "",
      );
      const activeHighlight = parseCssColor(
        currentEditor.getAttributes("textStyle").backgroundColor,
      );
      if (activeHighlight) {
        setHighlightColor(activeHighlight.hex);
        setHighlightOpacity(activeHighlight.opacity);
      }
    },
  });

  const rememberCurrentFontSelection = () => {
    if (!editor) {
      return;
    }

    rememberedFontSelection.current = {
      from: editor.state.selection.from,
      to: editor.state.selection.to,
    };
  };

  const rememberCurrentLineHeightSelection = () => {
    if (!editor) {
      return;
    }

    rememberedLineHeightSelection.current = {
      from: editor.state.selection.from,
      to: editor.state.selection.to,
    };
  };

  const rememberCurrentColorSelection = () => {
    if (!editor) {
      return;
    }

    rememberedColorSelection.current = {
      from: editor.state.selection.from,
      to: editor.state.selection.to,
    };
  };

  const applyFontFamily = (value: string) => {
    if (!editor) {
      return;
    }

    const family = value.trim();
    const documentSize = editor.state.doc.content.size;
    const maximumTextPosition = Math.max(1, documentSize - 1);
    const rememberedSelection = rememberedFontSelection.current ?? {
      from: editor.state.selection.from,
      to: editor.state.selection.to,
    };
    const selection = {
      from: Math.max(1, Math.min(rememberedSelection.from, maximumTextPosition)),
      to: Math.max(1, Math.min(rememberedSelection.to, maximumTextPosition)),
    };
    const command = editor.chain().focus().setTextSelection(selection);

    if (family) {
      command.setFontFamily(FONT_FAMILY_ALIASES[family] ?? family).run();
      setFontInput(getPrimaryFontFamily(FONT_FAMILY_ALIASES[family] ?? family));
      setRecentFontFamilies((currentFamilies) => [
        family,
        ...currentFamilies.filter(
          (currentFamily) =>
            currentFamily.localeCompare(family, undefined, { sensitivity: "base" }) !== 0,
        ),
      ].slice(0, 8));
    } else {
      command.unsetFontFamily().run();
      setFontInput("");
    }

    rememberedFontSelection.current = selection;
    setFontSearchQuery("");
    setIsFontMenuOpen(false);
  };

  const applyFontSize = (rawValue: string) => {
    if (!editor) {
      return;
    }

    const requestedValue = rawValue.trim();
    const numericValue = requestedValue ? Number(requestedValue) : null;

    if (
      numericValue !== null &&
      (!Number.isFinite(numericValue) || numericValue < 5 || numericValue > 96)
    ) {
      window.alert("请输入 5 到 96 之间的字号。");
      setFontSizeInput("");
      return;
    }

    const documentSize = editor.state.doc.content.size;
    const maximumTextPosition = Math.max(1, documentSize - 1);
    const rememberedSelection = rememberedFontSelection.current ?? {
      from: editor.state.selection.from,
      to: editor.state.selection.to,
    };
    const selection = {
      from: Math.max(1, Math.min(rememberedSelection.from, maximumTextPosition)),
      to: Math.max(1, Math.min(rememberedSelection.to, maximumTextPosition)),
    };
    const command = editor.chain().focus().setTextSelection(selection);

    if (numericValue === null) {
      command.unsetFontSize().run();
      setFontSizeInput("");
    } else {
      const normalizedValue = Math.round(numericValue * 10) / 10;
      command.setFontSize(`${normalizedValue}px`).run();
      setFontSizeInput(String(normalizedValue));
    }

    rememberedFontSelection.current = selection;
    setIsFontSizeMenuOpen(false);
  };

  const applyLineHeight = (rawValue: string) => {
    if (!editor) {
      return;
    }

    const requestedValue = rawValue.trim().replace(",", ".");
    const numericValue = requestedValue ? Number(requestedValue) : null;

    if (
      numericValue !== null &&
      (!Number.isFinite(numericValue) || numericValue < 0.5 || numericValue > 5)
    ) {
      window.alert("请输入 0.5 到 5 之间的行距倍数。");
      setLineHeightInput("");
      return;
    }

    const normalizedValue =
      numericValue === null ? null : String(Math.round(numericValue * 100) / 100);
    const documentSize = editor.state.doc.content.size;
    const maximumTextPosition = Math.max(1, documentSize - 1);
    const rememberedSelection = rememberedLineHeightSelection.current ?? {
      from: editor.state.selection.from,
      to: editor.state.selection.to,
    };
    const selection = {
      from: Math.max(1, Math.min(rememberedSelection.from, maximumTextPosition)),
      to: Math.max(1, Math.min(rememberedSelection.to, maximumTextPosition)),
    };

    editor
      .chain()
      .focus()
      .setTextSelection(selection)
      .updateAttributes("paragraph", { lineHeight: normalizedValue })
      .updateAttributes("heading", { lineHeight: normalizedValue })
      .run();

    rememberedLineHeightSelection.current = selection;
    setLineHeightInput(normalizedValue ?? "");
    setIsLineHeightMenuOpen(false);
  };

  const applyTextColor = (color: string | null) => {
    if (!editor) {
      return;
    }

    const documentSize = editor.state.doc.content.size;
    const maximumTextPosition = Math.max(1, documentSize - 1);
    const rememberedSelection = rememberedColorSelection.current ?? {
      from: editor.state.selection.from,
      to: editor.state.selection.to,
    };
    const selection = {
      from: Math.max(1, Math.min(rememberedSelection.from, maximumTextPosition)),
      to: Math.max(1, Math.min(rememberedSelection.to, maximumTextPosition)),
    };
    const command = editor.chain().focus().setTextSelection(selection);

    if (color) {
      command.setColor(color).run();
    } else {
      command.unsetColor().run();
    }

    rememberedColorSelection.current = selection;
    setIsColorPaletteOpen(false);
  };

  const applyTextHighlight = (color: string | null, restoreEditorFocus = true) => {
    if (!editor) {
      return;
    }

    const documentSize = editor.state.doc.content.size;
    const maximumTextPosition = Math.max(1, documentSize - 1);
    const rememberedSelection = rememberedColorSelection.current ?? {
      from: editor.state.selection.from,
      to: editor.state.selection.to,
    };
    const selection = {
      from: Math.max(1, Math.min(rememberedSelection.from, maximumTextPosition)),
      to: Math.max(1, Math.min(rememberedSelection.to, maximumTextPosition)),
    };
    let command = editor.chain();
    if (restoreEditorFocus) {
      command = command.focus();
    }
    command = command.setTextSelection(selection);

    if (color) {
      command.setBackgroundColor(color).run();
    } else {
      command.unsetBackgroundColor().run();
    }

    rememberedColorSelection.current = selection;
  };

  const loadLocalFonts = async () => {
    const queryLocalFonts = (window as LocalFontWindow).queryLocalFonts;
    if (!queryLocalFonts) {
      window.alert(
        "当前浏览器不支持读取本机字体。你仍可在字体框中直接输入电脑里的字体名称后按回车使用。",
      );
      return;
    }

    setIsLoadingFonts(true);
    try {
      const fonts = await queryLocalFonts.call(window);
      const families = Array.from(
        new Set(
          fonts
            .map((font) => font.family?.trim())
            .filter((family): family is string => Boolean(family)),
        ),
      ).sort((a, b) =>
        a.localeCompare(b, "zh-Hans-CN", { numeric: true, sensitivity: "base" }),
      );

      cachedLocalFontFamilies = families;
      setLocalFontFamilies(families);
      if (families.length === 0) {
        window.alert("没有读取到本机字体，请检查浏览器的字体访问权限后重试。");
      }
    } catch (error) {
      console.warn("Unable to read local fonts", error);
      window.alert("未能读取本机字体。请允许浏览器访问字体后，再点击刷新按钮重试。");
    } finally {
      setIsLoadingFonts(false);
    }
  };

  useEffect(() => {
    if (
      !isColorPaletteOpen &&
      !isFontMenuOpen &&
      !isFontSizeMenuOpen &&
      !isHighlightPaletteOpen &&
      !isLineHeightMenuOpen
    ) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) {
        return;
      }
      if (colorPaletteRef.current && !colorPaletteRef.current.contains(event.target)) {
        setIsColorPaletteOpen(false);
      }
      if (fontMenuRef.current && !fontMenuRef.current.contains(event.target)) {
        setIsFontMenuOpen(false);
      }
      if (fontSizeMenuRef.current && !fontSizeMenuRef.current.contains(event.target)) {
        setIsFontSizeMenuOpen(false);
      }
      if (
        highlightPaletteRef.current &&
        !highlightPaletteRef.current.contains(event.target)
      ) {
        setIsHighlightPaletteOpen(false);
      }
      if (
        lineHeightMenuRef.current &&
        !lineHeightMenuRef.current.contains(event.target)
      ) {
        setIsLineHeightMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsColorPaletteOpen(false);
        setIsFontMenuOpen(false);
        setIsFontSizeMenuOpen(false);
        setIsHighlightPaletteOpen(false);
        setIsLineHeightMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    isColorPaletteOpen,
    isFontMenuOpen,
    isFontSizeMenuOpen,
    isHighlightPaletteOpen,
    isLineHeightMenuOpen,
  ]);

  useEffect(() => {
    if (!editor || !insertRequest || handledInsertRequestId.current === insertRequest.id) {
      return;
    }

    handledInsertRequestId.current = insertRequest.id;
    const nodes = insertRequest.text.split("\n").map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : [],
    }));

    editor.chain().focus("end").insertContent(nodes).run();
  }, [editor, insertRequest]);

  useEffect(() => {
    if (!editor || handledClearVersion.current === clearVersion) {
      return;
    }

    handledClearVersion.current = clearVersion;
    editor.commands.clearContent(true);
    editor.commands.focus();
  }, [clearVersion, editor]);

  if (!editor) {
    return <div className="min-h-[22rem] rounded-[1.1rem] bg-violet-50/50" />;
  }

  const activeBlock = editor.isActive("heading", { level: 1 })
    ? "h1"
    : editor.isActive("heading", { level: 2 })
      ? "h2"
      : editor.isActive("heading", { level: 3 })
        ? "h3"
        : "paragraph";
  const textStyleAttributes = editor.getAttributes("textStyle");
  const blockAttributes = editor.isActive("heading")
    ? editor.getAttributes("heading")
    : editor.getAttributes("paragraph");
  const currentColor = /^#[0-9a-f]{6}$/i.test(textStyleAttributes.color ?? "")
    ? textStyleAttributes.color
    : "#46394f";
  const activeBackgroundColor = parseCssColor(textStyleAttributes.backgroundColor);
  const currentBackgroundColor = activeBackgroundColor?.hex ?? highlightColor;
  const currentBackgroundOpacity = activeBackgroundColor?.opacity ?? highlightOpacity;
  const currentFontSize = Number.parseFloat(textStyleAttributes.fontSize ?? "") || 15;
  const currentFontSizeLabel = textStyleAttributes.fontSize
    ? FONT_SIZE_OPTIONS.find((option) => Math.abs(option.value - currentFontSize) < 0.06)?.label ??
      String(Math.round(currentFontSize * 10) / 10)
    : "字号";
  const currentLineHeight = Number.parseFloat(blockAttributes.lineHeight ?? "");
  const currentLineHeightLabel = Number.isFinite(currentLineHeight)
    ? LINE_HEIGHT_OPTIONS.find(
        (option) => Math.abs(option.value - currentLineHeight) < 0.006,
      )?.label ?? `${Math.round(currentLineHeight * 100) / 100} 倍`
    : "行距";

  const updateBlockAttribute = (attribute: string, value: string | null) => {
    const nodeType = editor.isActive("heading") ? "heading" : "paragraph";
    editor.chain().focus().updateAttributes(nodeType, { [attribute]: value }).run();
  };

  const adjustFontSize = (delta: number) => {
    const nextSize = Math.max(5, Math.min(96, Math.round(currentFontSize + delta)));
    editor.chain().focus().setFontSize(`${nextSize}px`).run();
    setFontSizeInput(String(nextSize));
  };

  const changeIndent = (delta: number) => {
    if (editor.isActive("listItem")) {
      if (delta > 0) {
        editor.chain().focus().sinkListItem("listItem").run();
      } else {
        editor.chain().focus().liftListItem("listItem").run();
      }
      return;
    }

    const currentIndent = Math.max(0, Number(blockAttributes.indentLevel) || 0);
    const nextIndent = Math.max(0, Math.min(8, currentIndent + delta));
    editor
      .chain()
      .focus()
      .updateAttributes("paragraph", { indentLevel: nextIndent })
      .updateAttributes("heading", { indentLevel: nextIndent })
      .run();
  };

  return (
    <div className="relative overflow-visible rounded-[1.1rem] border border-violet-100 bg-white focus-within:border-violet-300 focus-within:ring-4 focus-within:ring-violet-100">
      <div
        aria-label="正文格式工具栏"
        className="rounded-t-[1rem] border-b border-violet-100 bg-[#fbf9ff] p-2"
        role="toolbar"
      >
        <div className="flex flex-wrap items-center gap-1.5">
        <button
          aria-label="撤销"
          className={getButtonClass(false)}
          disabled={!editor.can().chain().focus().undo().run()}
          title="撤销"
          type="button"
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 size={16} />
        </button>
        <button
          aria-label="重做"
          className={getButtonClass(false)}
          disabled={!editor.can().chain().focus().redo().run()}
          title="重做"
          type="button"
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 size={16} />
        </button>

        <span className="mx-0.5 h-6 w-px bg-violet-100" />

        <select
          aria-label="段落格式"
          className="h-8 min-w-24 rounded-lg border border-slate-100 bg-white px-2 text-xs font-black text-[#6f5d78] outline-none focus:border-violet-300"
          title="段落格式"
          value={activeBlock}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "paragraph") {
              editor.chain().focus().setParagraph().run();
              return;
            }
            editor
              .chain()
              .focus()
              .setHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 })
              .run();
          }}
        >
          <option value="paragraph">正文</option>
          <option value="h1">标题 1</option>
          <option value="h2">标题 2</option>
          <option value="h3">标题 3</option>
        </select>

        <div ref={fontMenuRef} className="relative min-w-0 shrink-0">
          <button
            aria-expanded={isFontMenuOpen}
            aria-haspopup="listbox"
            aria-label="字体"
            className="inline-flex h-8 w-36 items-center justify-between rounded-lg border border-slate-100 bg-white px-3 text-xs font-black text-[#6f5d78] transition hover:border-violet-200 hover:bg-violet-50 focus:outline-none focus:ring-4 focus:ring-violet-100"
            style={{
              fontFamily: fontInput ? FONT_FAMILY_ALIASES[fontInput] ?? fontInput : undefined,
            }}
            title="选择字体"
            type="button"
            onClick={() => {
              const nextIsOpen = !isFontMenuOpen;
              setIsFontMenuOpen(nextIsOpen);
              setFontSearchQuery("");
              setIsFontSizeMenuOpen(false);
              setIsColorPaletteOpen(false);
              setIsHighlightPaletteOpen(false);
              setIsLineHeightMenuOpen(false);
              if (
                nextIsOpen &&
                localFontFamilies.length === 0 &&
                !isLoadingFonts &&
                Boolean((window as LocalFontWindow).queryLocalFonts)
              ) {
                void loadLocalFonts();
              }
            }}
            onPointerDown={rememberCurrentFontSelection}
          >
            <span className="truncate">{fontInput || "字体"}</span>
            <ChevronDown
              className={`shrink-0 transition ${isFontMenuOpen ? "rotate-180" : ""}`}
              size={14}
            />
          </button>

          {isFontMenuOpen && (
            <div className="absolute left-0 top-9 z-50 w-72 overflow-hidden rounded-lg border border-slate-200 bg-[#f8f7f9] shadow-xl">
              <div className="flex items-center gap-1.5 border-b border-slate-200 p-2">
                <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-slate-200 bg-white px-2 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100">
                  <Search className="shrink-0 text-[#6f5d78]" size={15} />
                  <input
                    aria-label="搜索字体"
                    autoFocus
                    className="min-w-0 flex-1 bg-transparent text-xs font-bold text-[#46394f] outline-none placeholder:text-[#a99caf]"
                    placeholder="输入字体名称"
                    spellCheck={false}
                    type="search"
                    value={fontSearchQuery}
                    onChange={(event) => setFontSearchQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" || !fontSearchQuery.trim()) {
                        return;
                      }
                      event.preventDefault();
                      const exactFamily = availableFontFamilies.find(
                        (family) =>
                          family.localeCompare(fontSearchQuery.trim(), undefined, {
                            sensitivity: "base",
                          }) === 0,
                      );
                      applyFontFamily(exactFamily ?? fontSearchQuery);
                    }}
                    onPointerDown={rememberCurrentFontSelection}
                  />
                </label>
                <button
                  aria-label={localFontFamilies.length > 0 ? "刷新本机字体" : "读取本机字体"}
                  className={getButtonClass(false)}
                  disabled={isLoadingFonts}
                  title={
                    localFontFamilies.length > 0
                      ? `已读取 ${localFontFamilies.length} 种本机字体，点击刷新`
                      : "读取电脑中已安装的全部字体"
                  }
                  type="button"
                  onClick={() => void loadLocalFonts()}
                >
                  <RefreshCw className={isLoadingFonts ? "animate-spin" : ""} size={15} />
                </button>
              </div>

              <div className="max-h-80 overflow-y-auto px-2 py-1.5" role="listbox">
                <button
                  aria-selected={!fontInput}
                  className={`flex h-7 w-full items-center justify-between rounded-md px-3 text-left text-xs transition hover:bg-violet-100 ${
                    !fontInput ? "bg-violet-100 font-black text-violet-800" : "text-[#46394f]"
                  }`}
                  role="option"
                  type="button"
                  onClick={() => applyFontFamily("")}
                >
                  <span>默认字体</span>
                  {!fontInput && <Check size={14} />}
                </button>

                {fontMenuGroups.map((group) => (
                  <section className="mt-1.5 border-t border-slate-200 pt-1.5" key={group.label}>
                    <p className="flex items-center gap-1 px-2 py-1 text-[11px] font-black text-[#928793]">
                      <ChevronDown size={12} />
                      {group.label}
                    </p>
                    {group.families.map((family) => {
                      const displayName = getPrimaryFontFamily(
                        FONT_FAMILY_ALIASES[family] ?? family,
                      );
                      const isActive =
                        Boolean(fontInput) &&
                        displayName.localeCompare(fontInput, undefined, {
                          sensitivity: "base",
                        }) === 0;
                      return (
                        <button
                          aria-selected={isActive}
                          className={`flex min-h-7 w-full items-center justify-between rounded-md px-3 py-1 text-left text-xs transition hover:bg-violet-100 ${
                            isActive
                              ? "bg-violet-100 font-black text-violet-800"
                              : "text-[#2f2935]"
                          }`}
                          key={`${group.label}-${family}`}
                          role="option"
                          style={{ fontFamily: FONT_FAMILY_ALIASES[family] ?? family }}
                          title={family}
                          type="button"
                          onClick={() => applyFontFamily(family)}
                        >
                          <span className="min-w-0 truncate">{displayName}</span>
                          {isActive && <Check className="shrink-0" size={14} />}
                        </button>
                      );
                    })}
                  </section>
                ))}

                {fontMenuGroups.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs font-bold text-[#928793]">
                    没有找到匹配的字体
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </div>

        <div ref={fontSizeMenuRef} className="relative shrink-0">
          <button
            aria-expanded={isFontSizeMenuOpen}
            aria-haspopup="listbox"
            aria-label="字号"
            className="inline-flex h-8 w-24 items-center justify-between rounded-lg border border-slate-100 bg-white px-3 text-xs font-black text-[#6f5d78] transition hover:border-violet-200 hover:bg-violet-50 focus:outline-none focus:ring-4 focus:ring-violet-100"
            title="选择字号"
            type="button"
            onClick={() => {
              setIsFontSizeMenuOpen((isOpen) => !isOpen);
              setIsFontMenuOpen(false);
              setIsColorPaletteOpen(false);
              setIsHighlightPaletteOpen(false);
              setIsLineHeightMenuOpen(false);
            }}
            onPointerDown={rememberCurrentFontSelection}
          >
            <span className="truncate">{currentFontSizeLabel}</span>
            <ChevronDown
              className={`shrink-0 transition ${isFontSizeMenuOpen ? "rotate-180" : ""}`}
              size={14}
            />
          </button>

          {isFontSizeMenuOpen && (
            <div className="absolute left-0 top-9 z-50 w-32 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
              <div className="max-h-72 overflow-y-auto py-1" role="listbox">
                {FONT_SIZE_OPTIONS.map((option, index) => {
                  const isActive = Math.abs(option.value - currentFontSize) < 0.06;
                  return (
                    <button
                      aria-selected={isActive}
                      className={`flex h-7 w-full items-center justify-between px-3 text-left text-xs transition hover:bg-violet-50 ${
                        isActive ? "bg-violet-600 font-black text-white hover:bg-violet-600" : "text-[#3f3547]"
                      }`}
                      key={`${option.label}-${option.value}-${index}`}
                      role="option"
                      type="button"
                      onClick={() => applyFontSize(String(option.value))}
                    >
                      <span>{option.label}</span>
                      {isActive && <Check size={14} />}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-1.5 border-t border-slate-100 bg-slate-50 p-2">
                <input
                  aria-label="自定义字号"
                  className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-center text-sm font-bold outline-none focus:border-violet-400"
                  inputMode="decimal"
                  placeholder="自定义"
                  type="text"
                  value={fontSizeInput}
                  onChange={(event) => setFontSizeInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") {
                      return;
                    }
                    event.preventDefault();
                    applyFontSize(event.currentTarget.value);
                  }}
                />
                <button
                  aria-label="应用自定义字号"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-violet-600 text-white hover:bg-violet-700"
                  title="应用字号"
                  type="button"
                  onClick={() => applyFontSize(fontSizeInput)}
                >
                  <Check size={15} />
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          aria-label="增大字号"
          className={getButtonClass(false)}
          title="增大字号"
          type="button"
          onClick={() => adjustFontSize(1)}
        >
          <AArrowUp size={16} />
        </button>
        <button
          aria-label="减小字号"
          className={getButtonClass(false)}
          title="减小字号"
          type="button"
          onClick={() => adjustFontSize(-1)}
        >
          <AArrowDown size={16} />
        </button>

        <div ref={colorPaletteRef} className="relative shrink-0">
          <button
            aria-expanded={isColorPaletteOpen}
            aria-haspopup="menu"
            aria-label="文字颜色"
            className="inline-flex h-8 w-10 items-center justify-center gap-0.5 rounded-lg border border-slate-100 bg-white transition hover:bg-violet-50 focus:outline-none focus:ring-4 focus:ring-violet-100"
            title="文字颜色"
            type="button"
            onClick={() => {
              setIsColorPaletteOpen((isOpen) => !isOpen);
              setIsFontMenuOpen(false);
              setIsFontSizeMenuOpen(false);
              setIsHighlightPaletteOpen(false);
              setIsLineHeightMenuOpen(false);
            }}
            onPointerDown={rememberCurrentColorSelection}
          >
            <Baseline size={17} style={{ color: currentColor }} />
            <ChevronDown className="text-[#8f7c97]" size={11} />
          </button>

          {isColorPaletteOpen && (
            <div
              aria-label="文字颜色面板"
              className="absolute left-0 top-10 z-50 w-[17.5rem] rounded-lg border border-slate-200 bg-white p-3 text-[#5e5166] shadow-xl"
              role="menu"
            >
              <button
                className="flex h-8 w-full items-center gap-2 rounded-md px-1.5 text-left text-sm font-bold hover:bg-slate-50"
                role="menuitem"
                type="button"
                onClick={() => applyTextColor(null)}
              >
                <span
                  aria-hidden="true"
                  className="h-5 w-5 border border-slate-300 bg-[#46394f]"
                />
                自动
              </button>

              <p className="mb-2 mt-3 text-xs font-black text-[#88778f]">主题颜色</p>
              <div className="grid grid-cols-10 gap-1.5">
                {THEME_COLOR_ROWS.flat().map((color, index) => (
                  <button
                    aria-label={`设置文字颜色 ${color}`}
                    aria-pressed={currentColor.toLowerCase() === color.toLowerCase()}
                    className={`h-5 w-5 border transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-violet-400 ${
                      currentColor.toLowerCase() === color.toLowerCase()
                        ? "border-violet-600 ring-2 ring-violet-300"
                        : "border-slate-200"
                    }`}
                    key={`${color}-${index}`}
                    role="menuitem"
                    style={{ backgroundColor: color }}
                    title={color}
                    type="button"
                    onClick={() => applyTextColor(color)}
                  />
                ))}
              </div>

              <p className="mb-2 mt-3 text-xs font-black text-[#88778f]">标准色</p>
              <div className="grid grid-cols-10 gap-1.5">
                {STANDARD_TEXT_COLORS.map((color) => (
                  <button
                    aria-label={`设置文字颜色 ${color}`}
                    aria-pressed={currentColor.toLowerCase() === color.toLowerCase()}
                    className={`h-5 w-5 border transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-violet-400 ${
                      currentColor.toLowerCase() === color.toLowerCase()
                        ? "border-violet-600 ring-2 ring-violet-300"
                        : "border-slate-200"
                    }`}
                    key={color}
                    role="menuitem"
                    style={{ backgroundColor: color }}
                    title={color}
                    type="button"
                    onClick={() => applyTextColor(color)}
                  />
                ))}
              </div>

              <label className="mt-3 flex h-9 cursor-pointer items-center gap-2 border-t border-slate-100 pt-3 text-sm font-bold hover:text-violet-700">
                <Palette size={17} />
                <span>更多颜色</span>
                <input
                  aria-label="选择更多文字颜色"
                  className="ml-auto h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
                  type="color"
                  value={currentColor}
                  onChange={(event) => applyTextColor(event.target.value)}
                  onPointerDown={rememberCurrentColorSelection}
                />
              </label>
            </div>
          )}
        </div>

        <div ref={highlightPaletteRef} className="relative shrink-0">
          <button
            aria-expanded={isHighlightPaletteOpen}
            aria-haspopup="menu"
            aria-label="文字高亮"
            aria-pressed={Boolean(textStyleAttributes.backgroundColor)}
            className={`inline-flex h-8 w-10 items-center justify-center gap-0.5 rounded-lg border border-slate-100 bg-white transition hover:bg-violet-50 focus:outline-none focus:ring-4 focus:ring-violet-100 ${
              textStyleAttributes.backgroundColor ? "bg-violet-100" : ""
            }`}
            title="文字高亮"
            type="button"
            onClick={() => {
              setIsHighlightPaletteOpen((isOpen) => !isOpen);
              setIsFontMenuOpen(false);
              setIsColorPaletteOpen(false);
              setIsFontSizeMenuOpen(false);
              setIsLineHeightMenuOpen(false);
            }}
            onPointerDown={rememberCurrentColorSelection}
          >
            <Highlighter size={16} style={{ color: currentBackgroundColor }} />
            <ChevronDown className="text-[#8f7c97]" size={11} />
          </button>

          {isHighlightPaletteOpen && (
            <div
              aria-label="文字高亮颜色面板"
              className="absolute left-0 top-10 z-50 w-[17.5rem] rounded-lg border border-slate-200 bg-white p-3 text-[#5e5166] shadow-xl"
              role="menu"
            >
              <button
                className="flex h-8 w-full items-center gap-2 rounded-md px-1.5 text-left text-sm font-bold hover:bg-slate-50"
                role="menuitem"
                type="button"
                onClick={() => {
                  applyTextHighlight(null);
                  setIsHighlightPaletteOpen(false);
                }}
              >
                <span
                  aria-hidden="true"
                  className="relative h-5 w-5 overflow-hidden border border-slate-300 bg-white after:absolute after:left-[-3px] after:top-2 after:h-px after:w-7 after:-rotate-45 after:bg-rose-500"
                />
                无高亮
              </button>

              <p className="mb-2 mt-3 text-xs font-black text-[#88778f]">主题颜色</p>
              <div className="grid grid-cols-10 gap-1.5">
                {THEME_COLOR_ROWS.flat().map((color, index) => (
                  <button
                    aria-label={`设置文字高亮 ${color}`}
                    aria-pressed={highlightColor.toLowerCase() === color.toLowerCase()}
                    className={`h-5 w-5 border transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-violet-400 ${
                      highlightColor.toLowerCase() === color.toLowerCase()
                        ? "border-violet-600 ring-2 ring-violet-300"
                        : "border-slate-200"
                    }`}
                    key={`highlight-${color}-${index}`}
                    role="menuitem"
                    style={{ backgroundColor: color }}
                    title={color}
                    type="button"
                    onClick={() => {
                      setHighlightColor(color);
                      applyTextHighlight(composeHighlightColor(color, highlightOpacity));
                    }}
                  />
                ))}
              </div>

              <p className="mb-2 mt-3 text-xs font-black text-[#88778f]">标准色</p>
              <div className="grid grid-cols-10 gap-1.5">
                {STANDARD_TEXT_COLORS.map((color) => (
                  <button
                    aria-label={`设置文字高亮 ${color}`}
                    aria-pressed={highlightColor.toLowerCase() === color.toLowerCase()}
                    className={`h-5 w-5 border transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-violet-400 ${
                      highlightColor.toLowerCase() === color.toLowerCase()
                        ? "border-violet-600 ring-2 ring-violet-300"
                        : "border-slate-200"
                    }`}
                    key={`highlight-${color}`}
                    role="menuitem"
                    style={{ backgroundColor: color }}
                    title={color}
                    type="button"
                    onClick={() => {
                      setHighlightColor(color);
                      applyTextHighlight(composeHighlightColor(color, highlightOpacity));
                    }}
                  />
                ))}
              </div>

              <div className="mt-3 border-t border-slate-100 pt-3">
                <div className="mb-2 flex items-center justify-between text-xs font-black text-[#88778f]">
                  <span>透明度</span>
                  <span>{highlightOpacity}%</span>
                </div>
                <input
                  aria-label="高亮透明度"
                  className="h-2 w-full cursor-pointer accent-violet-600"
                  max="100"
                  min="0"
                  step="5"
                  type="range"
                  value={highlightOpacity}
                  onChange={(event) => {
                    const opacity = Number(event.target.value);
                    setHighlightOpacity(opacity);
                    applyTextHighlight(composeHighlightColor(highlightColor, opacity), false);
                  }}
                  onPointerDown={rememberCurrentColorSelection}
                />
              </div>

              <label className="mt-3 flex h-9 cursor-pointer items-center gap-2 border-t border-slate-100 pt-3 text-sm font-bold hover:text-violet-700">
                <Palette size={17} />
                <span>更多颜色</span>
                <input
                  aria-label="选择更多文字高亮颜色"
                  className="ml-auto h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
                  type="color"
                  value={highlightColor}
                  onChange={(event) => {
                    const color = event.target.value;
                    setHighlightColor(color);
                    applyTextHighlight(composeHighlightColor(color, highlightOpacity));
                  }}
                  onPointerDown={rememberCurrentColorSelection}
                />
              </label>
            </div>
          )}
        </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-violet-100 pt-2">

        <span className="mx-0.5 h-6 w-px bg-violet-100" />

        <button
          aria-label="粗体"
          className={getButtonClass(editor.isActive("bold"))}
          title="粗体"
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={16} />
        </button>
        <button
          aria-label="斜体"
          className={getButtonClass(editor.isActive("italic"))}
          title="斜体"
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={16} />
        </button>
        <button
          aria-label="下划线"
          className={getButtonClass(editor.isActive("underline"))}
          title="下划线"
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <Underline size={16} />
        </button>
        <button
          aria-label="删除线"
          className={getButtonClass(editor.isActive("strike"))}
          title="删除线"
          type="button"
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough size={16} />
        </button>
        <button
          aria-label="上标"
          className={getButtonClass(editor.isActive("superscript"))}
          title="上标"
          type="button"
          onClick={() => editor.chain().focus().toggleMark("superscript").run()}
        >
          <Superscript size={16} />
        </button>
        <button
          aria-label="下标"
          className={getButtonClass(editor.isActive("subscript"))}
          title="下标"
          type="button"
          onClick={() => editor.chain().focus().toggleMark("subscript").run()}
        >
          <Subscript size={16} />
        </button>

        <span className="mx-0.5 h-6 w-px bg-violet-100" />

        <button
          aria-label="左对齐"
          className={getButtonClass(editor.isActive({ textAlign: "left" }))}
          title="左对齐"
          type="button"
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        >
          <AlignLeft size={16} />
        </button>
        <button
          aria-label="居中"
          className={getButtonClass(editor.isActive({ textAlign: "center" }))}
          title="居中"
          type="button"
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        >
          <AlignCenter size={16} />
        </button>
        <button
          aria-label="右对齐"
          className={getButtonClass(editor.isActive({ textAlign: "right" }))}
          title="右对齐"
          type="button"
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
        >
          <AlignRight size={16} />
        </button>
        <button
          aria-label="两端对齐"
          className={getButtonClass(editor.isActive({ textAlign: "justify" }))}
          title="两端对齐"
          type="button"
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
        >
          <AlignJustify size={16} />
        </button>
        <button
          aria-label="项目符号列表"
          className={getButtonClass(editor.isActive("bulletList"))}
          title="项目符号列表"
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={16} />
        </button>
        <button
          aria-label="编号列表"
          className={getButtonClass(editor.isActive("orderedList"))}
          title="编号列表"
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={16} />
        </button>
        <button
          aria-label="减少缩进"
          className={getButtonClass(false)}
          title="减少缩进"
          type="button"
          onClick={() => changeIndent(-1)}
        >
          <IndentDecrease size={16} />
        </button>
        <button
          aria-label="增加缩进"
          className={getButtonClass(false)}
          title="增加缩进"
          type="button"
          onClick={() => changeIndent(1)}
        >
          <IndentIncrease size={16} />
        </button>

        <span className="mx-0.5 h-6 w-px bg-violet-100" />

        <select
          aria-label="字符间距"
          className="h-8 w-24 rounded-lg border border-slate-100 bg-white px-2 text-xs font-black text-[#6f5d78] outline-none focus:border-violet-300"
          title="字符间距"
          value={textStyleAttributes.letterSpacing ?? ""}
          onChange={(event) => {
            const value = event.target.value;
            if (value) {
              editor.chain().focus().setMark("textStyle", { letterSpacing: value }).run();
            } else {
              editor
                .chain()
                .focus()
                .setMark("textStyle", { letterSpacing: null })
                .removeEmptyTextStyle()
                .run();
            }
          }}
        >
          <option value="">字符间距</option>
          <option value="0px">标准</option>
          <option value="0.5px">稍宽</option>
          <option value="1px">宽</option>
          <option value="2px">较宽</option>
          <option value="3px">很宽</option>
        </select>

        <div ref={lineHeightMenuRef} className="relative shrink-0">
          <button
            aria-expanded={isLineHeightMenuOpen}
            aria-haspopup="listbox"
            aria-label="行距"
            className="inline-flex h-8 w-28 items-center justify-between rounded-lg border border-slate-100 bg-white px-3 text-xs font-black text-[#6f5d78] transition hover:border-violet-200 hover:bg-violet-50 focus:outline-none focus:ring-4 focus:ring-violet-100"
            title="选择行距"
            type="button"
            onClick={() => {
              setIsLineHeightMenuOpen((isOpen) => !isOpen);
              setIsFontMenuOpen(false);
              setIsFontSizeMenuOpen(false);
              setIsColorPaletteOpen(false);
              setIsHighlightPaletteOpen(false);
            }}
            onPointerDown={rememberCurrentLineHeightSelection}
          >
            <span className="truncate">{currentLineHeightLabel}</span>
            <ChevronDown
              className={`shrink-0 transition ${isLineHeightMenuOpen ? "rotate-180" : ""}`}
              size={14}
            />
          </button>

          {isLineHeightMenuOpen && (
            <div className="absolute left-0 top-9 z-50 w-36 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
              <div className="max-h-72 overflow-y-auto py-1" role="listbox">
                <button
                  aria-selected={!Number.isFinite(currentLineHeight)}
                  className={`flex h-9 w-full items-center justify-between px-4 text-left text-sm transition hover:bg-violet-50 ${
                    !Number.isFinite(currentLineHeight)
                      ? "bg-violet-600 font-black text-white hover:bg-violet-600"
                      : "text-[#3f3547]"
                  }`}
                  role="option"
                  type="button"
                  onClick={() => applyLineHeight("")}
                >
                  <span>默认行距</span>
                  {!Number.isFinite(currentLineHeight) && <Check size={14} />}
                </button>
                {LINE_HEIGHT_OPTIONS.map((option) => {
                  const isActive = Math.abs(option.value - currentLineHeight) < 0.006;
                  return (
                    <button
                      aria-selected={isActive}
                      className={`flex h-9 w-full items-center justify-between px-4 text-left text-sm transition hover:bg-violet-50 ${
                        isActive
                          ? "bg-violet-600 font-black text-white hover:bg-violet-600"
                          : "text-[#3f3547]"
                      }`}
                      key={option.value}
                      role="option"
                      type="button"
                      onClick={() => applyLineHeight(String(option.value))}
                    >
                      <span>{option.label}</span>
                      {isActive && <Check size={14} />}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-1.5 border-t border-slate-100 bg-slate-50 p-2">
                <input
                  aria-label="自定义行距"
                  className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-center text-sm font-bold outline-none focus:border-violet-400"
                  inputMode="decimal"
                  placeholder="0.5–5"
                  type="text"
                  value={lineHeightInput}
                  onChange={(event) => setLineHeightInput(event.target.value)}
                  onFocus={rememberCurrentLineHeightSelection}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") {
                      return;
                    }
                    event.preventDefault();
                    applyLineHeight(event.currentTarget.value);
                  }}
                  onPointerDown={rememberCurrentLineHeightSelection}
                />
                <button
                  aria-label="应用自定义行距"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-violet-600 text-white hover:bg-violet-700"
                  title="应用行距"
                  type="button"
                  onClick={() => applyLineHeight(lineHeightInput)}
                >
                  <Check size={15} />
                </button>
              </div>
            </div>
          )}
        </div>

        <select
          aria-label="段间距"
          className="h-8 w-24 rounded-lg border border-slate-100 bg-white px-2 text-xs font-black text-[#6f5d78] outline-none focus:border-violet-300"
          title="段间距"
          value={blockAttributes.paragraphSpacing ?? ""}
          onChange={(event) =>
            updateBlockAttribute("paragraphSpacing", event.target.value || null)
          }
        >
          <option value="">段距</option>
          <option value="0px">无</option>
          <option value="8px">小</option>
          <option value="16px">中</option>
          <option value="24px">大</option>
        </select>

        <span className="mx-0.5 h-6 w-px bg-violet-100" />

        <button
          aria-label="清除格式"
          className={getButtonClass(false)}
          title="清除格式"
          type="button"
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
        >
          <RemoveFormatting size={16} />
        </button>
      </div>
      </div>

      <EditorContent className="reflection-rich-editor" editor={editor} />
    </div>
  );
}
