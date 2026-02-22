import { createRoute, Link } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { useState, useCallback, useRef, useEffect } from "react";
import {
    ArrowLeft,
    Download,
    Copy,
    Check,
    AlertCircle,
    Loader2,
    ImageIcon,
    X,
    ChevronDown,
    ChevronUp,
    Sliders,
    TriangleAlert,
    Sparkles,
} from "lucide-react";

export const pngConverterRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/png-converter",
    component: PngConverterPage,
});

export const Route = pngConverterRoute;

type ConvertStatus = "idle" | "loading" | "success" | "error";

interface VtracerConfig {
    color_mode: "color" | "bw";
    mode: "pixel" | "polygon" | "spline";
    filter_speckle: number;
    color_precision: number;
    layer_difference: number;
    corner_threshold: number;
    length_threshold: number;
    splice_threshold: number;
    path_precision: number;
}

interface ImageAnalysis {
    colorDiversity: number; // 0–1
    edgeDensity: number; // 0–1
    type: "photo" | "illustration" | "lineart";
}

type PresetKey = "auto" | "spline" | "detailed" | "simplified" | "polygon" | "bw";

interface Preset {
    key: PresetKey;
    label: string;
    desc: string;
    config: Partial<VtracerConfig>;
}

// ── Image analysis ──────────────────────────────────────────────────────────

function analyzeImage(imageData: ImageData): ImageAnalysis {
    const { data, width, height } = imageData;
    const step = Math.max(1, Math.round(Math.sqrt((width * height) / 5000)));

    const colorSet = new Set<number>();
    let edgePixels = 0;
    let totalSamples = 0;

    for (let y = step; y < height - step; y += step) {
        for (let x = step; x < width - step; x += step) {
            const i = (y * width + x) * 4;
            // 32-level quantization per channel (0-31) for color diversity
            const r = data[i] >> 3;
            const g = data[i + 1] >> 3;
            const b = data[i + 2] >> 3;
            colorSet.add((r << 10) | (g << 5) | b);

            // Edge detection: compare to right and bottom neighbours
            const ir = (y * width + x + step) * 4;
            const ib = ((y + step) * width + x) * 4;
            const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
            const lumR = (data[ir] + data[ir + 1] + data[ir + 2]) / 3;
            const lumB = (data[ib] + data[ib + 1] + data[ib + 2]) / 3;
            if (Math.abs(lum - lumR) > 25 || Math.abs(lum - lumB) > 25)
                edgePixels++;
            totalSamples++;
        }
    }

    // Max possible at 32-level quant: 32³ = 32768; normalize against 2000 distinct colors
    const colorDiversity = Math.min(1, colorSet.size / 2000);
    const edgeDensity = totalSamples > 0 ? edgePixels / totalSamples : 0;

    let type: ImageAnalysis["type"];
    if (colorDiversity > 0.4) {
        type = "photo";
    } else if (colorDiversity < 0.1 && edgeDensity > 0.15) {
        type = "lineart";
    } else {
        type = "illustration";
    }

    return { colorDiversity, edgeDensity, type };
}

function autoTuneConfig(analysis: ImageAnalysis): VtracerConfig {
    const { type, colorDiversity, edgeDensity } = analysis;

    if (type === "photo") {
        return {
            color_mode: "color",
            mode: "spline",
            filter_speckle: Math.round(4 + edgeDensity * 10),
            color_precision: Math.max(3, Math.round(6 - colorDiversity * 3)),
            layer_difference: Math.round(16 + colorDiversity * 24),
            corner_threshold: 60,
            length_threshold: parseFloat((4.0 + edgeDensity * 2.0).toFixed(1)),
            splice_threshold: 45,
            path_precision: 2,
        };
    }
    if (type === "lineart") {
        return {
            color_mode: "bw",
            mode: "spline",
            filter_speckle: 2,
            color_precision: 6,
            layer_difference: 0,
            corner_threshold: 45,
            length_threshold: 3.5,
            splice_threshold: 30,
            path_precision: 3,
        };
    }
    // illustration
    return {
        color_mode: "color",
        mode: "spline",
        filter_speckle: 4,
        color_precision: 6,
        layer_difference: 16,
        corner_threshold: 60,
        length_threshold: 4.0,
        splice_threshold: 45,
        path_precision: 3,
    };
}

// ── Background removal ───────────────────────────────────────────────────────

function removeBackground(imageData: ImageData, tolerance: number): void {
    const { data, width, height } = imageData;

    // Average the four corner colors to estimate the background color
    const sample = (x: number, y: number) => {
        const i = (y * width + x) * 4;
        return [data[i], data[i + 1], data[i + 2]];
    };
    const corners = [
        sample(0, 0),
        sample(width - 1, 0),
        sample(0, height - 1),
        sample(width - 1, height - 1),
    ];
    const bgR = Math.round(corners.reduce((s, c) => s + c[0], 0) / 4);
    const bgG = Math.round(corners.reduce((s, c) => s + c[1], 0) / 4);
    const bgB = Math.round(corners.reduce((s, c) => s + c[2], 0) / 4);
    const tolSq = tolerance * tolerance;

    const visited = new Uint8Array(width * height);
    const stack: number[] = [];

    // Seed from all edge pixels
    for (let x = 0; x < width; x++) {
        stack.push(x);
        stack.push(x + (height - 1) * width);
    }
    for (let y = 1; y < height - 1; y++) {
        stack.push(y * width);
        stack.push(width - 1 + y * width);
    }

    while (stack.length > 0) {
        const idx = stack.pop()!;
        if (visited[idx]) continue;
        visited[idx] = 1;

        const pi = idx * 4;
        const dr = data[pi] - bgR;
        const dg = data[pi + 1] - bgG;
        const db = data[pi + 2] - bgB;
        if (dr * dr + dg * dg + db * db > tolSq) continue;

        data[pi + 3] = 0; // transparent

        const x = idx % width;
        const y = (idx / width) | 0;
        if (x > 0) stack.push(idx - 1);
        if (x < width - 1) stack.push(idx + 1);
        if (y > 0) stack.push(idx - width);
        if (y < height - 1) stack.push(idx + width);
    }
}

// ── Posterization ───────────────────────────────────────────────────────────

function posterizeImageData(imageData: ImageData, levels: number): void {
    if (levels < 2) return;
    const data = imageData.data;
    const factor = 255 / (levels - 1);
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue; // skip transparent (BG-removed) pixels
        data[i] = Math.round(Math.round(data[i] / factor) * factor);
        data[i + 1] = Math.round(Math.round(data[i + 1] / factor) * factor);
        data[i + 2] = Math.round(Math.round(data[i + 2] / factor) * factor);
    }
}

// ── Color palette merging ────────────────────────────────────────────────────

function mergeCloseColors(
    svgString: string,
    threshold: number
): { svg: string; merged: number } {
    const hexToRgb = (h: string): [number, number, number] => [
        parseInt(h.slice(1, 3), 16),
        parseInt(h.slice(3, 5), 16),
        parseInt(h.slice(5, 7), 16),
    ];
    const dist = (a: string, b: string) => {
        const [ar, ag, ab] = hexToRgb(a);
        const [br, bg, bb] = hexToRgb(b);
        return Math.sqrt((ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2);
    };

    const colorSet = new Set<string>();
    const fillRe = /fill="(#[0-9a-fA-F]{6})"/gi;
    let m: RegExpExecArray | null;
    while ((m = fillRe.exec(svgString)) !== null) colorSet.add(m[1].toLowerCase());
    const colors = Array.from(colorSet);

    // Greedy clustering: first-seen color becomes canonical for its neighbourhood
    const canonical = new Map<string, string>();
    for (const color of colors) {
        if (canonical.has(color)) continue;
        canonical.set(color, color);
        for (const other of colors) {
            if (!canonical.has(other) && dist(color, other) <= threshold)
                canonical.set(other, color);
        }
    }

    const mergedCount = Array.from(canonical.entries()).filter(
        ([k, v]) => k !== v
    ).length;

    const svg = svgString.replace(
        /fill="(#[0-9a-fA-F]{6})"/gi,
        (_, c) => `fill="${canonical.get(c.toLowerCase()) ?? c}"`
    );
    return { svg, merged: mergedCount };
}

// ── Tiny path removal ────────────────────────────────────────────────────────

function removeTinyPaths(
    svgString: string,
    minLen: number
): { svg: string; removed: number } {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, "image/svg+xml");
    const svgEl = doc.querySelector("svg");
    if (!svgEl) return { svg: svgString, removed: 0 };

    let removed = 0;
    for (const path of Array.from(svgEl.querySelectorAll("path"))) {
        try {
            if ((path as SVGPathElement).getTotalLength() < minLen) {
                path.remove();
                removed++;
            }
        } catch {
            // Degenerate path — remove it
            path.remove();
            removed++;
        }
    }
    return { svg: new XMLSerializer().serializeToString(svgEl), removed };
}

// ── Presets ─────────────────────────────────────────────────────────────────

const PRESETS: Preset[] = [
    {
        key: "auto",
        label: "Auto",
        desc: "Analyzes color diversity and edge density to pick optimal settings",
        config: {},
    },
    {
        key: "spline",
        label: "Spline",
        desc: "Smooth curves — best general-purpose quality",
        config: {
            mode: "spline",
            color_mode: "color",
            color_precision: 6,
            filter_speckle: 4,
            layer_difference: 16,
            corner_threshold: 60,
            length_threshold: 4.0,
            splice_threshold: 45,
            path_precision: 3,
        },
    },
    {
        key: "detailed",
        label: "Detailed",
        desc: "More paths and colors — preserves fine detail",
        config: {
            mode: "spline",
            color_mode: "color",
            color_precision: 8,
            filter_speckle: 1,
            layer_difference: 4,
            corner_threshold: 45,
            length_threshold: 3.5,
            splice_threshold: 30,
            path_precision: 4,
        },
    },
    {
        key: "simplified",
        label: "Simplified",
        desc: "Fewer, larger paths — compact file size",
        config: {
            mode: "spline",
            color_mode: "color",
            color_precision: 4,
            filter_speckle: 8,
            layer_difference: 32,
            corner_threshold: 90,
            length_threshold: 6.0,
            splice_threshold: 60,
            path_precision: 2,
        },
    },
    {
        key: "polygon",
        label: "Polygon",
        desc: "Hard geometric edges — no curve fitting",
        config: {
            mode: "polygon",
            color_mode: "color",
            color_precision: 6,
            filter_speckle: 4,
            layer_difference: 16,
            corner_threshold: 60,
            length_threshold: 4.0,
            splice_threshold: 45,
            path_precision: 3,
        },
    },
    {
        key: "bw",
        label: "B&W",
        desc: "Binary output — ideal for logos and line art",
        config: {
            mode: "spline",
            color_mode: "bw",
            filter_speckle: 2,
            layer_difference: 0,
            corner_threshold: 60,
            length_threshold: 4.0,
            splice_threshold: 45,
            path_precision: 3,
        },
    },
];

const DEFAULT_CONFIG: VtracerConfig = { ...PRESETS[1].config } as VtracerConfig;

const SLIDERS: {
    key: keyof VtracerConfig;
    label: string;
    min: number;
    max: number;
    step: number;
    hint: string;
}[] = [
    {
        key: "filter_speckle",
        label: "Noise filter",
        min: 0,
        max: 16,
        step: 1,
        hint: "Discard clusters smaller than this (pixels) — removes noise",
    },
    {
        key: "color_precision",
        label: "Color precision",
        min: 1,
        max: 8,
        step: 1,
        hint: "Color quantization depth — higher = more distinct colors",
    },
    {
        key: "layer_difference",
        label: "Layer difference",
        min: 0,
        max: 64,
        step: 1,
        hint: "Brightness gap between stacked layers",
    },
    {
        key: "corner_threshold",
        label: "Corner sharpness",
        min: 1,
        max: 180,
        step: 1,
        hint: "Angle threshold for corners (degrees) — lower = preserve more corners",
    },
    {
        key: "length_threshold",
        label: "Segment length",
        min: 3.5,
        max: 10,
        step: 0.5,
        hint: "Target segment length — lower = more segments, more detail",
    },
    {
        key: "splice_threshold",
        label: "Splice threshold",
        min: 0,
        max: 180,
        step: 1,
        hint: "Angle for merging adjacent path segments",
    },
];

const MAX_TRACE_DIM = 2500;

function formatBytes(bytes: number) {
    if (bytes === 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// Cache the WASM init promise so we only call it once across converts
let wasmInitPromise: Promise<void> | null = null;

async function getVtracerModule() {
    const mod = await import("../wasm/vtracer/vtracer_wasm.js");
    if (!wasmInitPromise) {
        wasmInitPromise = mod.default().then(() => {});
    }
    await wasmInitPromise;
    return mod;
}

const ANALYSIS_LABELS: Record<
    ImageAnalysis["type"],
    { badge: string; desc: string; color: string }
> = {
    photo: {
        badge: "PHOTO",
        desc: "dense color regions — noise filtered, colors reduced",
        color: "bg-blue-500/20 text-blue-400",
    },
    illustration: {
        badge: "ILLUSTRATION",
        desc: "balanced rendering — standard smooth curves",
        color: "bg-emerald-500/20 text-emerald-400",
    },
    lineart: {
        badge: "LINE ART",
        desc: "crisp edges — switched to B&W spline mode",
        color: "bg-purple-500/20 text-purple-400",
    },
};

function PngConverterPage() {
    const [imageSrc, setImageSrc] = useState("");
    const [imageName, setImageName] = useState("");
    const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null);
    const [svg, setSvg] = useState("");
    const [svgByteSize, setSvgByteSize] = useState(0);
    const [svgRawByteSize, setSvgRawByteSize] = useState(0);
    const [error, setError] = useState("");
    const [status, setStatus] = useState<ConvertStatus>("idle");
    const [copied, setCopied] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [selectedPreset, setSelectedPreset] = useState<PresetKey>("auto");
    const [useCustom, setUseCustom] = useState(false);
    const [showCustomSliders, setShowCustomSliders] = useState(false);
    const [config, setConfig] = useState<VtracerConfig>(DEFAULT_CONFIG);
    const [posterizeLevels, setPosterizeLevels] = useState(0); // 0 = off
    const [removeBg, setRemoveBg] = useState(false);
    const [bgTolerance, setBgTolerance] = useState(30);
    const [enhanceImage, setEnhanceImage] = useState(false);
    const [contrastBoost, setContrastBoost] = useState(130); // CSS %
    const [colorMerge, setColorMerge] = useState(false);
    const [colorMergeThreshold, setColorMergeThreshold] = useState(20);
    const [removeTiny, setRemoveTiny] = useState(false);
    const [minPathLen, setMinPathLen] = useState(8); // SVG units
    const [colorsMerged, setColorsMerged] = useState(0);
    const [pathsRemoved, setPathsRemoved] = useState(0);
    const [imageAnalysis, setImageAnalysis] = useState<ImageAnalysis | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const dropZoneRef = useRef<HTMLDivElement>(null);

    // Run image analysis whenever the source image changes
    useEffect(() => {
        if (!imageSrc) {
            setImageAnalysis(null);
            return;
        }
        let cancelled = false;
        const img = new Image();
        img.onload = () => {
            if (cancelled) return;
            const maxDim = 500;
            let w = img.naturalWidth;
            let h = img.naturalHeight;
            if (Math.max(w, h) > maxDim) {
                const r = maxDim / Math.max(w, h);
                w = Math.round(w * r);
                h = Math.round(h * r);
            }
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(img, 0, 0, w, h);
            const data = ctx.getImageData(0, 0, w, h);
            if (!cancelled) setImageAnalysis(analyzeImage(data));
        };
        img.src = imageSrc;
        return () => {
            cancelled = true;
        };
    }, [imageSrc]);

    const loadFile = useCallback((file: File) => {
        if (!file.type.startsWith("image/")) {
            setError("Please select an image file (PNG, JPG, WebP, GIF…).");
            return;
        }
        setError("");
        setSvg("");
        setSvgByteSize(0);
        setSvgRawByteSize(0);
        setStatus("idle");
        setImageName(file.name);

        const reader = new FileReader();
        reader.onload = (e) => {
            const src = e.target?.result as string;
            setImageSrc(src);
            const img = new Image();
            img.onload = () =>
                setImageDims({ w: img.naturalWidth, h: img.naturalHeight });
            img.src = src;
        };
        reader.readAsDataURL(file);
    }, []);

    const clearImage = useCallback(() => {
        setImageSrc("");
        setImageName("");
        setImageDims(null);
        setSvg("");
        setSvgByteSize(0);
        setSvgRawByteSize(0);
        setStatus("idle");
        setError("");
        setImageAnalysis(null);
        setRemoveBg(false);
        setColorsMerged(0);
        setPathsRemoved(0);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }, []);

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) loadFile(file);
        },
        [loadFile]
    );

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        if (!dropZoneRef.current?.contains(e.relatedTarget as Node)) {
            setIsDragging(false);
        }
    }, []);

    const handleFileInput = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (file) loadFile(file);
        },
        [loadFile]
    );

    const handleConvert = useCallback(async () => {
        if (!imageSrc) return;
        setError("");
        setStatus("loading");
        setSvg("");

        try {
            const vtracer = await getVtracerModule();

            const img = new Image();
            await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () => reject(new Error("Could not load image."));
                img.src = imageSrc;
            });

            let drawW = img.naturalWidth;
            let drawH = img.naturalHeight;
            const maxDim = Math.max(drawW, drawH);
            if (maxDim > MAX_TRACE_DIM) {
                const ratio = MAX_TRACE_DIM / maxDim;
                drawW = Math.round(drawW * ratio);
                drawH = Math.round(drawH * ratio);
            }

            const canvas = document.createElement("canvas");
            canvas.width = drawW;
            canvas.height = drawH;
            const ctx = canvas.getContext("2d")!;
            // Contrast + saturation boost (applied at draw time via canvas filter)
            if (enhanceImage) {
                ctx.filter = `contrast(${contrastBoost}%) saturate(110%)`;
            }
            ctx.drawImage(img, 0, 0, drawW, drawH);
            ctx.filter = "none";
            const imageData = ctx.getImageData(0, 0, drawW, drawH);

            // Background removal (runs before posterize so BG pixels are
            // already transparent when posterize skips them)
            if (removeBg) {
                removeBackground(imageData, bgTolerance);
            }

            // Posterize pre-processing
            if (posterizeLevels >= 2) {
                posterizeImageData(imageData, posterizeLevels);
            }

            // Determine active config (auto-tune uses current analysis)
            let activeConfig: VtracerConfig;
            if (useCustom) {
                activeConfig = config;
            } else if (selectedPreset === "auto") {
                const analysis = imageAnalysis ?? analyzeImage(imageData);
                setImageAnalysis(analysis);
                activeConfig = autoTuneConfig(analysis);
            } else {
                activeConfig = PRESETS.find((p) => p.key === selectedPreset)!
                    .config as VtracerConfig;
            }

            // Yield to the event loop so the loading spinner renders
            await new Promise((r) => setTimeout(r, 20));

            const svgRaw = vtracer.trace(
                new Uint8Array(imageData.data.buffer),
                drawW,
                drawH,
                JSON.stringify(activeConfig)
            );

            const rawSize = new Blob([svgRaw]).size;
            setSvgRawByteSize(rawSize);

            // Color palette merging (pre-SVGO so mergePaths benefits)
            let processed = svgRaw;
            if (colorMerge) {
                const { svg: cm, merged } = mergeCloseColors(
                    processed,
                    colorMergeThreshold
                );
                processed = cm;
                setColorsMerged(merged);
            } else {
                setColorsMerged(0);
            }

            // Thin path removal
            if (removeTiny) {
                const { svg: rt, removed } = removeTinyPaths(
                    processed,
                    minPathLen
                );
                processed = rt;
                setPathsRemoved(removed);
            } else {
                setPathsRemoved(0);
            }

            // SVGO post-processing
            const { optimize } = await import("svgo/browser");
            const result = optimize(processed, {
                multipass: true,
                plugins: [
                    {
                        name: "preset-default",
                        params: {
                            overrides: {
                                cleanupNumericValues: { floatPrecision: 2 },
                                convertPathData: { floatPrecision: 2 },
                            },
                        },
                    },
                    "mergePaths",
                ],
            });
            const svgString = result.data;

            setSvg(svgString);
            setSvgByteSize(new Blob([svgString]).size);
            setStatus("success");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Conversion failed.");
            setStatus("error");
        }
    }, [imageSrc, useCustom, selectedPreset, config, posterizeLevels, removeBg, bgTolerance, enhanceImage, contrastBoost, colorMerge, colorMergeThreshold, removeTiny, minPathLen, imageAnalysis]);

    const handleCopy = useCallback(async () => {
        if (!svg) return;
        await navigator.clipboard.writeText(svg);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [svg]);

    const handleDownload = useCallback(() => {
        if (!svg) return;
        const blob = new Blob([svg], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const baseName = imageName.replace(/\.[^.]+$/, "") || "traced";
        a.download = `${baseName}.svg`;
        a.click();
        URL.revokeObjectURL(url);
    }, [svg, imageName]);

    const [svgPreviewUrl, setSvgPreviewUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!svg) {
            setSvgPreviewUrl(null);
            return;
        }
        const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
        setSvgPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [svg]);

    const willDownscale =
        imageDims && Math.max(imageDims.w, imageDims.h) > MAX_TRACE_DIM;

    const svgReduction =
        svgRawByteSize > 0 && svgByteSize < svgRawByteSize
            ? Math.round((1 - svgByteSize / svgRawByteSize) * 100)
            : 0;

    return (
        <div className="min-h-screen pt-24 px-4 pb-16">
            <div className="max-w-5xl mx-auto">
                {/* Back link */}
                <div className="mb-6">
                    <Link
                        to="/"
                        className="inline-flex items-center gap-2 text-zinc-400 hover:text-cyan-500 transition-colors group"
                    >
                        <ArrowLeft
                            size={20}
                            className="group-hover:-translate-x-1 transition-transform"
                        />
                        <span className="font-mono text-sm">BACK TO HOME</span>
                    </Link>
                </div>

                {/* Header */}
                <div className="mb-10">
                    <h1 className="text-3xl font-bold tracking-tighter mb-2">
                        IMAGE <span className="text-cyan-500">→</span>{" "}
                        <span className="text-cyan-500">SVG</span>
                    </h1>
                    <p className="text-zinc-400 text-sm font-mono max-w-xl">
                        Vectorize any raster image into true SVG paths via
                        vtracer — a Rust/WASM engine that runs entirely in your
                        browser. Handles color images, photos, logos, and
                        line art.
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-6">
                    {/* ── Upload panel ── */}
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                        <span className="text-xs font-mono font-bold text-zinc-300 tracking-wider uppercase mb-3 block">
                            Source Image
                        </span>

                        {!imageSrc ? (
                            <div
                                ref={dropZoneRef}
                                onDrop={handleDrop}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onClick={() => fileInputRef.current?.click()}
                                className={`flex flex-col items-center justify-center gap-3 h-48 border-2 border-dashed rounded-xl cursor-pointer transition-colors select-none ${
                                    isDragging
                                        ? "border-cyan-500 bg-cyan-500/5"
                                        : "border-zinc-700 hover:border-zinc-500"
                                }`}
                            >
                                <ImageIcon
                                    size={32}
                                    className={
                                        isDragging
                                            ? "text-cyan-500"
                                            : "text-zinc-600"
                                    }
                                />
                                <div className="text-center">
                                    <p className="text-sm text-zinc-400">
                                        {isDragging
                                            ? "Drop to upload"
                                            : "Drop an image here"}
                                    </p>
                                    <p className="text-xs text-zinc-600 mt-1 font-mono">
                                        or click to browse — PNG, JPG, WebP,
                                        GIF, BMP
                                    </p>
                                </div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileInput}
                                    className="sr-only"
                                />
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-center p-4 min-h-36">
                                    <img
                                        src={imageSrc}
                                        alt="Source"
                                        className="max-h-56 max-w-full object-contain"
                                    />
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="font-mono text-xs text-zinc-500 flex items-center gap-3">
                                        <span className="text-zinc-300 truncate max-w-xs">
                                            {imageName}
                                        </span>
                                        {imageDims && (
                                            <span>
                                                {imageDims.w} × {imageDims.h}px
                                            </span>
                                        )}
                                        {imageAnalysis && (
                                            <span
                                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                    ANALYSIS_LABELS[
                                                        imageAnalysis.type
                                                    ].color
                                                }`}
                                            >
                                                {
                                                    ANALYSIS_LABELS[
                                                        imageAnalysis.type
                                                    ].badge
                                                }
                                            </span>
                                        )}
                                    </div>
                                    <button
                                        onClick={clearImage}
                                        className="flex items-center gap-1 text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors"
                                    >
                                        <X size={12} />
                                        remove
                                    </button>
                                </div>
                                {willDownscale && (
                                    <div className="flex items-start gap-2 text-amber-400/80 text-xs font-mono">
                                        <TriangleAlert
                                            size={13}
                                            className="mt-0.5 shrink-0"
                                        />
                                        <span>
                                            Image exceeds {MAX_TRACE_DIM}px —
                                            will be downscaled before tracing.
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ── Options + Convert panel ── */}
                    {imageSrc && (
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                            <span className="text-xs font-mono font-bold text-zinc-300 tracking-wider uppercase mb-4 block">
                                Tracing Options
                            </span>

                            {/* Preset pills */}
                            <div className="flex flex-wrap gap-2 mb-2">
                                {PRESETS.map((p) => (
                                    <button
                                        key={p.key}
                                        onClick={() => {
                                            setSelectedPreset(p.key);
                                            setUseCustom(false);
                                            setShowCustomSliders(false);
                                        }}
                                        title={p.desc}
                                        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono transition-colors ${
                                            !useCustom &&
                                            selectedPreset === p.key
                                                ? "bg-cyan-500 text-black font-bold"
                                                : "border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                                        }`}
                                    >
                                        {p.key === "auto" && (
                                            <Sparkles size={10} />
                                        )}
                                        {p.label}
                                    </button>
                                ))}

                                <button
                                    onClick={() => {
                                        const next = !showCustomSliders;
                                        setShowCustomSliders(next);
                                        setUseCustom(next);
                                    }}
                                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono transition-colors ${
                                        useCustom
                                            ? "bg-cyan-500 text-black font-bold"
                                            : "border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                                    }`}
                                >
                                    <Sliders size={11} />
                                    Custom
                                    {showCustomSliders ? (
                                        <ChevronUp size={11} />
                                    ) : (
                                        <ChevronDown size={11} />
                                    )}
                                </button>
                            </div>

                            {/* Preset description / auto-tune badge */}
                            {!useCustom && (
                                <div className="mb-3">
                                    {selectedPreset === "auto" &&
                                    imageAnalysis ? (
                                        <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500">
                                            <span
                                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                    ANALYSIS_LABELS[
                                                        imageAnalysis.type
                                                    ].color
                                                }`}
                                            >
                                                {
                                                    ANALYSIS_LABELS[
                                                        imageAnalysis.type
                                                    ].badge
                                                }
                                            </span>
                                            <span>
                                                detected —{" "}
                                                {
                                                    ANALYSIS_LABELS[
                                                        imageAnalysis.type
                                                    ].desc
                                                }
                                            </span>
                                        </div>
                                    ) : (
                                        <p className="text-[11px] font-mono text-zinc-500">
                                            {
                                                PRESETS.find(
                                                    (p) =>
                                                        p.key === selectedPreset
                                                )?.desc
                                            }
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Pre-processing row — always visible */}
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 border-t border-zinc-800 mb-1">
                                <span className="text-xs font-mono text-zinc-400 shrink-0">
                                    Pre-process
                                </span>

                                {/* Remove background */}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setRemoveBg((v) => !v)}
                                        className={`px-2.5 py-0.5 rounded-full text-xs font-mono transition-colors shrink-0 ${
                                            removeBg
                                                ? "bg-cyan-500 text-black font-bold"
                                                : "border border-zinc-700 text-zinc-500 hover:border-zinc-500"
                                        }`}
                                    >
                                        Remove BG {removeBg ? "ON" : "OFF"}
                                    </button>
                                    {removeBg && (
                                        <>
                                            <input
                                                type="range"
                                                min={5}
                                                max={80}
                                                value={bgTolerance}
                                                onChange={(e) =>
                                                    setBgTolerance(
                                                        Number(e.target.value)
                                                    )
                                                }
                                                className="w-24 accent-cyan-500 cursor-pointer"
                                            />
                                            <span className="text-xs font-mono text-cyan-500 tabular-nums w-5">
                                                {bgTolerance}
                                            </span>
                                            <span className="text-[10px] font-mono text-zinc-600">
                                                tolerance
                                            </span>
                                        </>
                                    )}
                                </div>

                                {/* Posterize */}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() =>
                                            setPosterizeLevels((l) =>
                                                l > 0 ? 0 : 8
                                            )
                                        }
                                        className={`px-2.5 py-0.5 rounded-full text-xs font-mono transition-colors shrink-0 ${
                                            posterizeLevels > 0
                                                ? "bg-cyan-500 text-black font-bold"
                                                : "border border-zinc-700 text-zinc-500 hover:border-zinc-500"
                                        }`}
                                    >
                                        Posterize{" "}
                                        {posterizeLevels > 0 ? "ON" : "OFF"}
                                    </button>
                                    {posterizeLevels > 0 && (
                                        <>
                                            <input
                                                type="range"
                                                min={2}
                                                max={16}
                                                value={posterizeLevels}
                                                onChange={(e) =>
                                                    setPosterizeLevels(
                                                        Number(e.target.value)
                                                    )
                                                }
                                                className="w-24 accent-cyan-500 cursor-pointer"
                                            />
                                            <span className="text-xs font-mono text-cyan-500 tabular-nums w-5">
                                                {posterizeLevels}
                                            </span>
                                            <span className="text-[10px] font-mono text-zinc-600">
                                                levels
                                            </span>
                                        </>
                                    )}
                                </div>

                                {/* Enhance */}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() =>
                                            setEnhanceImage((v) => !v)
                                        }
                                        className={`px-2.5 py-0.5 rounded-full text-xs font-mono transition-colors shrink-0 ${
                                            enhanceImage
                                                ? "bg-cyan-500 text-black font-bold"
                                                : "border border-zinc-700 text-zinc-500 hover:border-zinc-500"
                                        }`}
                                    >
                                        Enhance {enhanceImage ? "ON" : "OFF"}
                                    </button>
                                    {enhanceImage && (
                                        <>
                                            <input
                                                type="range"
                                                min={100}
                                                max={200}
                                                value={contrastBoost}
                                                onChange={(e) =>
                                                    setContrastBoost(
                                                        Number(e.target.value)
                                                    )
                                                }
                                                className="w-24 accent-cyan-500 cursor-pointer"
                                            />
                                            <span className="text-xs font-mono text-cyan-500 tabular-nums w-8">
                                                {contrastBoost}%
                                            </span>
                                            <span className="text-[10px] font-mono text-zinc-600">
                                                contrast + saturation
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Post-processing row — always visible */}
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 border-t border-zinc-800 mb-1">
                                <span className="text-xs font-mono text-zinc-400 shrink-0">
                                    Post-process
                                </span>

                                {/* Color merge */}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() =>
                                            setColorMerge((v) => !v)
                                        }
                                        className={`px-2.5 py-0.5 rounded-full text-xs font-mono transition-colors shrink-0 ${
                                            colorMerge
                                                ? "bg-cyan-500 text-black font-bold"
                                                : "border border-zinc-700 text-zinc-500 hover:border-zinc-500"
                                        }`}
                                    >
                                        Color merge {colorMerge ? "ON" : "OFF"}
                                    </button>
                                    {colorMerge && (
                                        <>
                                            <input
                                                type="range"
                                                min={5}
                                                max={60}
                                                value={colorMergeThreshold}
                                                onChange={(e) =>
                                                    setColorMergeThreshold(
                                                        Number(e.target.value)
                                                    )
                                                }
                                                className="w-24 accent-cyan-500 cursor-pointer"
                                            />
                                            <span className="text-xs font-mono text-cyan-500 tabular-nums w-5">
                                                {colorMergeThreshold}
                                            </span>
                                            <span className="text-[10px] font-mono text-zinc-600">
                                                ΔE threshold
                                            </span>
                                        </>
                                    )}
                                </div>

                                {/* Remove tiny paths */}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() =>
                                            setRemoveTiny((v) => !v)
                                        }
                                        className={`px-2.5 py-0.5 rounded-full text-xs font-mono transition-colors shrink-0 ${
                                            removeTiny
                                                ? "bg-cyan-500 text-black font-bold"
                                                : "border border-zinc-700 text-zinc-500 hover:border-zinc-500"
                                        }`}
                                    >
                                        Remove tiny{" "}
                                        {removeTiny ? "ON" : "OFF"}
                                    </button>
                                    {removeTiny && (
                                        <>
                                            <input
                                                type="range"
                                                min={2}
                                                max={40}
                                                value={minPathLen}
                                                onChange={(e) =>
                                                    setMinPathLen(
                                                        Number(e.target.value)
                                                    )
                                                }
                                                className="w-24 accent-cyan-500 cursor-pointer"
                                            />
                                            <span className="text-xs font-mono text-cyan-500 tabular-nums w-5">
                                                {minPathLen}
                                            </span>
                                            <span className="text-[10px] font-mono text-zinc-600">
                                                min path length
                                            </span>
                                        </>
                                    )}
                                </div>

                                <span className="text-[10px] font-mono text-zinc-700 ml-auto">
                                    SVGO always runs
                                </span>
                            </div>

                            {/* Custom sliders */}
                            {showCustomSliders && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-5 pt-4 pb-2 border-t border-zinc-800 mt-2 mb-4">
                                    {/* Color mode toggle */}
                                    <div className="sm:col-span-2 flex items-center gap-3">
                                        <span className="text-xs font-mono text-zinc-300">
                                            Color mode
                                        </span>
                                        {(["color", "bw"] as const).map(
                                            (m) => (
                                                <button
                                                    key={m}
                                                    onClick={() =>
                                                        setConfig((c) => ({
                                                            ...c,
                                                            color_mode: m,
                                                        }))
                                                    }
                                                    className={`px-3 py-1 rounded-full text-xs font-mono transition-colors ${
                                                        config.color_mode === m
                                                            ? "bg-cyan-500 text-black font-bold"
                                                            : "border border-zinc-700 text-zinc-400 hover:border-zinc-500"
                                                    }`}
                                                >
                                                    {m === "color"
                                                        ? "Color"
                                                        : "B&W"}
                                                </button>
                                            )
                                        )}
                                        <span className="text-xs font-mono text-zinc-300 ml-4">
                                            Path mode
                                        </span>
                                        {(
                                            [
                                                "spline",
                                                "polygon",
                                                "pixel",
                                            ] as const
                                        ).map((m) => (
                                            <button
                                                key={m}
                                                onClick={() =>
                                                    setConfig((c) => ({
                                                        ...c,
                                                        mode: m,
                                                    }))
                                                }
                                                className={`px-3 py-1 rounded-full text-xs font-mono transition-colors ${
                                                    config.mode === m
                                                        ? "bg-cyan-500 text-black font-bold"
                                                        : "border border-zinc-700 text-zinc-400 hover:border-zinc-500"
                                                }`}
                                            >
                                                {m}
                                            </button>
                                        ))}
                                    </div>

                                    {SLIDERS.filter(
                                        (s) =>
                                            s.key !== "color_mode" &&
                                            s.key !== "mode"
                                    ).map(
                                        ({
                                            key,
                                            label,
                                            min,
                                            max,
                                            step,
                                            hint,
                                        }) => (
                                            <div key={key}>
                                                <div className="flex justify-between items-baseline mb-1">
                                                    <span className="text-xs font-mono text-zinc-300">
                                                        {label}
                                                    </span>
                                                    <span className="text-xs font-mono text-cyan-500 tabular-nums">
                                                        {config[key]}
                                                    </span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min={min}
                                                    max={max}
                                                    step={step}
                                                    value={
                                                        config[key] as number
                                                    }
                                                    onChange={(e) =>
                                                        setConfig((c) => ({
                                                            ...c,
                                                            [key]: Number(
                                                                e.target.value
                                                            ),
                                                        }))
                                                    }
                                                    className="w-full accent-cyan-500 cursor-pointer"
                                                />
                                                <p className="text-[10px] font-mono text-zinc-600 mt-0.5">
                                                    {hint}
                                                </p>
                                            </div>
                                        )
                                    )}
                                </div>
                            )}

                            {/* Error */}
                            {status === "error" && error && (
                                <div className="flex items-start gap-2 text-red-400 text-xs font-mono mb-4">
                                    <AlertCircle
                                        size={14}
                                        className="mt-0.5 shrink-0"
                                    />
                                    <span>{error}</span>
                                </div>
                            )}

                            {/* Convert button */}
                            <div className="flex justify-end">
                                <button
                                    onClick={handleConvert}
                                    disabled={status === "loading"}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-cyan-500 text-black text-xs font-mono font-bold rounded-full hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                >
                                    {status === "loading" ? (
                                        <>
                                            <Loader2
                                                size={14}
                                                className="animate-spin"
                                            />
                                            TRACING…
                                        </>
                                    ) : (
                                        <>
                                            <ImageIcon size={14} />
                                            TRACE TO SVG
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── Output panel ── */}
                    {status === "success" && svg && (
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 space-y-5">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-mono font-bold text-zinc-300 tracking-wider uppercase">
                                    SVG Output
                                    <span className="ml-2 text-zinc-500 normal-case font-normal">
                                        {formatBytes(svgByteSize)}
                                        {svgReduction > 0 && (
                                            <span className="text-emerald-500 ml-1.5">
                                                -{svgReduction}% optimized
                                            </span>
                                        )}
                                        {colorsMerged > 0 && (
                                            <span className="text-violet-400 ml-1.5">
                                                {colorsMerged} colors merged
                                            </span>
                                        )}
                                        {pathsRemoved > 0 && (
                                            <span className="text-amber-400 ml-1.5">
                                                {pathsRemoved} paths removed
                                            </span>
                                        )}
                                    </span>
                                </span>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleCopy}
                                        className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-700 rounded-full text-xs font-mono hover:bg-zinc-800 transition-colors"
                                    >
                                        {copied ? (
                                            <>
                                                <Check
                                                    size={12}
                                                    className="text-cyan-500"
                                                />
                                                <span className="text-cyan-500">
                                                    COPIED
                                                </span>
                                            </>
                                        ) : (
                                            <>
                                                <Copy size={12} />
                                                COPY SVG
                                            </>
                                        )}
                                    </button>
                                    <button
                                        onClick={handleDownload}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500 text-black rounded-full text-xs font-mono font-bold hover:bg-cyan-400 transition-colors"
                                    >
                                        <Download size={12} />
                                        DOWNLOAD
                                    </button>
                                </div>
                            </div>

                            {/* Side-by-side comparison */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <p className="text-[10px] font-mono text-zinc-600 mb-2 uppercase tracking-wider">
                                        Original
                                    </p>
                                    <div className="bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-center p-4 min-h-44">
                                        <img
                                            src={imageSrc}
                                            alt="Original"
                                            className="max-h-64 max-w-full object-contain"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <p className="text-[10px] font-mono text-zinc-600 mb-2 uppercase tracking-wider">
                                        Traced SVG
                                    </p>
                                    <div className="bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-center p-4 min-h-44">
                                        {svgPreviewUrl && (
                                            <img
                                                src={svgPreviewUrl}
                                                alt="Traced SVG"
                                                className="max-h-64 max-w-full object-contain"
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
