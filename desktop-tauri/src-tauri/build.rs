fn main() {
    // The AirPods head-pose bridge is CoreMotion, so it only builds on Apple targets.
    if std::env::var("CARGO_CFG_TARGET_VENDOR").as_deref() == Ok("apple") {
        println!("cargo:rerun-if-changed=native/head_tracking.m");
        cc::Build::new()
            .file("native/head_tracking.m")
            .flag("-fobjc-arc")
            .flag("-fmodules")
            .compile("huddle_head_tracking");
        println!("cargo:rustc-link-lib=framework=CoreMotion");
        println!("cargo:rustc-link-lib=framework=Foundation");
    }

    tauri_build::build()
}
