/** IPC commands — typed wrappers around Tauri invoke.
 *
 * Convention:
 * - All database access goes through `tauri-plugin-sql` from JS.
 * - Rust commands (in src-tauri/src/commands/) are reserved for things that
 *   need OS-level integration (fs, notifications, OS info).
 */

import { invoke } from "@tauri-apps/api/core";

export async function pingGreet(name: string): Promise<string> {
  return invoke<string>("greet", { name });
}
