#![cfg_attr(test, allow(clippy::unwrap_used, clippy::panic))]

pub mod hotkey;
pub mod launcher;
pub mod mock;
pub mod notification;
pub mod traits;

#[cfg(all(unix, not(target_os = "macos")))]
pub mod linux;

#[cfg(target_os = "macos")]
pub mod macos;

#[cfg(target_os = "windows")]
pub mod windows;

pub use hotkey::*;
pub use mock::*;
use std::sync::Arc;
pub use traits::*;

/// Create the default platform provider instance for the current runtime OS
pub fn create_default_platform_provider() -> Arc<dyn PlatformProvider> {
    #[cfg(target_os = "windows")]
    {
        Arc::new(windows::WindowsPlatformProvider::default())
    }

    #[cfg(target_os = "macos")]
    {
        Arc::new(macos::MacOsPlatformProvider::default())
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Arc::new(linux::LinuxPlatformProvider::new())
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", unix)))]
    {
        Arc::new(mock::MockPlatformProvider::new())
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;
    use bbq_core::{LauncherAction, NotificationCategory, NotificationRequest};

    #[tokio::test]
    async fn test_mock_launcher_operations() {
        let provider = MockPlatformProvider::new();
        let launcher = provider.launcher();

        let caps = launcher.capabilities().await.unwrap();
        assert!(caps.open_url);
        assert!(caps.open_file);
        assert!(caps.open_folder);
        assert!(caps.open_application);

        // Open URL
        launcher.open_url("https://antigravity.dev").await.unwrap();
        assert_eq!(
            provider.launcher.get_opened_urls().as_slice(),
            &["https://antigravity.dev".to_string()]
        );

        // Invalid URL should fail validation
        assert!(launcher.open_url("javascript:void(0)").await.is_err());

        // Open file and folder
        launcher.open_file("/path/to/file.txt").await.unwrap();
        assert_eq!(
            provider.launcher.get_opened_files().as_slice(),
            &["/path/to/file.txt".to_string()]
        );

        launcher.open_folder("/path/to/folder").await.unwrap();
        assert_eq!(
            provider.launcher.get_opened_folders().as_slice(),
            &["/path/to/folder".to_string()]
        );

        // Open application
        launcher.open_application("calc").await.unwrap();
        assert_eq!(
            provider.launcher.get_opened_applications().as_slice(),
            &["calc".to_string()]
        );

        // Launch general action
        let action = LauncherAction::OpenUrl {
            url: "https://example.com".to_string(),
        };
        launcher.launch(&action).await.unwrap();
        assert_eq!(provider.launcher.get_launched_actions().len(), 1);
    }

    #[tokio::test]
    async fn test_mock_file_operations() {
        let provider = MockPlatformProvider::new();
        let file = provider.file();

        // Register custom simulated file
        provider.file.add_simulated_file(FileMetadataInfo {
            path: "/test/document.pdf".to_string(),
            name: "document.pdf".to_string(),
            extension: Some("pdf".to_string()),
            size_bytes: 5242880,
            modified_at: Some(1670000000),
            is_directory: false,
        });

        let meta = file.validate_path("/test/document.pdf").await.unwrap();
        assert_eq!(meta.name, "document.pdf");
        assert_eq!(meta.size_bytes, 5242880);
        assert!(!meta.is_directory);

        // Test open and reveal tracking
        file.open("/test/document.pdf").await.unwrap();
        assert_eq!(
            provider.file.opened.lock().unwrap().as_slice(),
            &["/test/document.pdf".to_string()]
        );

        file.reveal("/test/document.pdf").await.unwrap();
        assert_eq!(
            provider.file.revealed.lock().unwrap().as_slice(),
            &["/test/document.pdf".to_string()]
        );

        // Test invalid path simulation
        let err = file.validate_path("/path/nonexistent.txt").await;
        assert!(err.is_err());
    }

    #[test]
    fn test_mock_notification_operations() {
        let provider = MockPlatformProvider::new();
        let notif = provider.notification();

        assert_eq!(provider.notification.notification_count(), 0);
        let caps = notif.capabilities().unwrap();
        assert!(caps.available);

        let req = NotificationRequest::new(
            "notif-test",
            NotificationCategory::Timer,
            "Timer Done",
            "Countdown has ended",
        )
        .unwrap();

        notif.notify(&req).unwrap();
        assert_eq!(provider.notification.notification_count(), 1);
        let last = provider.notification.last_notification().unwrap();
        assert_eq!(last.id, "notif-test");
        assert_eq!(last.title, "Timer Done");
        assert_eq!(last.body, "Countdown has ended");
        assert_eq!(last.category, NotificationCategory::Timer);

        // Test unavailable capability simulation
        provider.notification.set_available(false);
        assert!(!notif.capabilities().unwrap().available);
        assert!(notif.notify(&req).is_err());

        // Test clear
        provider.notification.clear();
        assert_eq!(provider.notification.notification_count(), 0);
    }
}
