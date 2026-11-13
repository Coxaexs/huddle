fn main() {
    // libwebrtc (LiveKit) is a static library whose Objective-C categories the linker would drop
    // without -ObjC, and the first call into one (H.264 codec setup) then throws.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rustc-link-arg=-ObjC");
    }
}
