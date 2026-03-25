use std::process::Command as StdCommand;
use tokio::process::Command as AsyncCommand;

#[cfg(target_os = "windows")]
pub const CREATE_NO_WINDOW: u32 = 0x08000000;

pub fn silent_command(program: &str) -> StdCommand {
    let cmd = StdCommand::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = cmd;
        cmd.creation_flags(CREATE_NO_WINDOW);
        return cmd;
    }
    cmd
}

pub fn silent_async_command(program: &str) -> AsyncCommand {
    let cmd = AsyncCommand::new(program);
    #[cfg(target_os = "windows")]
    {
        let mut cmd = cmd;
        cmd.creation_flags(CREATE_NO_WINDOW);
        return cmd;
    }
    cmd
}

/// On non-Windows, tries to load the user's shell PATH.
pub fn fix_path_env() {
    #[cfg(not(target_os = "windows"))]
    {
        use std::env;
        // If we already have a reasonably long path, we might still need to fix it
        // because GUI apps on Linux/macOS are often launched with a very minimal PATH.
        
        let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
        
        // We run the shell as a login shell and ask for the PATH.
        // Some users might have nvm/node paths in .bashrc (interactive) instead of .profile (login).
        // Using -l (login) is usually standard for this, but sometimes -i (interactive) is needed.
        // We'll try to get the PATH from a login shell first.
        let output = StdCommand::new(&shell)
            .args(["-l", "-i", "-c", "echo $PATH"])
            .output();

        if let Ok(out) = output {
            let path_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
            // Basic sanity check: path should contain more than just /usr/bin and /bin
            if !path_str.is_empty() && path_str.contains(':') {
                env::set_var("PATH", path_str);
            }
        } else {
            // Fallback for shells that might not like -i -l together or other issues
            let output_simple = StdCommand::new(&shell)
                .args(["-l", "-c", "echo $PATH"])
                .output();
            if let Ok(out) = output_simple {
                let path_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !path_str.is_empty() {
                    env::set_var("PATH", path_str);
                }
            }
        }
    }
}
