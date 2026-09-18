# Windows Release Build Requirements & Runbook

This document describes the reproducible build and release requirements for BBQ Desktop on Windows.

---

## 1. Toolchain & Prerequisites

### Rust Toolchain
- **Target**: `x86_64-pc-windows-gnu`
- **Channel**: `stable-x86_64-pc-windows-gnu`
- Ensure the target is installed:
  ```powershell
  rustup target add x86_64-pc-windows-gnu
  rustup default stable-x86_64-pc-windows-gnu
  ```

### Linker Requirements
- **LLD Linker**: Rust's built-in `rust-lld` is recommended for deterministic, fast GNU linking on Windows.
- **Self-Contained CRT**: Rust's MinGW toolchain includes `self-contained` CRT objects (`crt2.o`, `ld.exe`).
- Recommended RUSTFLAGS:
  ```powershell
  $env:RUSTFLAGS = "-C linker=rust-lld -C link-self-contained=yes"
  ```

### Windows Resource Compiler (`windres`)
- Tauri compiles application manifests and version info via `tauri-winres` during the build of `bbq-desktop`.
- For the MinGW/GNU toolchain, `windres.exe` must be present on the system `PATH` (e.g. from MinGW-w64 / WinLibs / MSYS2).
- Example: Ensure your MinGW-w64 `bin` directory containing `windres.exe` is in `$env:PATH`.

---

## 2. Embedded Frontend Architecture

In production, BBQ runs with **zero external web server processes**:
1. **Vite Development Server (Port 1420) MUST BE OFF**:
   - The production executable does not connect to `localhost:1420`.
   - All web assets (HTML, JS, CSS, SVG) are compiled by Vite into `apps/desktop/dist/`.
2. **Custom Protocol (`tauri://localhost`)**:
   - Tauri embeds `apps/desktop/dist/` directly into the release binary.
   - The feature flag `custom-protocol` in Tauri serves the assets securely in-memory via WebView2.

---

## 3. Step-by-Step Production Release Build

### Step 1: Clean & Build Frontend
```powershell
# From the repository root
pnpm install
pnpm build
```
Confirm that `apps/desktop/dist/` contains `index.html` and bundled assets.

### Step 2: Set Environment Variables
```powershell
# Add the MinGW-w64 toolchain directory with windres.exe and Rust self-contained bin to PATH
$env:PATH = "C:\Users\omr03\.rustup\toolchains\stable-x86_64-pc-windows-gnu\lib\rustlib\x86_64-pc-windows-gnu\bin\self-contained;C:\Users\omr03\winlibs\mingw64\bin;$env:PATH"

# Configure rust-lld and self-contained linking
$env:RUSTFLAGS = "-C linker=rust-lld -C link-self-contained=yes"
```

### Step 3: Compile Production Binary
```powershell
cargo build --release --bin bbq-desktop --features custom-protocol
```

The resulting optimized executable will be located at:
```text
target\release\bbq-desktop.exe
```

---

## 4. Verification Checklist

1. **Vite Inactive**: Confirm port 1420 is not listening (`netstat -ano | findstr 1420`).
2. **Binary Verification**: Confirm `target\release\bbq-desktop.exe` exists and launches standalone without needing Node/Vite.
3. **Single-Instance Protection**: Launching a second instance focuses the active window and exits immediately without creating duplicate trays, windows, or SQLite connections.
4. **Performance Budget**:
   - Host Working Set $\le 60\text{ MB}$
   - Private Bytes $\approx 10\text{ MB}$
   - Private Working Set $\approx 7\text{ MB}$
   - Idle CPU $\approx 0\%$
   - Active threads $\approx 24$
