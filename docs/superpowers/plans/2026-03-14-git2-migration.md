# git2 Migration Plan — checkout, stash, reset, show, config

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the remaining CLI fallbacks in `git_execute_impl` with native git2 implementations for checkout, stash, restore (workdir), reset (soft/hard), blob show, and config read.

**Architecture:** All `_impl` functions live in `src-tauri/src/git_native.rs`. The router in `src-tauri/src/git_diff.rs::git_execute_impl` dispatches to them. No new Tauri commands are needed for Tasks 1–4; Task 5 adds one new command. Stash operations require `&mut Repository` so `repo_open` returns an owned value (already the case).

**Tech Stack:** Rust, git2 0.19 (vendored), gix 0.66, Tauri v2.

---

## Key context for each task

### What already exists
- `repo_open(path) → Result<Repository, String>` in `git_native.rs:76`
- `git_reset_native_impl` handles `restore --staged` (unstage) already — routed at `git_diff.rs:229`
- `git_commit_native_impl` already reads `user.name`/`user.email` from `repo.config()`
- `stash_foreach` (read-only) already used in `git_branches_native_impl`
- `git_cli_fallback` is the escape hatch — keep it for anything not yet migrated

### Routes that still hit CLI (targets for this plan)
| Command pattern | File:Line | Priority |
|---|---|---|
| `checkout <branch>` | `GitSidebar.tsx:234`, `MergePRModal.tsx:167` | High |
| `stash save <msg>` | `GitSidebar.tsx:247` | High |
| `stash pop [stash@{N}]` | `GitSidebar.tsx:256, 349` | High |
| `stash drop stash@{N}` | `GitSidebar.tsx:273` | High |
| `restore <path>` (no --staged) | `GitStagingPanel.tsx:312, 334`, `GitDiffViewer.tsx:159` | Medium |
| `reset --soft HEAD~1` | `GitTimeline.tsx:264` | Medium |
| `show <hash>:<path>` | `CommitDiffModal.tsx:234, 244, 254, 255` | Medium |
| `config user.name` | `GitTimeline.tsx:185` | Low |

### git2 API notes (save time reading docs)
- Stash requires `&mut repo`: `repo.stash_save(&sig, msg, flags)`, `repo.stash_pop(idx, opts)`, `repo.stash_drop(idx)`
- Checkout branch: `repo.set_head("refs/heads/NAME")` + `repo.checkout_head(Some(&mut CheckoutBuilder::new()))`
- Create branch + checkout: `repo.branch(name, &commit, false)` then same checkout flow
- Restore workdir: `CheckoutBuilder::new().path(file).force()` + `repo.checkout_head(Some(&mut cb))` or `repo.checkout_index(None, Some(&mut cb))`
- Reset soft: `repo.reset(target_obj, git2::ResetType::Soft, None)`
- Reset hard: `repo.reset(target_obj, git2::ResetType::Hard, None)`
- Blob from commit: `repo.revparse_single("hash:path")?.as_blob()` — simplest approach; no manual tree walk needed
- Config read: `repo.config()?.get_string("user.name")` (already done in git_commit)

---

## Chunk 1: show (Blob retrieval) + config

### Task 1: `git show hash:path` — native blob retrieval

**Why first:** Simplest to implement, zero risk of breaking the working tree, and directly accelerates the `CommitDiffModal` diff viewer.

**Files:**
- Modify: `src-tauri/src/git_native.rs` (add `git_blob_at_revision_impl`)
- Modify: `src-tauri/src/git_diff.rs` (route `"show"` case)

**Background:** `git show hash:path` outputs the raw file content. The frontend calls it as `invoke('git_execute', { args: ['show', 'abc1234:src/foo.ts'] })` and reads `result.stdout` as the file text. Also supports parent syntax: `abc1234^:src/foo.ts`.

- [ ] **Step 1: Write the unit test (in git_native.rs)**

Add at the bottom of `src-tauri/src/git_native.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn init_test_repo() -> (tempfile::TempDir, git2::Repository) {
        let dir = tempfile::tempdir().unwrap();
        let repo = git2::Repository::init(dir.path()).unwrap();
        {
            let mut config = repo.config().unwrap();
            config.set_str("user.name", "Test").unwrap();
            config.set_str("user.email", "test@test.com").unwrap();
        }
        (dir, repo)
    }

    fn make_commit(repo: &git2::Repository, file: &str, content: &str, msg: &str) -> git2::Oid {
        let path = repo.workdir().unwrap().join(file);
        std::fs::write(&path, content).unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(std::path::Path::new(file)).unwrap();
        index.write().unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let sig = repo.signature().unwrap();
        let parent = repo.head().ok().map(|h| h.peel_to_commit().unwrap());
        let parents: Vec<&git2::Commit> = parent.iter().collect();
        repo.commit(Some("HEAD"), &sig, &sig, msg, &tree, &parents).unwrap()
    }

    #[test]
    fn test_blob_at_revision_exact_hash() {
        let (dir, repo) = init_test_repo();
        let project_path = dir.path().to_str().unwrap().to_string();
        let oid = make_commit(&repo, "hello.txt", "hello world", "first commit");
        let rev = format!("{}:hello.txt", oid);
        let result = git_blob_at_revision_impl(project_path, rev).unwrap();
        assert_eq!(result.stdout, "hello world");
        assert!(result.success);
    }

    #[test]
    fn test_blob_at_revision_parent_syntax() {
        let (dir, repo) = init_test_repo();
        let project_path = dir.path().to_str().unwrap().to_string();
        make_commit(&repo, "hello.txt", "v1", "first");
        let oid2 = make_commit(&repo, "hello.txt", "v2", "second");
        // hash^:path should give v1 (parent content)
        let rev = format!("{}^:hello.txt", oid2);
        let result = git_blob_at_revision_impl(project_path, rev).unwrap();
        assert_eq!(result.stdout, "v1");
    }
}
```

- [ ] **Step 2: Add tempfile dev-dependency**

In `src-tauri/Cargo.toml`, add under `[dev-dependencies]` (create section if missing):

```toml
[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 3: Run test to confirm it fails**

```bash
cd src-tauri && cargo test test_blob_at_revision_exact_hash 2>&1 | head -20
```
Expected: compile error — `git_blob_at_revision_impl` not found yet.

- [ ] **Step 4: Implement `git_blob_at_revision_impl` in git_native.rs**

Add after `git_get_diff_model_native_impl` (around line 673):

```rust
/// Read raw content of a file at any git revision.
/// `rev_path` is a revspec like `"abc1234:src/foo.ts"` or `"HEAD~1:bar.rs"`.
/// Returns the file bytes as UTF-8 text in `stdout` (same contract as `git show`).
pub fn git_blob_at_revision_impl(
    project_path: String,
    rev_path: String,
) -> Result<crate::git_diff::GitResult, String> {
    let repo = repo_open(&project_path)?;
    let obj = repo.revparse_single(&rev_path).map_err(|e| {
        format!("git show {}: {}", rev_path, e)
    })?;
    let blob = obj.peel_to_blob().map_err(|_| {
        format!("'{}' is not a blob (it may be a tree/commit)", rev_path)
    })?;
    let content = String::from_utf8_lossy(blob.content()).into_owned();
    Ok(crate::git_diff::GitResult {
        stdout: content,
        stderr: String::new(),
        success: true,
    })
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd src-tauri && cargo test test_blob_at_revision 2>&1
```
Expected: `test tests::test_blob_at_revision_exact_hash ... ok` and `test tests::test_blob_at_revision_parent_syntax ... ok`

- [ ] **Step 6: Route `"show"` in `git_execute_impl`**

In `src-tauri/src/git_diff.rs`, add a `"show"` arm inside the `match command` block, just before the `"checkout"` arm (around line 258):

```rust
"show" => {
    // args[1] is "hash:path" or "hash^:path"
    let rev_path = args.get(1).cloned().unwrap_or_default();
    tokio::task::spawn_blocking({
        let p = project_path.clone();
        move || crate::git_native::git_blob_at_revision_impl(p, rev_path)
    }).await.map_err(|e| e.to_string())?
}
```

- [ ] **Step 7: cargo check**

```bash
cd src-tauri && cargo check 2>&1
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/git_native.rs src-tauri/src/git_diff.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat(git2): native blob retrieval for git show hash:path"
```

---

### Task 2: `git config` — native read of user.name

**Files:**
- Modify: `src-tauri/src/git_native.rs` (add `git_config_get_impl`)
- Modify: `src-tauri/src/git_diff.rs` (route `"config"` case)

**Background:** `GitTimeline.tsx:185` calls `invoke('git_execute', { args: ['config', 'user.name'] })` and reads `result.stdout.trim()`. The native impl reads from `repo.config()` with global fallback.

- [ ] **Step 1: Write the test**

In the `tests` module at the bottom of `git_native.rs`:

```rust
#[test]
fn test_config_get_user_name() {
    let (dir, _repo) = init_test_repo(); // sets user.name = "Test"
    let result = git_config_get_impl(
        dir.path().to_str().unwrap().to_string(),
        "user.name".to_string(),
    ).unwrap();
    assert_eq!(result.stdout.trim(), "Test");
    assert!(result.success);
}
```

- [ ] **Step 2: Run test to confirm fail**

```bash
cd src-tauri && cargo test test_config_get_user_name 2>&1 | head -10
```
Expected: compile error.

- [ ] **Step 3: Implement**

Add in `git_native.rs` after `git_blob_at_revision_impl`:

```rust
pub fn git_config_get_impl(
    project_path: String,
    key: String,
) -> Result<crate::git_diff::GitResult, String> {
    let repo = repo_open(&project_path)?;
    let config = repo.config().map_err(|e| e.to_string())?;
    match config.get_string(&key) {
        Ok(value) => Ok(crate::git_diff::GitResult {
            stdout: value,
            stderr: String::new(),
            success: true,
        }),
        Err(e) => Ok(crate::git_diff::GitResult {
            stdout: String::new(),
            stderr: e.to_string(),
            success: false,
        }),
    }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd src-tauri && cargo test test_config_get_user_name 2>&1
```

- [ ] **Step 5: Route `"config"` in `git_execute_impl`**

In `src-tauri/src/git_diff.rs`, add before the final `_ =>` arm:

```rust
"config" if args.get(1).map(|a| !a.starts_with("--")).unwrap_or(false) => {
    let key = args.get(1).cloned().unwrap_or_default();
    tokio::task::spawn_blocking({
        let p = project_path.clone();
        move || crate::git_native::git_config_get_impl(p, key)
    }).await.map_err(|e| e.to_string())?
}
```

- [ ] **Step 6: cargo check**

```bash
cd src-tauri && cargo check 2>&1
```

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/git_native.rs src-tauri/src/git_diff.rs
git commit -m "feat(git2): native git config key read"
```

---

## Chunk 2: stash

### Task 3: `git stash` — save, pop, drop

**Why stash before checkout:** Checkout depends on stash (auto-stash before branch switch). Implementing stash first means checkout can call it directly.

**Files:**
- Modify: `src-tauri/src/git_native.rs` (add stash impls)
- Modify: `src-tauri/src/git_diff.rs` (route `"stash"` subcommands)

**Background:** git2 stash operations require `&mut Repository`. The stash index is parsed from the `stash@{N}` string pattern.

**Stash call patterns in the frontend:**
- `['stash', 'save', 'message text']` → save with message
- `['stash', 'pop', 'stash@{0}']` → pop by index
- `['stash', 'pop']` → pop index 0 (top)
- `['stash', 'drop', 'stash@{0}']` → drop by index

- [ ] **Step 1: Write tests**

In the `tests` module:

```rust
#[test]
fn test_stash_save_and_pop() {
    let (dir, repo) = init_test_repo();
    let project_path = dir.path().to_str().unwrap().to_string();
    // Create initial commit so HEAD exists
    make_commit(&repo, "file.txt", "initial", "init");
    // Make a dirty change
    std::fs::write(dir.path().join("file.txt"), "dirty").unwrap();

    // Save stash
    let save_res = git_stash_save_impl(project_path.clone(), "my stash".to_string()).unwrap();
    assert!(save_res.success, "stash save failed: {}", save_res.stderr);

    // Workdir should be clean now
    let content = std::fs::read_to_string(dir.path().join("file.txt")).unwrap();
    assert_eq!(content, "initial");

    // Pop stash (index 0)
    let pop_res = git_stash_pop_impl(project_path.clone(), 0).unwrap();
    assert!(pop_res.success, "stash pop failed: {}", pop_res.stderr);

    // Workdir should have the dirty change back
    let content = std::fs::read_to_string(dir.path().join("file.txt")).unwrap();
    assert_eq!(content, "dirty");
}

#[test]
fn test_stash_drop() {
    let (dir, repo) = init_test_repo();
    let project_path = dir.path().to_str().unwrap().to_string();
    make_commit(&repo, "file.txt", "initial", "init");
    std::fs::write(dir.path().join("file.txt"), "dirty").unwrap();
    git_stash_save_impl(project_path.clone(), "to drop".to_string()).unwrap();

    let drop_res = git_stash_drop_impl(project_path.clone(), 0).unwrap();
    assert!(drop_res.success, "stash drop failed: {}", drop_res.stderr);
}
```

- [ ] **Step 2: Run to confirm fail**

```bash
cd src-tauri && cargo test test_stash 2>&1 | head -10
```
Expected: compile error.

- [ ] **Step 3: Implement stash functions in `git_native.rs`**

Add after `git_config_get_impl`:

```rust
fn parse_stash_index(stash_ref: &str) -> usize {
    // Parses "stash@{N}" → N. Returns 0 as default.
    stash_ref
        .trim_start_matches("stash@{")
        .trim_end_matches('}')
        .parse()
        .unwrap_or(0)
}

pub fn git_stash_save_impl(
    project_path: String,
    message: String,
) -> Result<crate::git_diff::GitResult, String> {
    let mut repo = repo_open(&project_path)?;
    let config = repo.config().map_err(|e| e.to_string())?;
    let name = config.get_string("user.name").unwrap_or_else(|_| "Unknown".into());
    let email = config.get_string("user.email").unwrap_or_else(|_| "unknown@example.com".into());
    let sig = git2::Signature::now(&name, &email).map_err(|e| e.to_string())?;

    let oid = repo
        .stash_save(&sig, &message, Some(git2::StashFlags::DEFAULT))
        .map_err(|e| format!("stash save: {}", e))?;

    Ok(crate::git_diff::GitResult {
        stdout: format!("Saved working directory and index state: {}", &oid.to_string()[..7]),
        stderr: String::new(),
        success: true,
    })
}

pub fn git_stash_pop_impl(
    project_path: String,
    index: usize,
) -> Result<crate::git_diff::GitResult, String> {
    let mut repo = repo_open(&project_path)?;
    let mut opts = git2::StashApplyOptions::new();
    opts.checkout_options({
        let mut co = git2::build::CheckoutBuilder::new();
        co.safe();
        co
    });

    repo.stash_pop(index, Some(&mut opts))
        .map_err(|e| format!("stash pop: {}", e))?;

    Ok(crate::git_diff::GitResult {
        stdout: format!("Dropped stash@{{{}}}", index),
        stderr: String::new(),
        success: true,
    })
}

pub fn git_stash_drop_impl(
    project_path: String,
    index: usize,
) -> Result<crate::git_diff::GitResult, String> {
    let mut repo = repo_open(&project_path)?;
    repo.stash_drop(index)
        .map_err(|e| format!("stash drop: {}", e))?;

    Ok(crate::git_diff::GitResult {
        stdout: format!("Dropped stash@{{{}}}", index),
        stderr: String::new(),
        success: true,
    })
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd src-tauri && cargo test test_stash 2>&1
```

- [ ] **Step 5: Route `"stash"` in `git_execute_impl`**

In `src-tauri/src/git_diff.rs`, replace the current `"checkout"` CLI fallback line (line 258) with the block below. Add BEFORE `"checkout"`:

```rust
"stash" => {
    let sub = args.get(1).map(|s| s.as_str()).unwrap_or("");
    match sub {
        "save" => {
            let msg = args.get(2).cloned().unwrap_or_else(|| "WIP".into());
            tokio::task::spawn_blocking({
                let p = project_path.clone();
                move || crate::git_native::git_stash_save_impl(p, msg)
            }).await.map_err(|e| e.to_string())?
        }
        "pop" => {
            let idx = args.get(2)
                .map(|s| crate::git_native::parse_stash_index_pub(s))
                .unwrap_or(0);
            tokio::task::spawn_blocking({
                let p = project_path.clone();
                move || crate::git_native::git_stash_pop_impl(p, idx)
            }).await.map_err(|e| e.to_string())?
        }
        "drop" => {
            let idx = args.get(2)
                .map(|s| crate::git_native::parse_stash_index_pub(s))
                .unwrap_or(0);
            tokio::task::spawn_blocking({
                let p = project_path.clone();
                move || crate::git_native::git_stash_drop_impl(p, idx)
            }).await.map_err(|e| e.to_string())?
        }
        _ => git_cli_fallback(&app_handle, &project_path, &args).await,
    }
}
```

Also make `parse_stash_index` public in `git_native.rs`:

```rust
pub fn parse_stash_index_pub(stash_ref: &str) -> usize {
    parse_stash_index(stash_ref)
}
```

- [ ] **Step 6: cargo check**

```bash
cd src-tauri && cargo check 2>&1
```

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/git_native.rs src-tauri/src/git_diff.rs
git commit -m "feat(git2): native stash save/pop/drop"
```

---

## Chunk 3: checkout

### Task 4: `git checkout <branch>` — native branch switch

**Files:**
- Modify: `src-tauri/src/git_native.rs` (add `git_checkout_branch_impl`)
- Modify: `src-tauri/src/git_diff.rs` (route `"checkout"` case)

**Background:** Two call sites:
- `GitSidebar.tsx:234`: `['checkout', branchName]` — switch to existing local branch
- `MergePRModal.tsx:167`: `['checkout', pr.headBranch]` — may be a remote tracking branch

The implementation must handle:
1. Local branch exists → set HEAD + checkout tree
2. Branch doesn't exist locally but exists as `origin/<name>` → create tracking local branch, then checkout

**git2 checkout flow:**
```
repo.set_head("refs/heads/<name>")  // moves HEAD symbolically
repo.checkout_head(Some(&mut CheckoutBuilder::new().safe()))  // updates workdir
```

- [ ] **Step 1: Write tests**

```rust
#[test]
fn test_checkout_existing_branch() {
    let (dir, repo) = init_test_repo();
    let project_path = dir.path().to_str().unwrap().to_string();
    make_commit(&repo, "a.txt", "hello", "init");

    // Create a second branch from current HEAD
    let head = repo.head().unwrap().peel_to_commit().unwrap();
    repo.branch("feature", &head, false).unwrap();

    // Now checkout feature
    let res = git_checkout_branch_impl(project_path.clone(), "feature".to_string()).unwrap();
    assert!(res.success, "checkout failed: {}", res.stderr);

    // HEAD should now be on feature
    let new_head = repo.head().unwrap();
    assert_eq!(new_head.shorthand().unwrap(), "feature");
}

#[test]
fn test_checkout_current_branch_is_noop() {
    let (dir, repo) = init_test_repo();
    let project_path = dir.path().to_str().unwrap().to_string();
    make_commit(&repo, "a.txt", "hello", "init");
    let branch = repo.head().unwrap().shorthand().unwrap().to_string();

    // Checking out the current branch should succeed without error
    let res = git_checkout_branch_impl(project_path, branch).unwrap();
    assert!(res.success);
}
```

- [ ] **Step 2: Run to confirm fail**

```bash
cd src-tauri && cargo test test_checkout 2>&1 | head -10
```

- [ ] **Step 3: Implement in `git_native.rs`**

Add after `parse_stash_index_pub`:

```rust
pub fn git_checkout_branch_impl(
    project_path: String,
    branch_name: String,
) -> Result<crate::git_diff::GitResult, String> {
    let repo = repo_open(&project_path)?;

    // If already on this branch, it's a no-op
    if let Ok(head) = repo.head() {
        if head.shorthand() == Some(branch_name.as_str()) {
            return Ok(crate::git_diff::GitResult {
                stdout: format!("Already on '{}'", branch_name),
                stderr: String::new(),
                success: true,
            });
        }
    }

    // Try to find a local branch first
    let local_ref = format!("refs/heads/{}", branch_name);
    let has_local = repo.find_reference(&local_ref).is_ok();

    if !has_local {
        // Check for remote tracking branch origin/<name> and create local tracking branch
        let remote_ref = format!("refs/remotes/origin/{}", branch_name);
        if let Ok(remote) = repo.find_reference(&remote_ref) {
            let remote_commit = remote.peel_to_commit().map_err(|e| e.to_string())?;
            let mut new_branch = repo.branch(&branch_name, &remote_commit, false)
                .map_err(|e| format!("create branch: {}", e))?;
            // Set upstream tracking
            new_branch
                .set_upstream(Some(&format!("origin/{}", branch_name)))
                .ok(); // non-fatal if it fails
        } else {
            return Err(format!(
                "Branch '{}' not found locally or at origin",
                branch_name
            ));
        }
    }

    // Move HEAD and update workdir
    repo.set_head(&local_ref).map_err(|e| format!("set_head: {}", e))?;
    let mut co = git2::build::CheckoutBuilder::new();
    co.safe();
    repo.checkout_head(Some(&mut co))
        .map_err(|e| format!("checkout_head: {}", e))?;

    Ok(crate::git_diff::GitResult {
        stdout: format!("Switched to branch '{}'", branch_name),
        stderr: String::new(),
        success: true,
    })
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd src-tauri && cargo test test_checkout 2>&1
```

- [ ] **Step 5: Route `"checkout"` in `git_execute_impl`**

Replace the current CLI fallback for `"checkout"` (line 258 in git_diff.rs):

```rust
// BEFORE (remove this):
"checkout" => git_cli_fallback(&app_handle, &project_path, &args).await,

// AFTER:
"checkout" => {
    let branch = args.get(1).cloned().unwrap_or_default();
    if branch.is_empty() || args.contains(&"-b".to_string()) {
        // -b (create branch) or other flags → fall back to CLI for now
        git_cli_fallback(&app_handle, &project_path, &args).await
    } else {
        tokio::task::spawn_blocking({
            let p = project_path.clone();
            move || crate::git_native::git_checkout_branch_impl(p, branch)
        }).await.map_err(|e| e.to_string())?
    }
}
```

**Note on `-b` flag:** Creating new branches is not currently called from the UI based on the grep results. Keeping it as CLI fallback is safe — it can be migrated in a follow-up.

- [ ] **Step 6: cargo check**

```bash
cd src-tauri && cargo check 2>&1
```

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/git_native.rs src-tauri/src/git_diff.rs
git commit -m "feat(git2): native checkout branch (switch existing/tracking)"
```

---

## Chunk 4: restore + reset

### Task 5: `git restore <path>` — workdir checkout from index

**Files:**
- Modify: `src-tauri/src/git_native.rs` (add `git_restore_workdir_impl`)
- Modify: `src-tauri/src/git_diff.rs` (route `restore` without `--staged`)

**Background:** Three call sites:
- `GitStagingPanel.tsx:312`: `['restore', node.fullPath]`
- `GitStagingPanel.tsx:334`: `['restore', path]`
- `GitDiffViewer.tsx:159`: `['restore', '--staged', '--', file]` — already handled natively

The `restore <path>` (no `--staged`) discards workdir changes by checking out from the index.

**git2 approach:** `CheckoutBuilder::path(file).force()` + `repo.checkout_index(None, Some(&mut cb))`.

- [ ] **Step 1: Write test**

```rust
#[test]
fn test_restore_workdir() {
    let (dir, repo) = init_test_repo();
    let project_path = dir.path().to_str().unwrap().to_string();
    make_commit(&repo, "a.txt", "committed content", "init");

    // Make a dirty workdir change
    std::fs::write(dir.path().join("a.txt"), "dirty").unwrap();

    // Restore the file
    let res = git_restore_workdir_impl(project_path.clone(), "a.txt".to_string()).unwrap();
    assert!(res.success, "{}", res.stderr);

    // File should be back to committed content
    let content = std::fs::read_to_string(dir.path().join("a.txt")).unwrap();
    assert_eq!(content, "committed content");
}
```

- [ ] **Step 2: Run to confirm fail**

```bash
cd src-tauri && cargo test test_restore_workdir 2>&1 | head -10
```

- [ ] **Step 3: Implement**

Add in `git_native.rs`:

```rust
pub fn git_restore_workdir_impl(
    project_path: String,
    file_path: String,
) -> Result<crate::git_diff::GitResult, String> {
    let repo = repo_open(&project_path)?;
    let mut cb = git2::build::CheckoutBuilder::new();
    cb.path(&file_path).force().update_index(false);
    repo.checkout_index(None, Some(&mut cb))
        .map_err(|e| format!("restore {}: {}", file_path, e))?;
    Ok(crate::git_diff::GitResult {
        stdout: format!("Restored '{}'", file_path),
        stderr: String::new(),
        success: true,
    })
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd src-tauri && cargo test test_restore_workdir 2>&1
```

- [ ] **Step 5: Update the `"restore"` arm in `git_execute_impl`**

The current arm only handles `--staged`. Extend it:

```rust
// BEFORE:
"restore" if args.contains(&"--staged".to_string()) => { ... }

// AFTER (keep existing staged arm, add new arm):
"restore" if args.contains(&"--staged".to_string()) => {
    // existing implementation (unchanged)
    ...
}
"restore" => {
    // workdir restore (no --staged flag)
    let path = args.iter()
        .find(|a| *a != "restore" && *a != "--" && !a.starts_with('-'))
        .cloned()
        .unwrap_or_else(|| ".".into());
    tokio::task::spawn_blocking({
        let p = project_path.clone();
        move || crate::git_native::git_restore_workdir_impl(p, path)
    }).await.map_err(|e| e.to_string())?
}
```

- [ ] **Step 6: cargo check**

```bash
cd src-tauri && cargo check 2>&1
```

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/git_native.rs src-tauri/src/git_diff.rs
git commit -m "feat(git2): native restore workdir (discard changes)"
```

---

### Task 6: `git reset --soft HEAD~1` — soft reset

**Files:**
- Modify: `src-tauri/src/git_native.rs` (add `git_reset_soft_impl`, `git_reset_hard_impl`)
- Modify: `src-tauri/src/git_diff.rs` (route `"reset"` with `--soft`/`--hard`)

**Background:** `GitTimeline.tsx:264` calls `['reset', '--soft', 'HEAD~1']`. The function must resolve the target ref (e.g. `HEAD~1` or a full hash) and call `repo.reset(obj, ResetType::Soft, None)`.

**git2 approach:** `repo.revparse_single("HEAD~1")?.peel_to_commit()?.into_object()` → `repo.reset(&obj, Soft, None)`.

- [ ] **Step 1: Write tests**

```rust
#[test]
fn test_reset_soft() {
    let (dir, repo) = init_test_repo();
    let project_path = dir.path().to_str().unwrap().to_string();
    make_commit(&repo, "a.txt", "v1", "first");
    make_commit(&repo, "a.txt", "v2", "second");

    // Soft reset to HEAD~1 — keep changes staged
    let res = git_reset_soft_impl(project_path.clone(), "HEAD~1".to_string()).unwrap();
    assert!(res.success, "{}", res.stderr);

    // HEAD should now point to first commit
    let head_msg = repo.head().unwrap().peel_to_commit().unwrap().message().unwrap().to_string();
    assert!(head_msg.contains("first"));
}

#[test]
fn test_reset_hard() {
    let (dir, repo) = init_test_repo();
    let project_path = dir.path().to_str().unwrap().to_string();
    make_commit(&repo, "a.txt", "v1", "first");
    make_commit(&repo, "a.txt", "v2", "second");

    let first_hash = repo.revparse_single("HEAD~1").unwrap().id().to_string();
    let res = git_reset_hard_impl(project_path.clone(), first_hash).unwrap();
    assert!(res.success, "{}", res.stderr);

    let content = std::fs::read_to_string(dir.path().join("a.txt")).unwrap();
    assert_eq!(content, "v1");
}
```

- [ ] **Step 2: Run to confirm fail**

```bash
cd src-tauri && cargo test test_reset_ 2>&1 | head -10
```

- [ ] **Step 3: Implement**

Add in `git_native.rs`:

```rust
fn resolve_to_commit_object(repo: &git2::Repository, target: &str) -> Result<git2::Object, String> {
    repo.revparse_single(target)
        .map_err(|e| format!("resolve '{}': {}", target, e))?
        .peel(git2::ObjectType::Commit)
        .map_err(|e| format!("peel to commit '{}': {}", target, e))
}

pub fn git_reset_soft_impl(
    project_path: String,
    target: String,
) -> Result<crate::git_diff::GitResult, String> {
    let repo = repo_open(&project_path)?;
    let obj = resolve_to_commit_object(&repo, &target)?;
    repo.reset(&obj, git2::ResetType::Soft, None)
        .map_err(|e| format!("reset --soft: {}", e))?;
    Ok(crate::git_diff::GitResult {
        stdout: format!("HEAD is now at (soft reset to {})", &target),
        stderr: String::new(),
        success: true,
    })
}

pub fn git_reset_hard_impl(
    project_path: String,
    target: String,
) -> Result<crate::git_diff::GitResult, String> {
    let repo = repo_open(&project_path)?;
    let obj = resolve_to_commit_object(&repo, &target)?;
    let mut co = git2::build::CheckoutBuilder::new();
    co.force();
    repo.reset(&obj, git2::ResetType::Hard, Some(&mut co))
        .map_err(|e| format!("reset --hard: {}", e))?;
    Ok(crate::git_diff::GitResult {
        stdout: format!("HEAD is now at (hard reset to {})", &target),
        stderr: String::new(),
        success: true,
    })
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd src-tauri && cargo test test_reset_ 2>&1
```

- [ ] **Step 5: Route `"reset"` in `git_execute_impl`**

Add before the final `_ =>` fallback arm:

```rust
"reset" => {
    let mode = args.iter().find(|a| a.starts_with("--")).cloned();
    let target = args.iter()
        .rev()
        .find(|a| !a.starts_with('-'))
        .cloned()
        .unwrap_or_else(|| "HEAD".into());

    match mode.as_deref() {
        Some("--soft") => tokio::task::spawn_blocking({
            let p = project_path.clone();
            move || crate::git_native::git_reset_soft_impl(p, target)
        }).await.map_err(|e| e.to_string())?,
        Some("--hard") => tokio::task::spawn_blocking({
            let p = project_path.clone();
            move || crate::git_native::git_reset_hard_impl(p, target)
        }).await.map_err(|e| e.to_string())?,
        // --mixed and other modes → CLI fallback
        _ => git_cli_fallback(&app_handle, &project_path, &args).await,
    }
}
```

- [ ] **Step 6: cargo check**

```bash
cd src-tauri && cargo check 2>&1
```

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/git_native.rs src-tauri/src/git_diff.rs
git commit -m "feat(git2): native reset --soft and --hard"
```

---

## Chunk 5: final verification

### Task 7: Full integration verification

- [ ] **Step 1: Run all unit tests**

```bash
cd src-tauri && cargo test 2>&1
```
Expected: all tests pass, no compilation errors.

- [ ] **Step 2: Build check**

```bash
npm run build 2>&1 | tail -20
```
Expected: TypeScript + Vite build succeeds.

- [ ] **Step 3: Manual smoke test checklist**

Open Microtermix (`npm run tauri dev`) and verify the following in the Git panel:

| Action | Expected |
|---|---|
| Click on a different branch in GitSidebar | Branch switches instantly, no terminal window opens |
| Stash button on GitSidebar with dirty workdir | Changes disappear from status, stash appears in list |
| Apply stash from list | Changes reappear in workdir |
| Drop stash from list | Stash entry removed |
| Click "Undo commit" in GitTimeline | HEAD moves back, changes appear staged |
| Open CommitDiffModal on a commit | Diff loads without spawning a git process |
| GitTimeline shows user name | User name appears from git config |
| Discard changes on a file in staging | File reverts to committed state |

- [ ] **Step 4: Final commit**

```bash
git add -p  # stage any leftover changes
git commit -m "chore: verify git2 migration complete"
```

---

## Summary of CLI fallbacks remaining after this plan

These still use `git_cli_fallback` (intentional — scope is out of plan):

| Command | Reason to keep as CLI |
|---|---|
| `checkout -b <name>` | Create + switch — not called from UI currently |
| `rebase` | Complex conflict resolution — interactive use |
| `merge` | Same as rebase |
| `stash apply` (without pop) | Not used in current UI |
| `reset --mixed` | Not used in current UI |
| `git_reword_commit` non-HEAD | Uses `rebase -i` with temp scripts — complex to replicate |
