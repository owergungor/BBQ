fn main() {
    let profile = std::env::var("PROFILE").unwrap_or_default();
    let is_tauri_dev = std::env::var("DEP_TAURI_DEV")
        .map(|v| v == "true")
        .unwrap_or(true);
    if profile == "release" && is_tauri_dev {
        println!(
            "cargo:warning=Building bbq-desktop in release mode without `custom-protocol` feature!"
        );
        println!("cargo:warning=To embed frontend assets, build with `pnpm build:desktop` or pass `--features custom-protocol`.");
    }
    tauri_build::build()
}
