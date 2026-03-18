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
