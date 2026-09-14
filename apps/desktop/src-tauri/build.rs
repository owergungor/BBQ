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
    #[cfg(windows)]
    let attrs = {
        let mut windows = tauri_build::WindowsAttributes::new();
        windows = windows.app_manifest(
            r#"<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0" xmlns:asmv3="urn:schemas-microsoft-com:asm.v3">
  <dependency>
    <dependentAssembly>
      <assemblyIdentity
        type="win32"
        name="Microsoft.Windows.Common-Controls"
        version="6.0.0.0"
        processorArchitecture="*"
        publicKeyToken="6595b64144ccf1df"
        language="*"
      />
    </dependentAssembly>
  </dependency>
  <compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1">
    <application>
      <!-- Windows 10 and Windows 11 -->
      <supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}"/>
      <!-- Windows 8.1 -->
      <supportedOS Id="{1f676c76-80e1-4239-95bb-83d0f6d0da78}"/>
      <!-- Windows 8 -->
      <supportedOS Id="{4a2f28e3-53b9-4441-ba9c-d69d4a4a6e38}"/>
      <!-- Windows 7 -->
      <supportedOS Id="{35138b9a-5d96-4fbd-8e2d-a2440225f93a}"/>
    </application>
  </compatibility>
  <asmv3:application>
    <asmv3:windowsSettings xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">
      <longPathAware>true</longPathAware>
    </asmv3:windowsSettings>
    <asmv3:windowsSettings xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">
      <dpiAware>true/pm</dpiAware>
    </asmv3:windowsSettings>
  </asmv3:application>
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v2">
    <security>
      <requestedPrivileges>
        <requestedExecutionLevel level="asInvoker" uiAccess="false"/>
      </requestedPrivileges>
    </security>
  </trustInfo>
</assembly>"#,
        );
        tauri_build::Attributes::new().windows_attributes(windows)
    };

    #[cfg(not(windows))]
    let attrs = tauri_build::Attributes::new();

    #[cfg(all(windows, target_env = "gnu"))]
    {
        if let Ok(out_dir) = std::env::var("OUT_DIR") {
            let spec_path = std::path::Path::new(&out_dir).join("no-default-manifest.spec");
            let _ = std::fs::write(
                &spec_path,
                "*endfile:\n%{mdaz-ftz:crtfastmath.o%s;Ofast|ffast-math|funsafe-math-optimizations:%{!shared:%{!mno-daz-ftz:crtfastmath.o%s}}} %{fvtable-verify=none:%s; fvtable-verify=preinit:vtv_end.o%s; fvtable-verify=std:vtv_end.o%s} crtend.o%s\n",
            );
            println!("cargo:rustc-link-arg-bins=-specs={}", spec_path.display());
        }
    }

    tauri_build::try_build(attrs).expect("failed to run tauri-build");
}
