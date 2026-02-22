use imara_diff::UnifiedDiffConfig;

fn main() {
    let cfg = UnifiedDiffConfig::default();
    println!("context: {}", cfg.context);
}
