use std::{env, fs, path::Path};

fn main() {
    // libwebrtc (LiveKit) is a static library whose Objective-C categories the linker would drop
    // without -ObjC, and the first call into one (H.264 codec setup) then throws.
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rustc-link-arg=-ObjC");
    }

    // Icons and fonts are compiled in: one list of (path, bytes) for gpui's asset source.
    let mut entries = String::from("pub static ASSETS: &[(&str, &[u8])] = &[\n");
    for dir in ["icons", "fonts"] {
        let root = Path::new("resources").join(dir);
        println!("cargo:rerun-if-changed={}", root.display());
        let mut files: Vec<_> = fs::read_dir(&root).unwrap().flatten().map(|e| e.path()).collect();
        files.sort();
        for path in files {
            let name = path.file_name().unwrap().to_string_lossy().to_string();
            let abs = fs::canonicalize(&path).unwrap();
            entries.push_str(&format!("    (\"{dir}/{name}\", include_bytes!({:?})),\n", abs.display().to_string()));
        }
    }
    entries.push_str("];\n");
    fs::write(Path::new(&env::var("OUT_DIR").unwrap()).join("assets.rs"), entries).unwrap();
}
