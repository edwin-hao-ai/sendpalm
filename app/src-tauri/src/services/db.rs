//! Small SQLite/json helpers used by sync_loop and migration backfills.

use serde_json::Value;

/// Merge two JSON string arrays, dedup, cap at 256 entries (drop oldest).
pub fn merge_json_array(existing: &str, added: &str) -> Result<String, String> {
    let mut a: Vec<String> = serde_json::from_str(existing)
        .map_err(|e| format!("merge_json_array: existing not array: {e}"))?;
    let b: Vec<String> = serde_json::from_str(added)
        .map_err(|e| format!("merge_json_array: added not array: {e}"))?;
    for v in b {
        if !a.contains(&v) {
            a.push(v);
        }
    }
    if a.len() > 256 {
        let drop = a.len() - 256;
        a.drain(0..drop);
    }
    serde_json::to_string(&Value::Array(a.into_iter().map(Value::String).collect()))
        .map_err(|e| format!("merge_json_array: serialize: {e}"))
}
