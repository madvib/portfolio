use serde::Deserialize;
use visioncortex::PathSimplifyMode;
use vtracer::{ColorImage, ColorMode, Config, Hierarchical};
use wasm_bindgen::prelude::*;

// Better panic messages in the browser console during development.
#[wasm_bindgen(start)]
pub fn init_panic_hook() {
    console_error_panic_hook::set_once();
}

/// JSON-serialisable config that mirrors vtracer::Config.
/// All fields are optional; missing values fall back to vtracer defaults.
#[derive(Deserialize)]
struct WasmConfig {
    /// "color" (default) or "bw"
    color_mode: Option<String>,
    /// "stacked" (default) or "cutout"
    hierarchical: Option<String>,
    /// "pixel", "polygon", or "spline" (default)
    mode: Option<String>,
    filter_speckle: Option<usize>,
    color_precision: Option<i32>,
    layer_difference: Option<i32>,
    corner_threshold: Option<i32>,
    length_threshold: Option<f64>,
    max_iterations: Option<usize>,
    splice_threshold: Option<i32>,
    path_precision: Option<u32>,
}

impl From<WasmConfig> for Config {
    fn from(w: WasmConfig) -> Self {
        let mut cfg = Config::default();

        if let Some(cm) = w.color_mode {
            cfg.color_mode = match cm.as_str() {
                "bw" | "binary" => ColorMode::Binary,
                _ => ColorMode::Color,
            };
        }
        if let Some(h) = w.hierarchical {
            cfg.hierarchical = match h.as_str() {
                "cutout" => Hierarchical::Cutout,
                _ => Hierarchical::Stacked,
            };
        }
        if let Some(m) = w.mode {
            cfg.mode = match m.as_str() {
                "pixel" => PathSimplifyMode::None,
                "polygon" => PathSimplifyMode::Polygon,
                _ => PathSimplifyMode::Spline,
            };
        }
        if let Some(v) = w.filter_speckle {
            cfg.filter_speckle = v;
        }
        if let Some(v) = w.color_precision {
            cfg.color_precision = v;
        }
        if let Some(v) = w.layer_difference {
            cfg.layer_difference = v;
        }
        if let Some(v) = w.corner_threshold {
            cfg.corner_threshold = v;
        }
        if let Some(v) = w.length_threshold {
            cfg.length_threshold = v;
        }
        if let Some(v) = w.max_iterations {
            cfg.max_iterations = v;
        }
        if let Some(v) = w.splice_threshold {
            cfg.splice_threshold = v;
        }
        if let Some(v) = w.path_precision {
            cfg.path_precision = Some(v);
        }

        cfg
    }
}

/// Convert raw RGBA pixel data into an SVG string.
///
/// - `pixels`      : RGBA bytes, exactly `width * height * 4` bytes
///                   (the `data` property of a browser `ImageData` object)
/// - `width`       : image width in pixels
/// - `height`      : image height in pixels
/// - `config_json` : optional JSON object overriding conversion parameters.
///                   Pass `"{}"` or `"null"` to use vtracer defaults.
///
/// Returns the SVG as a `String`, or throws a JS `Error` on failure.
#[wasm_bindgen]
pub fn trace(
    pixels: Vec<u8>,
    width: u32,
    height: u32,
    config_json: &str,
) -> Result<String, JsValue> {
    let img = ColorImage {
        pixels,
        width: width as usize,
        height: height as usize,
    };

    let cfg: Config = if config_json.trim().is_empty() || config_json.trim() == "null" {
        Config::default()
    } else {
        let wasm_cfg: WasmConfig = serde_json::from_str(config_json)
            .map_err(|e| JsValue::from_str(&format!("Invalid config JSON: {e}")))?;
        wasm_cfg.into()
    };

    let svg = vtracer::convert(img, cfg)
        .map_err(|e| JsValue::from_str(&e))?;

    Ok(svg.to_string())
}
