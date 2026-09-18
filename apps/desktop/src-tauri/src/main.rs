// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Bound Tokio worker thread pool to 4 if not explicitly overridden by environment.
    // BBQ is an event-driven desktop utility; 16 worker threads on modern CPUs introduces
    // unnecessary OS thread stacks and private committed memory with zero concurrency gain.
    if std::env::var_os("TOKIO_WORKER_THREADS").is_none() {
        std::env::set_var("TOKIO_WORKER_THREADS", "4");
    }
    bbq_desktop_lib::run();
}
