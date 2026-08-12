//! Image proxy — fetches external `<img>` URLs through the Tauri backend,
//! caches them under `cache_dir`, and substitutes a 1×1 transparent PNG for
//! known tracking-pixel signatures.
//!
//! See AGENTS.md §10 and the F plan §4.1 for the design.

use std::path::PathBuf;

use sha2::{Digest, Sha256};

/// Maximum size below which a payload is treated as a tracking pixel even
/// when the format is unrecognised. Tracking beacons are typically well
/// under 200 bytes; legitimate inline icons (favicons, badges) are larger.
const TRACKING_PIXEL_SIZE_THRESHOLD: u64 = 200;

/// Canonical 1×1 transparent PNG used as the tracking-pixel substitute.
/// Browser-renderable, valid PNG signature + IHDR (1×1, RGBA) + IDAT + IEND.
const TRANSPARENT_1X1_PNG: &[u8] = &[
    0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, b'I', b'H', b'D', b'R',
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89, 0x00, 0x00, 0x00, 0x0D, b'I', b'D', b'A', b'T', 0x78, 0x9C, 0x62, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, b'I', b'E', b'N', b'D', 0xAE,
    0x42, 0x60, 0x82,
];

/// Fetch an external image URL, cache the result on disk, and return the
/// raw bytes plus an inferred MIME type.
///
/// On cache hit the file is read directly with no network call. On miss
/// the URL is fetched, sniffed for tracking-pixel signatures, and — if it
/// looks like a normal image — written to `<cache_dir>/<sha256(url)[:16]>`.
///
/// Returns the transparent 1×1 PNG (and `image/png`) when the payload
/// looks like a tracking pixel.
pub async fn fetch_and_cache(
    url: &str,
    cache_dir: &PathBuf,
) -> Result<(Vec<u8>, String), String> {
    let hash = Sha256::digest(url.as_bytes());
    let cache_path = cache_dir.join(hex::encode(&hash[..8]));

    if cache_path.exists() {
        let bytes = tokio::fs::read(&cache_path)
            .await
            .map_err(|e| format!("image_proxy: read cache {}: {e}", cache_path.display()))?;
        let mime = guess_mime(&bytes);
        return Ok((bytes, mime));
    }

    let resp = reqwest::get(url)
        .await
        .map_err(|e| format!("image_proxy: fetch {url}: {e}"))?;
    let content_length = resp.content_length().unwrap_or(0);
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("image_proxy: read body: {e}"))?
        .to_vec();

    if content_length > 0 && content_length < TRACKING_PIXEL_SIZE_THRESHOLD {
        return Ok((TRANSPARENT_1X1_PNG.to_vec(), "image/png".to_string()));
    }

    if looks_like_tracking_pixel(&bytes) {
        return Ok((TRANSPARENT_1X1_PNG.to_vec(), "image/png".to_string()));
    }

    let mime = guess_mime(&bytes);

    if let Err(e) = tokio::fs::write(&cache_path, &bytes).await {
        eprintln!(
            "image_proxy: cache write {} failed: {e}",
            cache_path.display()
        );
    }

    Ok((bytes, mime))
}

/// True if `bytes` look like a 1×1 (or smaller) image — the classic
/// tracking-pixel shape. Handles PNG (IHDR width/height), GIF (logical
/// screen descriptor width/height), and JPEG (any SOF marker).
fn looks_like_tracking_pixel(bytes: &[u8]) -> bool {
    if bytes.len() < 8 {
        return false;
    }

    // PNG: 8-byte signature, IHDR chunk at offset 8 (4 len + 4 type),
    // width/height (big-endian u32) at offsets 16 and 20.
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        if bytes.len() < 24 {
            return false;
        }
        let width = u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]);
        let height = u32::from_be_bytes([bytes[20], bytes[21], bytes[22], bytes[23]]);
        return width <= 1 && height <= 1;
    }

    // GIF: 6-byte signature, width/height (little-endian u16) at offsets 6/8.
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        if bytes.len() < 10 {
            return false;
        }
        let width = u16::from_le_bytes([bytes[6], bytes[7]]);
        let height = u16::from_le_bytes([bytes[8], bytes[9]]);
        return width <= 1 && height <= 1;
    }

    // JPEG: walk segments looking for any SOF marker (0xFFC0–0xFFCF, excluding
    // 0xFFC4 DHT, 0xFFC8 JPG, 0xFFCC DAC). The SOF frame header carries
    // precision (1B) + height (BE u16) + width (BE u16) starting 5 bytes
    // after the marker.
    if bytes.len() >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF {
        return jpeg_sof_dimensions_le_one(bytes);
    }

    false
}

fn jpeg_sof_dimensions_le_one(bytes: &[u8]) -> bool {
    // Skip the SOI marker (0xFFD8) at offset 0, then walk segments.
    let mut i = 2usize;
    while i + 1 < bytes.len() {
        if bytes[i] != 0xFF {
            return false;
        }
        let marker = bytes[i + 1];
        // EOI (0xD9) or SOS (0xDA) — no SOF found, give up.
        if marker == 0xD9 || marker == 0xDA {
            return false;
        }
        // SOF markers: 0xC0–0xCF excluding DHT (0xC4), JPG (0xC8), DAC (0xCC).
        if (0xC0..=0xCF).contains(&marker)
            && marker != 0xC4
            && marker != 0xC8
            && marker != 0xCC
        {
            // Need at least: marker(2) + length(2) + precision(1) + height(2) + width(2) = 9
            if i + 9 > bytes.len() {
                return false;
            }
            let height = u16::from_be_bytes([bytes[i + 5], bytes[i + 6]]);
            let width = u16::from_be_bytes([bytes[i + 7], bytes[i + 8]]);
            return width <= 1 && height <= 1;
        }
        // Skip this segment by its length (length field includes itself,
        // excludes the marker; both bytes are BE).
        if i + 4 > bytes.len() {
            return false;
        }
        let seg_len = u16::from_be_bytes([bytes[i + 2], bytes[i + 3]]) as usize;
        if seg_len < 2 {
            return false;
        }
        i += 2 + seg_len;
    }
    false
}

/// Best-effort MIME sniff from the leading bytes. Returns
/// `application/octet-stream` for unrecognised payloads.
fn guess_mime(bytes: &[u8]) -> String {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        return "image/png".to_string();
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return "image/gif".to_string();
    }
    if bytes.len() >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF {
        return "image/jpeg".to_string();
    }
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return "image/webp".to_string();
    }
    if bytes.starts_with(b"BM") {
        return "image/bmp".to_string();
    }
    if bytes.len() >= 4 {
        let head: Vec<u8> = bytes.iter().take(64).map(|b| b.to_ascii_lowercase()).collect();
        if head.windows(4).any(|w| w == b"<svg") {
            return "image/svg+xml".to_string();
        }
    }
    "application/octet-stream".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guess_mime_png() {
        assert_eq!(
            guess_mime(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]),
            "image/png"
        );
    }

    #[test]
    fn guess_mime_gif() {
        assert_eq!(guess_mime(&[b'G', b'I', b'F', b'8', b'9', b'a']), "image/gif");
    }

    #[test]
    fn guess_mime_jpeg() {
        assert_eq!(guess_mime(&[0xFF, 0xD8, 0xFF]), "image/jpeg");
    }

    #[test]
    fn tracking_pixel_png_1x1() {
        // PNG signature + IHDR with width=1, height=1
        let mut bytes = vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
        // IHDR chunk: length(4) + "IHDR" + width(4=1) + height(4=1) + ...
        bytes.extend_from_slice(&[0, 0, 0, 13]); // chunk length
        bytes.extend_from_slice(b"IHDR");
        bytes.extend_from_slice(&[0, 0, 0, 1]); // width = 1
        bytes.extend_from_slice(&[0, 0, 0, 1]); // height = 1
        bytes.extend_from_slice(&[8, 6, 0, 0, 0]); // bit depth, color type, etc.
        assert!(looks_like_tracking_pixel(&bytes));
    }

    #[test]
    fn tracking_pixel_normal_png() {
        // PNG with width=100, height=100 → NOT a tracking pixel
        let mut bytes = vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
        bytes.extend_from_slice(&[0, 0, 0, 13]);
        bytes.extend_from_slice(b"IHDR");
        bytes.extend_from_slice(&[0, 0, 0, 100]); // width = 100
        bytes.extend_from_slice(&[0, 0, 0, 100]); // height = 100
        bytes.extend_from_slice(&[8, 6, 0, 0, 0]);
        assert!(!looks_like_tracking_pixel(&bytes));
    }
}
