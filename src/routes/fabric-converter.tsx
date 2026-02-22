import { createRoute, Link } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { useRef, useState, useCallback, useEffect } from "react";
import {
    ArrowLeft,
    Download,
    Copy,
    Check,
    AlertCircle,
    Loader2,
    FileCode2,
    Eraser,
} from "lucide-react";

export const fabricConverterRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/fabric-converter",
    component: FabricConverterPage,
});

export const Route = fabricConverterRoute;

type ConvertStatus = "idle" | "loading" | "success" | "error";

function FabricConverterPage() {
    const [json, setJson] = useState("");
    const [svg, setSvg] = useState("");
    const [error, setError] = useState("");
    const [status, setStatus] = useState<ConvertStatus>("idle");
    const [copied, setCopied] = useState(false);
    const [jsonByteSize, setJsonByteSize] = useState(0);
    const offscreenContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setJsonByteSize(new Blob([json]).size);
    }, [json]);

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return "0 B";
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    };

    const handleConvert = useCallback(async () => {
        const trimmed = json.trim();
        if (!trimmed) {
            setError("Paste some Fabric.js canvas JSON to get started.");
            setStatus("error");
            return;
        }

        setError("");
        setStatus("loading");
        setSvg("");

        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(trimmed);
        } catch {
            setError("Invalid JSON — could not parse the input.");
            setStatus("error");
            return;
        }

        try {
            // Dynamic import keeps fabric out of the initial bundle
            const { StaticCanvas } = await import("fabric");

            // Number() handles string values; fall back only when truly absent
            const jsonWidth = Number(parsed.width) || 800;
            const jsonHeight = Number(parsed.height) || 600;

            // Render into an off-screen <canvas> attached to a hidden div
            const canvasEl = document.createElement("canvas");
            canvasEl.width = jsonWidth;
            canvasEl.height = jsonHeight;
            offscreenContainerRef.current?.appendChild(canvasEl);

            const canvas = new StaticCanvas(canvasEl, {
                width: jsonWidth,
                height: jsonHeight,
            });

            await canvas.loadFromJSON(parsed);

            // KEY FIX: loadFromJSON restores the saved viewportTransform.
            // If the user had panned their canvas before exporting, that pan
            // offset is baked in, and toSVG() honours it — resulting in only
            // the panned viewport region appearing in the output (typically
            // the lower-right corner). Reset to identity so the full canvas
            // origin is used.
            canvas.viewportTransform = [1, 0, 0, 1, 0, 0];

            // Re-read dimensions fabric set during loadFromJSON (they may
            // differ from the constructor values).
            const finalWidth = canvas.width ?? jsonWidth;
            const finalHeight = canvas.height ?? jsonHeight;

            // Calculate the real bounding box of every object so the SVG
            // viewBox captures content that overflows the stated canvas size
            // (e.g. objects placed partially outside the canvas edge).
            const objects = canvas.getObjects();
            let vbX = 0,
                vbY = 0,
                vbW = finalWidth,
                vbH = finalHeight;

            if (objects.length > 0) {
                let minX = 0,
                    minY = 0,
                    maxX = finalWidth,
                    maxY = finalHeight;

                for (const obj of objects) {
                    const b = obj.getBoundingRect();
                    if (b.left < minX) minX = b.left;
                    if (b.top < minY) minY = b.top;
                    if (b.left + b.width > maxX) maxX = b.left + b.width;
                    if (b.top + b.height > maxY) maxY = b.top + b.height;
                }

                vbX = minX;
                vbY = minY;
                vbW = maxX - minX;
                vbH = maxY - minY;
            }

            canvas.renderAll();

            const svgOutput = canvas.toSVG({
                viewBox: { x: vbX, y: vbY, width: vbW, height: vbH },
            });
            setSvg(svgOutput);
            setStatus("success");

            canvas.dispose();
            offscreenContainerRef.current?.removeChild(canvasEl);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Conversion failed — check the JSON is from a Fabric.js canvas."
            );
            setStatus("error");
            // Clean up any dangling canvas elements
            if (offscreenContainerRef.current) {
                offscreenContainerRef.current.innerHTML = "";
            }
        }
    }, [json]);

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
        a.download = "canvas-export.svg";
        a.click();
        URL.revokeObjectURL(url);
    }, [svg]);

    const handleClear = useCallback(() => {
        setJson("");
        setSvg("");
        setError("");
        setStatus("idle");
    }, []);

    const svgPreviewUrl = svg
        ? URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }))
        : null;

    // Revoke old object URLs when svg changes to avoid memory leaks
    useEffect(() => {
        return () => {
            if (svgPreviewUrl) URL.revokeObjectURL(svgPreviewUrl);
        };
    }, [svgPreviewUrl]);

    return (
        <div className="min-h-screen pt-24 px-4 pb-16">
            {/* Hidden off-screen container for fabric.js canvas elements */}
            <div
                ref={offscreenContainerRef}
                aria-hidden="true"
                style={{
                    position: "absolute",
                    top: -9999,
                    left: -9999,
                    visibility: "hidden",
                    pointerEvents: "none",
                }}
            />

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
                        FABRIC
                        <span className="text-cyan-500">.JS</span> CANVAS →{" "}
                        <span className="text-cyan-500">SVG</span>
                    </h1>
                    <p className="text-zinc-400 text-sm font-mono max-w-xl">
                        Paste JSON exported from a Fabric.js canvas and download
                        the result as a scalable SVG. Works with arbitrarily
                        large canvases — conversion runs entirely in your
                        browser.
                    </p>
                </div>

                {/* Main grid */}
                <div className="grid grid-cols-1 gap-6">
                    {/* JSON input panel */}
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                        <div className="flex items-center justify-between mb-3">
                            <label
                                htmlFor="json-input"
                                className="text-xs font-mono font-bold text-zinc-300 tracking-wider uppercase"
                            >
                                Fabric.js Canvas JSON
                            </label>
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-mono text-zinc-500">
                                    {json.length > 0
                                        ? formatBytes(jsonByteSize)
                                        : "empty"}
                                </span>
                                {json.length > 0 && (
                                    <button
                                        onClick={handleClear}
                                        className="flex items-center gap-1 text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors"
                                    >
                                        <Eraser size={12} />
                                        clear
                                    </button>
                                )}
                            </div>
                        </div>
                        <textarea
                            id="json-input"
                            value={json}
                            onChange={(e) => setJson(e.target.value)}
                            placeholder={`{\n  "version": "6.0.0",\n  "objects": [...],\n  "width": 1920,\n  "height": 1080\n}`}
                            spellCheck={false}
                            className="w-full h-64 bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-sm font-mono text-zinc-200 placeholder-zinc-700 resize-y focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-colors"
                        />

                        {/* Error message */}
                        {status === "error" && error && (
                            <div className="mt-3 flex items-start gap-2 text-red-400 text-xs font-mono">
                                <AlertCircle
                                    size={14}
                                    className="mt-0.5 shrink-0"
                                />
                                <span>{error}</span>
                            </div>
                        )}

                        {/* Convert button */}
                        <div className="mt-4 flex justify-end">
                            <button
                                onClick={handleConvert}
                                disabled={
                                    status === "loading" || !json.trim()
                                }
                                className="flex items-center gap-2 px-5 py-2.5 bg-cyan-500 text-black text-xs font-mono font-bold rounded-full hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                {status === "loading" ? (
                                    <>
                                        <Loader2
                                            size={14}
                                            className="animate-spin"
                                        />
                                        CONVERTING…
                                    </>
                                ) : (
                                    <>
                                        <FileCode2 size={14} />
                                        CONVERT TO SVG
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Output panel — only shown after a successful conversion */}
                    {status === "success" && svg && (
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 space-y-5">
                            {/* Toolbar */}
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-mono font-bold text-zinc-300 tracking-wider uppercase">
                                    SVG Output
                                    <span className="ml-2 text-zinc-500 normal-case font-normal">
                                        {formatBytes(new Blob([svg]).size)}
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

                            {/* SVG visual preview */}
                            {svgPreviewUrl && (
                                <div className="rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 flex items-center justify-center p-4">
                                    <img
                                        src={svgPreviewUrl}
                                        alt="SVG preview"
                                        className="max-w-full max-h-96 object-contain"
                                        style={{ imageRendering: "auto" }}
                                    />
                                </div>
                            )}

                            {/* Raw SVG text (scrollable, truncated) */}
                            <div className="relative">
                                <pre className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-xs font-mono text-zinc-400 overflow-auto max-h-52 whitespace-pre-wrap break-all">
                                    {svg.length > 8000
                                        ? svg.slice(0, 8000) +
                                          `\n\n… (${formatBytes(new Blob([svg]).size)} total — download to view full SVG)`
                                        : svg}
                                </pre>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
