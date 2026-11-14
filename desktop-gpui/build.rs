use std::{env, fs, path::Path};

fn main() {
    // libwebrtc (LiveKit) is a static library whose Objective-C categories the linker would drop
    // without -ObjC, and the first call into one (H.264 codec setup) then throws.
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rustc-link-arg=-ObjC");
    }

    // Icons and fonts are compiled in: one list of (path, bytes) for gpui's asset source.
    let mut entries = String::from("pub static ASSETS: &[(&str, &[u8])] = &[\n");
    fn walk(dir: &Path, out: &mut Vec<std::path::PathBuf>) {
        println!("cargo:rerun-if-changed={}", dir.display());
        for entry in fs::read_dir(dir).unwrap().flatten() {
            let path = entry.path();
            if path.is_dir() { walk(&path, out) } else { out.push(path) }
        }
    }
    for dir in ["icons", "fonts", "images", "i18n", "cosmetics", "emoji", "sounds", "themes"] {
        let mut files = Vec::new();
        walk(&Path::new("resources").join(dir), &mut files);
        files.sort();
        for path in files {
            let rel = path.strip_prefix("resources").unwrap().to_string_lossy().replace('\\', "/");
            let abs = fs::canonicalize(&path).unwrap();
            entries.push_str(&format!("    (\"{rel}\", include_bytes!({:?})),\n", abs.display().to_string()));
        }
    }
    entries.push_str("];\n");
    fs::write(Path::new(&env::var("OUT_DIR").unwrap()).join("assets.rs"), entries).unwrap();
}
