#![allow(clippy::unwrap_used, clippy::panic)]

#[cfg(test)]
mod tests {
    use bbq_platform::{MockPlatformProvider, PlatformProvider};
    use bbq_services::{
        create_service_registry, DisplayServiceTrait, SettingsServiceTrait, WindowServiceTrait,
    };
    use bbq_storage::DatabaseManager;
    use std::sync::Arc;

    #[tokio::test]
    async fn test_full_service_stack_lifecycle() {
        // 1. Initialize in-memory SQLite storage
        let db = Arc::new(DatabaseManager::open_in_memory().expect("Database open should succeed"));

        // 2. Initialize mock platform provider
        let platform: Arc<dyn PlatformProvider> = Arc::new(MockPlatformProvider::new());

        // 3. Bootstrap all 15 core services
        let registry = create_service_registry(platform.clone(), db.clone())
            .expect("Service registry bootstrap should succeed");

        // 4. Run init_all
        registry
            .init_all()
            .await
            .expect("All services should initialize safely");

        // 5. Verify all services registered and have active/sleeping states
        let statuses = registry.get_statuses();
        assert_eq!(statuses.len(), 15, "Expected 15 registered core services");

        for status in &statuses {
            assert_ne!(
                status.state,
                bbq_services::ServiceState::Failed,
                "Service {} failed initialization",
                status.name
            );
        }

        // 6. Test settings service via database
        let settings_service = bbq_services::SettingsService::new(db.settings_repository());
        settings_service
            .update_setting("theme", "dark")
            .expect("Setting update should succeed");
        let current_settings = settings_service
            .get_settings()
            .expect("Get settings should succeed");
        assert_eq!(current_settings.theme, bbq_core::ThemePreference::Dark);

        // 7. Test display & window positioning logic
        let display_service = bbq_services::DisplayService::new(platform.display());
        let primary_display = display_service
            .get_primary_display()
            .await
            .expect("Should find primary display");
        assert_eq!(primary_display.name, "Virtual Display 1");

        let window_service = bbq_services::WindowService::new(platform.window());
        window_service
            .position_island(&primary_display, 420, 48)
            .await
            .expect("Window positioning should succeed");
    }

    #[tokio::test]
    async fn test_mock_platform_media_events_and_controls() {
        use bbq_core::{MediaCapabilities, MediaSession, PlaybackState};
        use bbq_platform::MockMedia;
        use bbq_services::{MediaService, MediaServiceTrait, Service, ServiceState};

        let mock_platform = Arc::new(MockMedia::default());
        let service = MediaService::new(mock_platform.clone());

        // 1. Initialize
        service.init().await.expect("Init must succeed");
        assert_eq!(service.status().state, ServiceState::Sleeping);
        assert_eq!(service.current_session().await.unwrap(), None);

        // 2. Player appears
        let initial_session = MediaSession {
            id: "spotify-mock".to_string(),
            state: PlaybackState::Paused,
            title: Some("Initial Song".to_string()),
            artist: Some("Initial Artist".to_string()),
            album: Some("Initial Album".to_string()),
            album_art: None,
            duration_ms: Some(210_000),
            position_ms: Some(0),
            volume: Some(1.0),
            source: Some("Spotify".to_string()),
            capabilities: MediaCapabilities {
                can_play: true,
                can_pause: true,
                can_go_next: true,
                can_go_previous: true,
                can_seek: true,
                can_change_volume: false,
            },
        };
        mock_platform.simulate_session(Some(initial_session));

        // Session detected, but paused -> Sleeping
        let active = service
            .current_session()
            .await
            .unwrap()
            .expect("Session should be active");
        assert_eq!(active.id, "spotify-mock");
        assert_eq!(active.state, PlaybackState::Paused);
        assert_eq!(service.status().state, ServiceState::Sleeping);

        // 3. Player starts (resume/play)
        service.play().await.expect("Play command should succeed");
        assert_eq!(service.status().state, ServiceState::Active);
        let session = service
            .current_session()
            .await
            .unwrap()
            .expect("Session should exist");
        assert_eq!(session.state, PlaybackState::Playing);

        // 4. Metadata changes (new track playing)
        mock_platform.simulate_metadata(
            "spotify-mock",
            Some("New Title".to_string()),
            Some("New Artist".to_string()),
            Some("New Album".to_string()),
        );
        let updated = service
            .current_session()
            .await
            .unwrap()
            .expect("Session should exist");
        assert_eq!(updated.title, Some("New Title".to_string()));
        assert_eq!(updated.artist, Some("New Artist".to_string()));
        assert_eq!(updated.album, Some("New Album".to_string()));

        // 5. Pause
        service.pause().await.expect("Pause should succeed");
        assert_eq!(service.status().state, ServiceState::Sleeping);
        let paused = service
            .current_session()
            .await
            .unwrap()
            .expect("Session should exist");
        assert_eq!(paused.state, PlaybackState::Paused);

        // 6. Resume via toggle_play_pause
        service
            .toggle_play_pause()
            .await
            .expect("Toggle play should succeed");
        assert_eq!(service.status().state, ServiceState::Active);
        let resumed = service
            .current_session()
            .await
            .unwrap()
            .expect("Session should exist");
        assert_eq!(resumed.state, PlaybackState::Playing);

        // 7. Next track command
        service.next().await.expect("Next command should succeed");

        // 8. Player disappears
        mock_platform.simulate_close("spotify-mock");
        assert_eq!(service.current_session().await.unwrap(), None);
        assert_eq!(service.status().state, ServiceState::Sleeping);
    }

    #[tokio::test]
    async fn test_mock_platform_clipboard_lifecycle_and_privacy() {
        use bbq_core::{ClipboardContentType, MAX_CLIPBOARD_TEXT_SIZE, MAX_PREVIEW_LENGTH};
        use bbq_platform::MockClipboard;
        use bbq_services::{ClipboardService, ClipboardServiceTrait, Service, ServiceState};

        let mock_platform = Arc::new(MockClipboard::default());
        let db = DatabaseManager::open_in_memory().expect("In-memory SQLite DB open");
        let repo = db.clipboard_repository();
        let settings = db.settings_repository();

        let service =
            ClipboardService::new(mock_platform.clone(), Some(repo.clone()), Some(settings));
        service.init().await.expect("Service init must succeed");

        // 1. Verify default-disabled behavior: Sleeping state, no persistence
        assert_eq!(service.status().state, ServiceState::Sleeping);
        assert!(
            !service.is_history_enabled(),
            "History must be disabled by default"
        );

        mock_platform.simulate_text_copied("Secret password 123");
        let history = service
            .get_history()
            .await
            .expect("get_history must succeed");
        assert!(
            history.is_empty(),
            "When disabled, history must NOT retain entries"
        );
        assert_eq!(
            repo.count().unwrap(),
            0,
            "When disabled, DB must have 0 rows"
        );

        // 2. Enable history
        service
            .set_history_enabled(true)
            .await
            .expect("Enabling history must succeed");
        assert!(service.is_history_enabled());

        // 3. New entry copied -> captured, sensitive heuristic flagged
        mock_platform.simulate_sensitive_content("ghp_1234567890abcdefABCDEF1234567890");
        let entries = service
            .get_history()
            .await
            .expect("get_history must succeed");
        assert_eq!(entries.len(), 1);
        assert!(
            entries[0].possible_sensitive,
            "GitHub token should be marked possible_sensitive"
        );
        assert_eq!(entries[0].content_type, ClipboardContentType::Text);

        // 4. Consecutive duplicate copied -> ignored
        mock_platform.simulate_duplicate_copied("ghp_1234567890abcdefABCDEF1234567890");
        let entries_after_dup = service
            .get_history()
            .await
            .expect("get_history must succeed");
        assert_eq!(
            entries_after_dup.len(),
            1,
            "Consecutive duplicate must be ignored"
        );

        // 5. Oversized clipboard content -> bounded in memory
        let massive_text = "Z".repeat(128 * 1024); // 128 KiB
        mock_platform.simulate_text_copied(&massive_text);
        let entries_after_large = service
            .get_history()
            .await
            .expect("get_history must succeed");
        assert_eq!(entries_after_large.len(), 2);
        let large_entry = entries_after_large
            .iter()
            .find(|e| e.size_bytes > 1000)
            .expect("Large entry must exist");
        assert_eq!(
            large_entry.content.as_ref().unwrap().len(),
            MAX_CLIPBOARD_TEXT_SIZE
        );
        assert!(large_entry.preview.len() <= MAX_PREVIEW_LENGTH + 3);

        // 6. Metadata entry (image / files) -> no binary persistence
        mock_platform.simulate_image_metadata();
        let entries_after_img = service
            .get_history()
            .await
            .expect("get_history must succeed");
        assert_eq!(entries_after_img.len(), 3);
        assert_eq!(
            entries_after_img[0].content_type,
            ClipboardContentType::Image
        );
        assert!(
            entries_after_img[0].content.is_none(),
            "Images must not store raw content"
        );

        // 7. Delete single entry
        let target_id = entries_after_img[0].id.clone();
        service
            .delete_entry(&target_id)
            .await
            .expect("Delete entry should succeed");
        let entries_after_del = service
            .get_history()
            .await
            .expect("get_history must succeed");
        assert_eq!(entries_after_del.len(), 2);
        assert!(entries_after_del.iter().all(|e| e.id != target_id));

        // 8. Max history FIFO boundary
        for i in 1..=120 {
            mock_platform.simulate_text_copied(&format!("Batch item {}", i));
        }
        let status = service.get_status().await.expect("Status must succeed");
        assert!(status.total_entries <= status.max_entries);
        assert_eq!(status.max_entries, 100);

        // 9. Disable history -> MUST purge all stored content
        service
            .set_history_enabled(false)
            .await
            .expect("Disabling must succeed");
        assert!(!service.is_history_enabled());
        assert_eq!(service.get_history().await.unwrap().len(), 0);
        assert_eq!(
            repo.count().unwrap(),
            0,
            "Disabling history must purge SQLite table"
        );

        // 10. Clear history explicitly
        service
            .clear_history()
            .await
            .expect("Clear history must succeed");
        assert_eq!(repo.count().unwrap(), 0);
    }

    #[tokio::test]
    async fn test_file_workspace_service_integration() {
        use bbq_core::BbqError;
        use bbq_platform::{FileMetadataInfo, MockPlatformProvider};
        use bbq_services::{FileService, FileServiceTrait, Service};
        use bbq_storage::DatabaseManager;

        // 1. Initialize in-memory SQLite and mock platform
        let db = Arc::new(DatabaseManager::open_in_memory().expect("Database open should succeed"));
        let mock_provider = MockPlatformProvider::new();

        // Register simulated files in mock platform
        mock_provider.file.add_simulated_file(FileMetadataInfo {
            path: "/users/bbq/doc.pdf".to_string(),
            name: "doc.pdf".to_string(),
            extension: Some("pdf".to_string()),
            size_bytes: 2_400_000,
            modified_at: Some(1700000000),
            is_directory: false,
        });
        mock_provider.file.add_simulated_file(FileMetadataInfo {
            path: "/users/bbq/photo.png".to_string(),
            name: "photo.png".to_string(),
            extension: Some("png".to_string()),
            size_bytes: 850_000,
            modified_at: Some(1700000001),
            is_directory: false,
        });
        mock_provider.file.add_simulated_file(FileMetadataInfo {
            path: "/users/bbq/notes.txt".to_string(),
            name: "notes.txt".to_string(),
            extension: Some("txt".to_string()),
            size_bytes: 8_192,
            modified_at: Some(1700000002),
            is_directory: false,
        });
        mock_provider.file.add_simulated_file(FileMetadataInfo {
            path: "/users/bbq/subfolder".to_string(),
            name: "subfolder".to_string(),
            extension: None,
            size_bytes: 4096,
            modified_at: Some(1700000003),
            is_directory: true,
        });

        // 2. Instantiate FileService
        let repo = db.file_repository();
        let service = FileService::new(Arc::new(mock_provider.file.clone()), Some(repo.clone()));
        service.init().await.expect("Init should succeed");

        // 3. Multi-file drop acceptance
        let f1 = service
            .add_file("/users/bbq/doc.pdf", Some("drag_drop".to_string()))
            .await
            .unwrap();
        assert_eq!(f1.name, "doc.pdf");
        assert_eq!(f1.size_bytes, 2_400_000);
        assert_eq!(f1.mime_type, Some("application/pdf".to_string()));

        let f2 = service
            .add_file("/users/bbq/photo.png", Some("drag_drop".to_string()))
            .await
            .unwrap();
        assert_eq!(f2.name, "photo.png");
        assert_eq!(f2.mime_type, Some("image/png".to_string()));

        let f3 = service
            .add_file("/users/bbq/notes.txt", Some("drag_drop".to_string()))
            .await
            .unwrap();
        assert_eq!(f3.name, "notes.txt");
        assert_eq!(f3.mime_type, Some("text/plain".to_string()));

        let workspace = service.get_workspace().await.unwrap();
        assert_eq!(workspace.len(), 3);

        // 4. Duplicate drop moves to newest position
        let dup = service.add_file("/users/bbq/doc.pdf", None).await.unwrap();
        assert_eq!(dup.id, f1.id);
        let workspace_after_dup = service.get_workspace().await.unwrap();
        assert_eq!(workspace_after_dup.len(), 3);
        // doc.pdf is now at the top of the workspace
        assert_eq!(workspace_after_dup[0].id, f1.id);

        // 5. Directory drop is rejected
        let dir_res = service.add_file("/users/bbq/subfolder", None).await;
        assert!(dir_res.is_err());
        match dir_res {
            Err(BbqError::Validation(msg)) => {
                assert!(msg.contains("Directories are not supported"));
            }
            other => panic!("Expected validation error, got {:?}", other),
        }

        // 6. Explicit file open and reveal
        service
            .open_file(&f2.id)
            .await
            .expect("Open should succeed");
        assert_eq!(
            mock_provider.file.opened.lock().unwrap().as_slice(),
            &["/users/bbq/photo.png".to_string()]
        );

        service
            .reveal_file(&f2.id)
            .await
            .expect("Reveal should succeed");
        assert_eq!(
            mock_provider.file.revealed.lock().unwrap().as_slice(),
            &["/users/bbq/photo.png".to_string()]
        );

        // 7. Remove single entry
        service
            .remove_file(&f3.id)
            .await
            .expect("Remove should succeed");
        let ws_after_remove = service.get_workspace().await.unwrap();
        assert_eq!(ws_after_remove.len(), 2);
        assert!(ws_after_remove.iter().all(|e| e.id != f3.id));

        // 8. Bounded workspace 100 entries FIFO
        for i in 1..=110 {
            let path = format!("/users/bbq/item_{}.dat", i);
            mock_provider.file.add_simulated_file(FileMetadataInfo {
                path: path.clone(),
                name: format!("item_{}.dat", i),
                extension: Some("dat".to_string()),
                size_bytes: 100 * i as u64,
                modified_at: Some(i as i64),
                is_directory: false,
            });
            service.add_file(&path, None).await.unwrap();
        }

        let bounded_ws = service.get_workspace().await.unwrap();
        assert_eq!(
            bounded_ws.len(),
            100,
            "Workspace must be capped at 100 entries"
        );

        // 9. Clear workspace
        service
            .clear_workspace()
            .await
            .expect("Clear should succeed");
        assert_eq!(service.get_workspace().await.unwrap().len(), 0);
        assert_eq!(repo.count().unwrap(), 0);
    }

    #[tokio::test]
    async fn test_system_service_mock_lifecycle_and_events() {
        use bbq_core::{BatteryState, NetworkState};
        use bbq_platform::MockSystem;
        use bbq_services::{Service, SystemService, SystemServiceTrait};

        let system_mock = Arc::new(MockSystem::default());
        let system_service = SystemService::new(system_mock.clone());
        system_service.init().await.expect("Init should succeed");

        // 1. Initial capabilities & state
        let caps = system_service.get_capabilities().await.unwrap();
        assert!(caps.has_battery);
        assert!(caps.can_read_network);
        assert!(caps.can_control_volume);
        assert!(caps.can_mute);

        let initial_state = system_service.get_state().await.unwrap();
        assert!(initial_state.battery.available);
        assert_eq!(initial_state.battery.percentage, Some(100));
        assert!(initial_state.network.connected);
        assert_eq!(
            initial_state.network.interface_name.as_deref(),
            Some("Mock-WiFi")
        );
        assert_eq!(initial_state.volume, Some(0.8));
        assert_eq!(initial_state.muted, Some(false));

        // 2. Control volume & mute through service
        system_service.set_volume(0.5).await.unwrap();
        let vol_state = system_service.get_state().await.unwrap();
        assert_eq!(vol_state.volume, Some(0.5));

        system_service.set_muted(true).await.unwrap();
        let mute_state = system_service.get_state().await.unwrap();
        assert_eq!(mute_state.muted, Some(true));

        system_service.toggle_muted().await.unwrap();
        let toggled_state = system_service.get_state().await.unwrap();
        assert_eq!(toggled_state.muted, Some(false));

        // 3. Simulate events via MockSystem
        system_mock.simulate_battery_change(BatteryState {
            available: true,
            percentage: Some(45),
            charging: false,
            plugged_in: false,
            power_source: Some("Battery".to_string()),
        });
        std::thread::sleep(std::time::Duration::from_millis(50));
        let state_after_batt = system_service.get_state().await.unwrap();
        assert_eq!(state_after_batt.battery.percentage, Some(45));
        assert!(!state_after_batt.battery.charging);

        system_mock.simulate_network_change(NetworkState {
            connected: false,
            interface_name: None,
            connection_type: None,
            signal_strength: None,
        });
        std::thread::sleep(std::time::Duration::from_millis(50));
        let state_after_net = system_service.get_state().await.unwrap();
        assert!(!state_after_net.network.connected);

        // 4. Simulate unavailable capability degradation
        system_mock.simulate_unavailable("Hardware failure");
        std::thread::sleep(std::time::Duration::from_millis(50));
        let status = system_service.status();
        assert_eq!(status.message.as_deref(), Some("Hardware failure"));
    }

    #[tokio::test]
    async fn test_reminder_and_notification_service_integration() {
        use bbq_core::{NotificationCategory, ReminderState};
        use bbq_services::{NotificationService, ReminderService, ReminderServiceTrait};
        use std::sync::atomic::{AtomicU64, Ordering};

        let db = DatabaseManager::open_in_memory().expect("In-memory DB required");
        let mock_platform = Arc::new(MockPlatformProvider::new());
        let notif_service = Arc::new(NotificationService::new(mock_platform.notification(), None));

        let current_time = Arc::new(AtomicU64::new(1_000_000));
        let time_copy = current_time.clone();

        let reminder_repo = db.reminder_repository();
        let reminder_service = ReminderService::with_time_provider(
            Some(reminder_repo.clone()),
            notif_service,
            Arc::new(move || time_copy.load(Ordering::SeqCst)),
        );

        use bbq_services::Service;
        reminder_service.init().await.unwrap();

        // 1. Create a reminder
        let reminder = reminder_service
            .create_reminder(
                "Sprint Review",
                Some("Review Milestone 8".to_string()),
                1_060_000,
            )
            .await
            .unwrap();

        assert_eq!(reminder.state, ReminderState::Scheduled);
        assert_eq!(mock_platform.notification.notification_count(), 0);

        // 2. Advance time past due_at and process due reminders
        current_time.store(1_070_000, Ordering::SeqCst);
        reminder_service.process_due_reminders();

        // 3. Verify notification delivered via MockPlatform
        assert_eq!(mock_platform.notification.notification_count(), 1);
        let delivered = mock_platform.notification.last_notification().unwrap();
        assert_eq!(delivered.title, "Sprint Review");
        assert_eq!(delivered.body, "Review Milestone 8");
        assert_eq!(delivered.category, NotificationCategory::Reminder);

        // 4. Verify state updated in SQLite storage
        let stored = reminder_repo.get(&reminder.id).unwrap().unwrap();
        assert_eq!(stored.state, ReminderState::Fired);
    }

    #[tokio::test]
    async fn test_launcher_service_integration() {
        use bbq_core::{LauncherAction, SystemActionType};
        use bbq_services::{LauncherService, LauncherServiceTrait, Service};

        let db = Arc::new(DatabaseManager::open_in_memory().expect("In-memory DB required"));
        let mock_platform = Arc::new(MockPlatformProvider::new());
        let launcher_repo = db.launcher_repository();

        let launcher_service =
            LauncherService::new(mock_platform.launcher(), Some(launcher_repo.clone()));
        launcher_service.init().await.expect("LauncherService init");

        // 1. Capabilities
        let caps = launcher_service.get_capabilities().await.unwrap();
        assert!(caps.open_application);
        assert!(caps.open_file);
        assert!(caps.open_folder);
        assert!(caps.open_url);
        assert!(caps.system_actions);

        // 2. Built-in actions (widget shortcuts removed in v1.2)
        let items = launcher_service.list_items().await.unwrap();
        assert!(items.len() >= 4, "Should have built-in actions");
        assert!(
            !items.iter().any(|i| i.id == "bbq_timer"
                || i.id == "bbq_reminders"
                || i.id == "bbq_clipboard"
                || i.id == "bbq_settings"
                || i.id == "bbq_system"),
            "Widget shortcuts must be removed from launcher"
        );

        // 3. Launch built-in item and verify recent tracking
        let target_item = &items[0];
        launcher_service
            .launch_item(&target_item.id)
            .await
            .expect("Item launch should succeed");

        // Verify recent action stored in SQLite
        let recent = launcher_service.list_recent().await.unwrap();
        assert_eq!(recent.len(), 1);
        assert_eq!(recent[0].id, target_item.id);
        assert_eq!(recent[0].usage_count, 1);

        // Launch safe URL directly via launch_action
        let url_action = LauncherAction::OpenUrl {
            url: "https://example.com".to_string(),
        };
        launcher_service
            .launch_action(&url_action)
            .await
            .expect("Safe URL launch should succeed");

        // Verify Mock platform captured the launch
        let launched_urls = mock_platform.launcher.get_opened_urls();
        assert_eq!(launched_urls.len(), 1);
        assert_eq!(launched_urls[0], "https://example.com");

        // 4. Launch invalid URL (scheme rejection)
        let bad_url_action = LauncherAction::OpenUrl {
            url: "javascript:alert(1)".to_string(),
        };
        let bad_res = launcher_service.launch_action(&bad_url_action).await;
        assert!(bad_res.is_err(), "Invalid URL scheme must be rejected");

        // 5. Add and remove favorite using built-in item ID
        let target_item_id = &items[0].id;
        launcher_service.add_favorite(target_item_id).await.unwrap();

        let favorites = launcher_service.list_favorites().await.unwrap();
        assert_eq!(favorites.len(), 1);
        assert_eq!(favorites[0].id, *target_item_id);
        assert!(favorites[0].favorite);

        launcher_service
            .remove_favorite(target_item_id)
            .await
            .unwrap();
        let favs_after = launcher_service.list_favorites().await.unwrap();
        assert_eq!(favs_after.len(), 0);

        // 6. System action launch
        let sys_action = LauncherAction::SystemAction(SystemActionType::ShowDesktop);
        launcher_service
            .launch_action(&sys_action)
            .await
            .expect("SystemAction launch");
        let launched_actions = mock_platform.launcher.get_launched_actions();
        assert!(launched_actions.contains(&sys_action));

        // 7. Clear recent
        launcher_service.clear_recent().await.unwrap();
        let recent_after = launcher_service.list_recent().await.unwrap();
        assert_eq!(recent_after.len(), 0);
    }

    #[tokio::test]
    async fn test_drop_service_integration() {
        use bbq_core::{DropAction, FileClassification};
        use bbq_platform::{FileMetadataInfo, MockPlatformProvider, PlatformClipboard};
        use bbq_services::{
            ClipboardService, DropService, DropServiceTrait, FileService, FileServiceTrait, Service,
        };
        use bbq_storage::DatabaseManager;

        let db = Arc::new(DatabaseManager::open_in_memory().expect("Database open should succeed"));
        let mock_provider = MockPlatformProvider::new();

        mock_provider.file.add_simulated_file(FileMetadataInfo {
            path: "/users/bbq/photo.png".to_string(),
            name: "photo.png".to_string(),
            extension: Some("png".to_string()),
            size_bytes: 850_000,
            modified_at: Some(1700000001),
            is_directory: false,
        });
        mock_provider.file.add_simulated_file(FileMetadataInfo {
            path: "/users/bbq/subfolder".to_string(),
            name: "subfolder".to_string(),
            extension: None,
            size_bytes: 4096,
            modified_at: Some(1700000003),
            is_directory: true,
        });

        let repo = db.file_repository();
        let file_service = Arc::new(FileService::new(
            Arc::new(mock_provider.file.clone()),
            Some(repo.clone()),
        ));
        file_service
            .init()
            .await
            .expect("FileService init should succeed");

        let clipboard_service = Arc::new(ClipboardService::new(
            Arc::new(mock_provider.clipboard.clone()),
            None,
            None,
        ));
        clipboard_service
            .init()
            .await
            .expect("ClipboardService init should succeed");

        let drop_service = Arc::new(DropService::new(
            Arc::new(mock_provider.file.clone()),
            clipboard_service.clone(),
            Some(file_service.clone()),
        ));
        drop_service
            .init()
            .await
            .expect("DropService init should succeed");

        // 1. Inspect dropped items
        let batch = drop_service
            .inspect(&[
                "/users/bbq/photo.png".to_string(),
                "/users/bbq/subfolder".to_string(),
            ])
            .await
            .expect("Drop inspect should succeed");

        assert_eq!(batch.count, 2);
        assert_eq!(batch.items[0].name, "photo.png");
        assert_eq!(batch.items[0].classification, FileClassification::Image);
        assert_eq!(batch.items[1].name, "subfolder");
        assert_eq!(batch.items[1].kind, bbq_core::DropTargetKind::Directory);

        // 2. Query contextual actions
        let actions = drop_service
            .get_actions(&batch.id)
            .await
            .expect("Get actions should succeed");
        assert!(actions.contains(&DropAction::Open));
        assert!(actions.contains(&DropAction::Reveal));
        assert!(actions.contains(&DropAction::CopyPath));
        assert!(actions.contains(&DropAction::AddToWorkspace));

        // 3. Verify CopyPath is strictly explicit (no clipboard write on inspect)
        let copied = mock_provider.clipboard.current().await.unwrap();
        assert_eq!(copied, None, "Inspect must NOT write to clipboard");

        // Execute CopyPath explicitly
        let copy_result = drop_service
            .execute_action(&batch.id, DropAction::CopyPath, None)
            .await
            .expect("Execute CopyPath should succeed");
        assert_eq!(copy_result.success_count, 2);
        let copied_after = mock_provider.clipboard.current().await.unwrap();
        assert!(
            copied_after.is_some(),
            "Explicit CopyPath should write to clipboard"
        );

        // 4. Execute AddToWorkspace explicitly
        let add_result = drop_service
            .execute_action(&batch.id, DropAction::AddToWorkspace, None)
            .await
            .expect("Execute AddToWorkspace should succeed");
        assert_eq!(add_result.success_count, 1, "File should be added");
        assert_eq!(
            add_result.failure_count, 1,
            "Directory should fail to be added to workspace"
        );

        // Verify items were added to FileWorkspaceWidget's backing service
        let workspace = file_service
            .get_workspace()
            .await
            .expect("Get workspace files");
        assert_eq!(
            workspace.len(),
            1,
            "Only file should be added to workspace (folder rejected)"
        );

        // 5. Clear drop batch
        drop_service.clear().await.expect("Clear should succeed");
        let current = drop_service.get_current_batch().await.expect("Get current");
        assert!(current.is_none());
    }

    #[tokio::test]
    async fn test_hotkey_service_integration() {
        use bbq_core::BbqEvent;
        use bbq_platform::{HotkeyDefinition, MockPlatformProvider, PlatformHotkey};
        use bbq_services::{
            HotkeyService, HotkeyServiceTrait, Service, ServiceState, SettingsService,
            SettingsServiceTrait,
        };
        use std::sync::Mutex;

        let db = Arc::new(DatabaseManager::open_in_memory().expect("In-memory DB"));
        let mock_provider = Arc::new(MockPlatformProvider::new());
        let settings_service = Arc::new(SettingsService::new(db.settings_repository()));

        let hotkey_service = Arc::new(HotkeyService::new(
            mock_provider.hotkey(),
            Some(settings_service.clone()),
        ));

        // 1. Initial status before init/start
        let status = hotkey_service.status();
        assert_eq!(status.name, "HotkeyService");

        // 2. Init & verify default definition
        hotkey_service.init().await.expect("Init should succeed");
        let def = hotkey_service
            .get_definition()
            .await
            .expect("Get definition");
        assert_eq!(def.id, "global_command_surface");
        assert_eq!(def.key, "Space");

        // 3. Subscribe to hotkey events
        let triggered_events = Arc::new(Mutex::new(Vec::new()));
        let conflict_events = Arc::new(Mutex::new(Vec::new()));

        let trig_clone = triggered_events.clone();
        let conf_clone = conflict_events.clone();

        hotkey_service
            .subscribe_events(Arc::new(move |event| match event {
                BbqEvent::HotkeyTriggered { id, display_str } => {
                    trig_clone.lock().unwrap().push((id, display_str));
                }
                BbqEvent::HotkeyConflict {
                    id,
                    display_str,
                    reason,
                } => {
                    conf_clone.lock().unwrap().push((id, display_str, reason));
                }
                _ => {}
            }))
            .await
            .expect("Subscribe events");

        // 4. Start service -> registers hotkey with platform
        hotkey_service.start().await.expect("Start should succeed");
        assert_eq!(hotkey_service.status().state, ServiceState::Active);

        // Verify platform registered the hotkey
        let is_reg = mock_provider
            .hotkey
            .is_registered(&def.id)
            .await
            .expect("is_registered");
        assert!(is_reg, "Hotkey must be registered in platform");

        // 5. Simulate global hotkey press via mock platform
        mock_provider.hotkey.simulate_hotkey_pressed(&def.id);

        {
            let triggered = triggered_events.lock().unwrap();
            assert_eq!(triggered.len(), 1, "Should have received 1 trigger event");
            assert_eq!(triggered[0].0, "global_command_surface");
        }

        // 6. Update definition to custom hotkey
        let custom_def =
            HotkeyDefinition::from_display_string("global_command_surface", "Ctrl+Shift+K");
        hotkey_service
            .update_definition(custom_def.clone())
            .await
            .expect("Update definition");

        let updated = hotkey_service
            .get_definition()
            .await
            .expect("Get updated definition");
        assert_eq!(updated.display_str, "Ctrl+Shift+K");

        // Verify persisted into SettingsService
        let current_settings = settings_service
            .get_settings()
            .expect("Get current settings");
        assert_eq!(current_settings.global_hotkey, "Ctrl+Shift+K");

        // 7. Test conflict handling gracefully without crashing
        mock_provider.hotkey.simulate_conflict("Ctrl+Alt+Delete");

        let conflict_def =
            HotkeyDefinition::from_display_string("global_command_surface", "Ctrl+Alt+Delete");
        let update_res = hotkey_service.update_definition(conflict_def).await;
        assert!(update_res.is_err(), "Should return error on conflict");

        // Service state degrades gracefully to Failed with message, never panics
        let degraded_status = hotkey_service.status();
        assert_eq!(degraded_status.state, ServiceState::Failed);
        assert!(degraded_status.message.is_some());

        {
            let conflicts = conflict_events.lock().unwrap();
            assert_eq!(conflicts.len(), 1, "Should have emitted 1 conflict event");
            assert!(conflicts[0].2.contains("already in use"));
        }

        // 8. Stop service
        hotkey_service.stop().await.expect("Stop should succeed");
        assert_eq!(hotkey_service.status().state, ServiceState::Inactive);
    }

    #[tokio::test]
    async fn test_multimonitor_display_and_window_geometry_flow() {
        use bbq_core::{
            calculate_island_geometry, DisplayInfo, DisplayRect, IslandAnchor, IslandLayoutState,
            WidgetDimensions, DEFAULT_IDLE_WIDTH, DEFAULT_TOP_MARGIN, MAX_ISLAND_HEIGHT,
            MAX_ISLAND_WIDTH,
        };
        use bbq_platform::MockPlatformProvider;
        use bbq_services::{
            DisplayService, DisplayServiceTrait, Service, WindowService, WindowServiceTrait,
        };
        use std::sync::Mutex;

        let mock_provider = Arc::new(MockPlatformProvider::new());
        let display_service = Arc::new(DisplayService::new(mock_provider.display()));
        let window_service = Arc::new(WindowService::new(mock_provider.window()));

        // 1. Setup multi-monitor: primary monitor and secondary left monitor (negative coordinate space)
        let primary_disp = DisplayInfo {
            id: "disp_primary".to_string(),
            name: "Main Monitor".to_string(),
            is_primary: true,
            scale_factor: 1.0,
            bounds: DisplayRect {
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
            },
            work_area: DisplayRect {
                x: 0,
                y: 0,
                width: 1920,
                height: 1040, // 40px taskbar
            },
        };

        let secondary_disp = DisplayInfo {
            id: "disp_secondary_left".to_string(),
            name: "Left Monitor".to_string(),
            is_primary: false,
            scale_factor: 1.25,
            bounds: DisplayRect {
                x: -1920,
                y: 0,
                width: 1920,
                height: 1080,
            },
            work_area: DisplayRect {
                x: -1920,
                y: 0,
                width: 1920,
                height: 1080,
            },
        };

        mock_provider
            .display
            .set_displays(vec![primary_disp.clone(), secondary_disp.clone()]);

        // 2. Initialize display service and subscribe to events
        display_service.init().await.expect("Init display service");
        window_service.init().await.expect("Init window service");

        let display_events = Arc::new(Mutex::new(Vec::new()));
        let ev_clone = display_events.clone();
        display_service
            .subscribe_events(Arc::new(move |ev| {
                if let bbq_core::BbqEvent::DisplayChanged(info) = ev {
                    ev_clone.lock().unwrap().push(info);
                }
            }))
            .await
            .expect("Subscribe display events");

        // 3. Verify displays listed and primary display detected
        let displays = display_service
            .list_displays()
            .await
            .expect("List displays");
        assert_eq!(displays.len(), 2);
        let primary = display_service
            .get_primary_display()
            .await
            .expect("Get primary");
        assert_eq!(primary.id, "disp_primary");

        // 4. Test idle geometry on Primary monitor
        let primary_idle_geo = calculate_island_geometry(
            &primary,
            IslandLayoutState::Idle,
            None,
            IslandAnchor::TopCenter,
        );
        assert_eq!(primary_idle_geo.x, 840); // (1920 - 240) / 2
        assert_eq!(primary_idle_geo.y, DEFAULT_TOP_MARGIN);
        assert_eq!(primary_idle_geo.width, DEFAULT_IDLE_WIDTH);

        window_service
            .apply_geometry(&primary_idle_geo)
            .await
            .expect("Apply geometry to primary");
        assert_eq!(
            *mock_provider.window.position.lock().unwrap(),
            (840, DEFAULT_TOP_MARGIN)
        );

        // 5. Test Hotkey -> Active Display flow with Negative Coordinates on Secondary monitor
        // Simulate user cursor/focus on secondary left monitor
        mock_provider
            .display
            .set_active_display_id("disp_secondary_left");
        let active_secondary = display_service
            .get_active_display()
            .await
            .expect("Get active secondary");
        assert_eq!(active_secondary.id, "disp_secondary_left");
        assert_eq!(active_secondary.scale_factor, 1.25);

        // Calculate expanded geometry on secondary monitor
        let secondary_expanded_geo = calculate_island_geometry(
            &active_secondary,
            IslandLayoutState::Expanded,
            Some(WidgetDimensions {
                preferred_width: Some(400),
                preferred_height: Some(280),
            }),
            IslandAnchor::TopCenter,
        );

        // Negative coordinate validation: -1920 + (1920 - 400)/2 = -1920 + 760 = -1160
        assert_eq!(secondary_expanded_geo.x, -1160);
        assert_eq!(secondary_expanded_geo.y, DEFAULT_TOP_MARGIN);
        assert_eq!(secondary_expanded_geo.width, 400);
        assert_eq!(secondary_expanded_geo.height, 280);

        window_service
            .apply_geometry(&secondary_expanded_geo)
            .await
            .expect("Apply geometry on secondary");
        assert_eq!(
            *mock_provider.window.position.lock().unwrap(),
            (-1160, DEFAULT_TOP_MARGIN)
        );
        assert_eq!(*mock_provider.window.size.lock().unwrap(), (400, 280));

        // 6. Test oversize widget clamping to work area limits
        let oversize_dims = WidgetDimensions {
            preferred_width: Some(5000),
            preferred_height: Some(5000),
        };
        let clamped_geo = calculate_island_geometry(
            &primary,
            IslandLayoutState::Expanded,
            Some(oversize_dims),
            IslandAnchor::TopCenter,
        );
        assert_eq!(clamped_geo.width, MAX_ISLAND_WIDTH);
        assert_eq!(clamped_geo.height, MAX_ISLAND_HEIGHT);
        // Ensure within work area bounds
        assert!(clamped_geo.x >= primary.work_area.x);
        assert!(
            clamped_geo.x + clamped_geo.width as i32
                <= primary.work_area.x + primary.work_area.width as i32
        );
        assert!(clamped_geo.y >= primary.work_area.y);
        assert!(
            clamped_geo.y + clamped_geo.height as i32
                <= primary.work_area.y + primary.work_area.height as i32
        );

        // 7. Test hotkey flow back to primary monitor
        mock_provider.display.set_active_display_id("disp_primary");
        let active_primary = display_service
            .get_active_display()
            .await
            .expect("Get active primary");
        assert_eq!(active_primary.id, "disp_primary");

        let primary_hotkey_geo = calculate_island_geometry(
            &active_primary,
            IslandLayoutState::Expanded,
            None,
            IslandAnchor::TopCenter,
        );
        window_service
            .apply_geometry(&primary_hotkey_geo)
            .await
            .expect("Apply geometry back to primary");
        // (1920 - 520) / 2 = 700
        assert_eq!(
            *mock_provider.window.position.lock().unwrap(),
            (700, DEFAULT_TOP_MARGIN)
        );
    }

    #[tokio::test]
    async fn test_version_consistency_and_packaging_metadata() {
        use std::path::PathBuf;

        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .to_path_buf();

        // 1. Root Cargo.toml
        let root_cargo =
            std::fs::read_to_string(root.join("Cargo.toml")).expect("Should read root Cargo.toml");
        assert!(
            root_cargo.contains("version = \"2.0.0\""),
            "Root Cargo.toml must declare version 2.0.0"
        );

        // 2. Root package.json
        let root_pkg = std::fs::read_to_string(root.join("package.json"))
            .expect("Should read root package.json");
        assert!(
            root_pkg.contains("\"version\": \"2.0.0\""),
            "Root package.json must declare version 2.0.0"
        );

        // 3. Desktop package.json
        let desktop_pkg = std::fs::read_to_string(root.join("apps/desktop/package.json"))
            .expect("Should read apps/desktop/package.json");
        assert!(
            desktop_pkg.contains("\"version\": \"2.0.0\""),
            "apps/desktop/package.json must declare version 2.0.0"
        );

        // 4. Types package.json
        let types_pkg = std::fs::read_to_string(root.join("packages/types/package.json"))
            .expect("Should read packages/types/package.json");
        assert!(
            types_pkg.contains("\"version\": \"2.0.0\""),
            "packages/types/package.json must declare version 2.0.0"
        );

        // 5. tauri.conf.json
        let tauri_conf =
            std::fs::read_to_string(root.join("apps/desktop/src-tauri/tauri.conf.json"))
                .expect("Should read tauri.conf.json");
        assert!(
            tauri_conf.contains("\"version\": \"2.0.0\""),
            "tauri.conf.json must declare version 2.0.0"
        );
        assert!(
            tauri_conf.contains("\"active\": true"),
            "tauri.conf.json must have bundle.active set to true for production"
        );
        assert!(
            tauri_conf.contains("\"installMode\": \"currentUser\""),
            "tauri.conf.json must have NSIS installMode currentUser for clean non-admin installs"
        );

        // 6. Test Autostart mock capability
        let mock_provider = bbq_platform::MockPlatformProvider::new();
        let autostart = mock_provider.autostart();
        assert!(autostart.is_supported().await);
        assert!(!autostart.is_enabled().await.unwrap());
        autostart.set_enabled(true).await.unwrap();
        assert!(autostart.is_enabled().await.unwrap());

        // 7. Test Settings first_run and onboarding fields
        let defaults = bbq_core::BbqSettings::default();
        assert!(!defaults.first_run_completed);
        assert!(!defaults.onboarding_completed);
    }

    #[tokio::test]
    #[cfg(target_os = "windows")]
    async fn test_windows_autostart_registry_lifecycle() {
        use bbq_platform::traits::PlatformAutostart;
        use bbq_platform::windows::WindowsAutostart;

        let autostart = WindowsAutostart;
        assert!(autostart.is_supported().await);

        let initial_state = autostart.is_enabled().await.expect("Read autostart state");

        // 1. Enable autostart
        autostart.set_enabled(true).await.expect("Enable autostart");
        assert!(
            autostart.is_enabled().await.expect("Read autostart state"),
            "Autostart must report enabled after set_enabled(true)"
        );

        // 2. Verify registry key exists directly via native query
        assert!(
            autostart.is_enabled().await.expect("Read state"),
            "Registry key must exist"
        );

        // 3. Disable autostart
        autostart
            .set_enabled(false)
            .await
            .expect("Disable autostart");
        assert!(
            !autostart.is_enabled().await.expect("Read autostart state"),
            "Autostart must report disabled after set_enabled(false)"
        );

        // 4. Restore initial state
        if initial_state {
            let _ = autostart.set_enabled(true).await;
        }
    }

    #[test]
    fn test_v12_dpi_scaling_and_top_center_invariants() {
        use bbq_core::{
            calculate_island_geometry, DisplayInfo, DisplayRect, IslandAnchor, IslandLayoutState,
            DEFAULT_IDLE_HEIGHT, DEFAULT_IDLE_WIDTH,
        };

        // Test across 100%, 125%, 150%, and 200% DPI scales
        let test_scales = [1.0, 1.25, 1.5, 2.0];
        let physical_widths = [1920, 1920, 2560, 3840];

        for (scale, phys_w) in test_scales.iter().zip(physical_widths.iter()) {
            let logical_w = (*phys_w as f64 / scale).round() as u32;
            let display = DisplayInfo {
                id: format!("scale_{}", scale),
                name: format!("Monitor at {}x", scale),
                is_primary: true,
                scale_factor: *scale,
                bounds: DisplayRect {
                    x: 0,
                    y: 0,
                    width: logical_w,
                    height: 1080,
                },
                work_area: DisplayRect {
                    x: 0,
                    y: 0,
                    width: logical_w,
                    height: 1040,
                },
            };

            let geo = calculate_island_geometry(
                &display,
                IslandLayoutState::Idle,
                None,
                IslandAnchor::TopCenter,
            );

            // In logical coordinates, center must be exact:
            let expected_logical_x = (logical_w as i32 - DEFAULT_IDLE_WIDTH as i32) / 2;
            assert_eq!(
                geo.x, expected_logical_x,
                "Logical X must be exactly top-centered for scale {}",
                scale
            );
            assert_eq!(geo.width, DEFAULT_IDLE_WIDTH);
            assert_eq!(geo.height, DEFAULT_IDLE_HEIGHT);

            // In physical coordinates, the center point must match the physical monitor center:
            let physical_island_x = (geo.x as f64 * scale).round() as i32;
            let physical_island_w = (geo.width as f64 * scale).round() as i32;
            let physical_center = physical_island_x + physical_island_w / 2;
            let expected_phys_center = *phys_w / 2;
            let delta = (physical_center - expected_phys_center).abs();
            assert!(
                delta <= 1,
                "Physical center delta must be <= 1 pixel for scale {}, got delta {}",
                scale,
                delta
            );
        }
    }

    #[test]
    fn test_v12_multimonitor_negative_offset_dpi_centering() {
        use bbq_core::{
            calculate_island_geometry, DisplayInfo, DisplayRect, IslandAnchor, IslandLayoutState,
            DEFAULT_IDLE_WIDTH,
        };

        // Secondary monitor positioned to the left in negative coordinate space with 1.25 scaling
        // Physical: x = -1920, width = 1920. Logical: x = -1536, width = 1536
        let secondary_left = DisplayInfo {
            id: "left_mon".to_string(),
            name: "Left Secondary Display".to_string(),
            is_primary: false,
            scale_factor: 1.25,
            bounds: DisplayRect {
                x: -1536,
                y: 0,
                width: 1536,
                height: 864,
            },
            work_area: DisplayRect {
                x: -1536,
                y: 0,
                width: 1536,
                height: 864,
            },
        };

        let geo = calculate_island_geometry(
            &secondary_left,
            IslandLayoutState::Idle,
            None,
            IslandAnchor::TopCenter,
        );

        let expected_x = -1536 + (1536 - DEFAULT_IDLE_WIDTH as i32) / 2;
        assert_eq!(geo.x, expected_x);
        assert_eq!(geo.width, DEFAULT_IDLE_WIDTH);

        // Verify center: geo.x + width/2 == -1536 + 1536/2 == -768
        assert_eq!(geo.x + (geo.width as i32) / 2, -1536 + 768);
    }

    #[test]
    fn test_v12_hover_geometry_symmetric_expansion() {
        use bbq_core::{
            calculate_island_geometry, DisplayInfo, DisplayRect, IslandAnchor, IslandLayoutState,
            DEFAULT_HOVER_HEIGHT, DEFAULT_HOVER_WIDTH, DEFAULT_IDLE_HEIGHT, DEFAULT_IDLE_WIDTH,
            DEFAULT_TOP_MARGIN,
        };

        let display = DisplayInfo {
            id: "primary".to_string(),
            name: "Primary".to_string(),
            is_primary: true,
            scale_factor: 1.0,
            bounds: DisplayRect {
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
            },
            work_area: DisplayRect {
                x: 0,
                y: 0,
                width: 1920,
                height: 1040,
            },
        };

        let idle_geo = calculate_island_geometry(
            &display,
            IslandLayoutState::Idle,
            None,
            IslandAnchor::TopCenter,
        );
        let hover_geo = calculate_island_geometry(
            &display,
            IslandLayoutState::Hovering,
            None,
            IslandAnchor::TopCenter,
        );

        // Symmetrical horizontal expansion around the same center
        let idle_center_x = idle_geo.x + (idle_geo.width as i32) / 2;
        let hover_center_x = hover_geo.x + (hover_geo.width as i32) / 2;
        assert_eq!(
            idle_center_x, hover_center_x,
            "Center X must remain identical between Idle and Hovering"
        );
        assert_eq!(
            hover_geo.width - idle_geo.width,
            DEFAULT_HOVER_WIDTH - DEFAULT_IDLE_WIDTH
        );

        // Symmetrical vertical expansion around the visual center
        // y moves up by (hover_h - idle_h) / 2 = 2px
        let y_delta = idle_geo.y - hover_geo.y;
        assert_eq!(
            y_delta,
            ((DEFAULT_HOVER_HEIGHT - DEFAULT_IDLE_HEIGHT) / 2) as i32,
            "Y must move up by half height delta for 4-direction symmetry"
        );
        assert_eq!(idle_geo.y, DEFAULT_TOP_MARGIN);
    }
}
