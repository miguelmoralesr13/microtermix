use std::process::Command as StdCommand;
use tokio::process::Command as AsyncCommand;

#[cfg(target_os = "windows")]
pub const CREATE_NO_WINDOW: u32 = 0x08000000;

pub fn silent_command(program: &str) -> StdCommand {
    let mut cmd = StdCommand::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

pub fn silent_async_command(program: &str) -> AsyncCommand {
    let mut cmd = AsyncCommand::new(program);
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}
